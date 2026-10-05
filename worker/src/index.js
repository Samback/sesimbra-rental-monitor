import { buildPushPayload } from "@block65/webcrypto-web-push";

const SUB_PREFIX = "subscription:";
const EVENT_PREFIX = "sent:";
const ALLOWED_EVENT_TYPES = new Set(["new", "relisted", "price_changed", "terms_changed"]);
const ALLOWED_PUSH_HOSTS = [
  "push.apple.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "notify.windows.com"
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const corsHeaders = origin === env.ALLOWED_ORIGIN ? {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    } : {};

    if (request.method === "OPTIONS") {
      if (origin !== env.ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      if (url.pathname === "/health" && request.method === "GET") {
        return json({ ok: true, configured: Boolean(env.PUSH_STATE && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.NOTIFY_TOKEN) }, 200, corsHeaders);
      }

      if (origin && origin !== env.ALLOWED_ORIGIN && url.pathname !== "/notify") {
        return json({ error: "origin_not_allowed" }, 403, {});
      }

      if (url.pathname === "/vapid-public-key" && request.method === "GET") {
        if (origin !== env.ALLOWED_ORIGIN) return json({ error: "origin_not_allowed" }, 403, {});
        if (!env.VAPID_PUBLIC_KEY) return json({ error: "push_not_configured" }, 503, corsHeaders);
        return json({ publicKey: env.VAPID_PUBLIC_KEY }, 200, corsHeaders);
      }

      if (url.pathname === "/subscribe" && request.method === "POST") {
        if (origin !== env.ALLOWED_ORIGIN) return json({ error: "origin_not_allowed" }, 403, {});
        if (!env.PUSH_STATE) return json({ error: "storage_not_configured" }, 503, corsHeaders);
        const subscription = await readJson(request, 8192);
        const parsed = validateSubscription(subscription);
        if (!parsed.ok) return json({ error: parsed.error }, 400, corsHeaders);
        const key = await digestKey(parsed.value.endpoint);
        await env.PUSH_STATE.put(SUB_PREFIX + key, JSON.stringify({
          subscription: parsed.value,
          createdAt: new Date().toISOString()
        }));
        return json({ ok: true }, 201, corsHeaders);
      }

      if (url.pathname === "/unsubscribe" && request.method === "POST") {
        if (origin !== env.ALLOWED_ORIGIN) return json({ error: "origin_not_allowed" }, 403, {});
        const body = await readJson(request, 8192);
        const parsed = validateSubscription(body);
        if (!parsed.ok) return json({ error: parsed.error }, 400, corsHeaders);
        await env.PUSH_STATE.delete(SUB_PREFIX + await digestKey(parsed.value.endpoint));
        return json({ ok: true }, 200, corsHeaders);
      }

      if (url.pathname === "/notify" && request.method === "POST") {
        if (!env.NOTIFY_TOKEN || request.headers.get("Authorization") !== "Bearer " + env.NOTIFY_TOKEN) {
          return json({ error: "unauthorized" }, 401, {});
        }
        return await notify(request, env);
      }

      return json({ error: "not_found" }, 404, corsHeaders);
    } catch (error) {
      return json({ error: "request_failed" }, 500, corsHeaders);
    }
  }
};

async function notify(request, env) {
  if (!env.PUSH_STATE || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return json({ error: "push_not_configured" }, 503);
  }
  const event = await readJson(request, 8192);
  if (!event || event.verified !== true || event.eligible !== true || event.longTerm !== true ||
      event.filtered === true || !ALLOWED_EVENT_TYPES.has(event.type)) {
    return json({ error: "event_not_eligible" }, 422);
  }
  if (!validId(event.eventId) || !validId(event.listingId) ||
      typeof event.title !== "string" || typeof event.area !== "string" ||
      typeof event.price !== "string" || !safeHttpsUrl(event.url)) {
    return json({ error: "invalid_event" }, 400);
  }

  const doneKey = EVENT_PREFIX + await digestKey(event.eventId);
  if (await env.PUSH_STATE.get(doneKey)) {
    return json({ ok: true, duplicate: true, sent: 0, failed: 0 }, 200);
  }

  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY
  };
  const notification = {
    title: event.title.slice(0, 90),
    body: [event.price, event.area].filter(Boolean).join(" · ").slice(0, 180),
    url: event.url,
    listingId: event.listingId,
    tag: event.listingId
  };

  let sent = 0, failed = 0, expired = 0;
  let cursor;
  do {
    const page = await env.PUSH_STATE.list({ prefix: SUB_PREFIX, cursor, limit: 1000 });
    for (const item of page.keys) {
      const record = await env.PUSH_STATE.get(item.name, "json");
      if (!record || !record.subscription) {
        await env.PUSH_STATE.delete(item.name);
        continue;
      }
      const receiptKey = doneKey + ":" + item.name.slice(SUB_PREFIX.length);
      if (await env.PUSH_STATE.get(receiptKey)) continue;
      try {
        const payload = await buildPushPayload({
          data: JSON.stringify(notification),
          options: { ttl: 86400, urgency: "high" }
        }, record.subscription, vapid);
        const response = await fetch(record.subscription.endpoint, payload);
        if (response.ok) {
          sent++;
          await env.PUSH_STATE.put(receiptKey, "1", { expirationTtl: 2592000 });
        } else if (response.status === 404 || response.status === 410) {
          expired++;
          await env.PUSH_STATE.delete(item.name);
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  if (failed === 0) await env.PUSH_STATE.put(doneKey, "1", { expirationTtl: 2592000 });
  return json({ ok: failed === 0, sent, failed, expired }, failed === 0 ? 200 : 502);
}

function validateSubscription(value) {
  if (!value || typeof value !== "object" || typeof value.endpoint !== "string" ||
      !value.keys || typeof value.keys.p256dh !== "string" || typeof value.keys.auth !== "string") {
    return { ok: false, error: "invalid_subscription" };
  }
  let endpoint;
  try { endpoint = new URL(value.endpoint); } catch { return { ok: false, error: "invalid_endpoint" }; }
  if (endpoint.protocol !== "https:" || !isAllowedPushHost(endpoint.hostname)) {
    return { ok: false, error: "push_endpoint_not_allowed" };
  }
  if (value.endpoint.length > 2048 || value.keys.p256dh.length > 256 || value.keys.auth.length > 256) {
    return { ok: false, error: "subscription_too_large" };
  }
  return { ok: true, value: {
    endpoint: endpoint.href,
    expirationTime: value.expirationTime ?? null,
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth }
  }};
}

function isAllowedPushHost(host) {
  const normalized = host.toLowerCase();
  return ALLOWED_PUSH_HOSTS.some(base => normalized === base || normalized.endsWith("." + base));
}

function safeHttpsUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function validId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 180 &&
    /^[A-Za-z0-9._:-]+$/.test(value);
}

async function readJson(request, maxBytes) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maxBytes) throw new Error("body_too_large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("body_too_large");
  return JSON.parse(text);
}

async function digestKey(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
  });
}
