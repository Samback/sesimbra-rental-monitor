import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const workerUrl = (process.env.PUSH_WORKER_URL || "").replace(/\/$/, "");
const token = process.env.SESIMBRA_NOTIFY_TOKEN || "";
const currentHtml = readFileSync("index.html", "utf8");
const before = process.env.GITHUB_EVENT_BEFORE || "";
const sha = process.env.GITHUB_SHA || "unknown";

if (!before || /^0+$/.test(before)) {
  console.log("No previous catalog commit; skipping push notifications.");
  process.exit(0);
}
if (!workerUrl || !token) {
  console.log("Push notifications are not configured for this GitHub workflow.");
  process.exit(0);
}

let previousHtml;
try {
  previousHtml = execFileSync("git", ["show", before + ":index.html"], { encoding: "utf8" });
} catch {
  console.log("Previous index.html is unavailable; skipping notifications for this push.");
  process.exit(0);
}

const previous = new Map(parseEligible(previousHtml).map(item => [item.url, item]));
const current = new Map(parseEligible(currentHtml).map(item => [item.url, item]));
const events = [];

for (const item of current.values()) {
  const old = previous.get(item.url);
  let type = "";
  if (/repost|relisted|republicad[oa]/i.test(item.status)) {
    type = "relisted";
  } else if (!old) {
    type = "new";
  } else if (old.price !== item.price) {
    type = "price_changed";
  } else if (old.status !== item.status || old.details !== item.details) {
    type = "terms_changed";
  }
  if (!type) continue;

  const fingerprint = [sha, item.url, type, item.price, item.status, item.details].join("\n");
  events.push({
    eventId: digest(fingerprint),
    listingId: digest(item.url),
    type,
    title: item.title.slice(0, 90),
    area: item.area.slice(0, 180),
    price: item.price.slice(0, 60),
    url: item.url,
    verified: true,
    eligible: true,
    longTerm: true,
    filtered: false
  });
}

if (!events.length) {
  console.log("No new or changed verified long-term listings to notify.");
  process.exit(0);
}

for (const event of events) {
  const response = await fetch(workerUrl + "/notify", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(event)
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error("Push Worker rejected " + event.type + " for " + event.url + " (HTTP " + response.status + "): " + body);
  }
  console.log("Push event " + event.type + " for " + event.url + ": " + body);
}

function parseEligible(html) {
  const listings = [];
  const sectionPattern = /<section\\b[^>]*>([\\s\\S]*?)<\\/section>/gi;
  for (const sectionMatch of html.matchAll(sectionPattern)) {
    const sectionHtml = sectionMatch[1];
    const section = text(capture(sectionHtml, "h2"));
    if (/filtered|відсіяні/i.test(section)) continue;

    const articlePattern = /<article\\b([^>]*)>([\\s\\S]*?)<\\/article>/gi;
    for (const articleMatch of sectionHtml.matchAll(articlePattern)) {
      if (!/\\bcard\\b/.test(attribute(articleMatch[1], "class"))) continue;
      const card = articleMatch[2];
      const title = text(capture(card, "h3"));
      const price = text(captureByClass(card, "price"));
      const status = text(captureByClass(card, "status"));
      const factText = [...card.matchAll(/<span\\b[^>]*>([\\s\\S]*?)<\\/span>/gi)]
        .map(match => text(match[1])).join(" ");
      const areaText = factText.match(/[0-9][0-9\\s.,]*\\s*(?:м²|m²|m2|sqm)\\b?/i)?.[0] || "";
      const bedMatch = (title + " " + factText).match(/\\bT\\s*([23])\\b|\\b([23])\\s*quartos\\b/i);
      const bedrooms = Number(bedMatch?.[1] || bedMatch?.[2] || 0);
      const priceMatch = price.match(/€\\s*([0-9][0-9\\s.,]*)/);
      const monthlyPrice = Number((priceMatch?.[1] || "").replace(/\\D/g, ""));
      const area = Number((areaText.match(/[0-9][0-9\\s.,]*/) || [""])[0].replace(/\\D/g, ""));
      const longTerm = /(?:довгостроковість|long[\\s-]*term|longa duração)[^.;]{0,60}(?:підтверджено|confirmed|confirmado|\\bsim\\b|\\byes\\b)/i.test(status);
      const href = listingHref(card);
      if (!href || !longTerm || !monthlyPrice || !bedrooms) continue;
      if (bedrooms === 3 && monthlyPrice > 1600) continue;
      if (bedrooms === 2 && (monthlyPrice > 1600 || area <= 90)) continue;
      if (bedrooms !== 2 && bedrooms !== 3) continue;

      const details = [...card.matchAll(/<p\\b([^>]*)>([\\s\\S]*?)<\\/p>/gi)]
        .filter(match => !/photo-note/i.test(attribute(match[1], "class")))
        .map(match => text(match[2])).join(" | ");
      const areaName = title.split(/[—–-]/).slice(1).join(" — ").trim() || section;
      listings.push({ url: href, title, area: areaName, price, status, details });
    }
  }
  return listings;
}

function listingHref(card) {
  for (const match of card.matchAll(/<a\\b([^>]*)>/gi)) {
    const attrs = match[1];
    if (!/\\bbtn\\b/.test(attribute(attrs, "class"))) continue;
    const href = attribute(attrs, "href");
    if (!href) continue;
    try {
      const url = new URL(decode(href), "https://samback.github.io/sesimbra-rental-monitor/");
      if (url.protocol !== "https:" || /search|category|\\/(?:rent|rendas)\\/?$/i.test(url.pathname)) continue;
      return url.href;
    } catch {}
  }
  return "";
}

function capture(html, tag) {
  const match = html.match(new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i"));
  return match ? match[1] : "";
}

function captureByClass(html, className) {
  for (const match of html.matchAll(/<([a-z0-9]+)\\b([^>]*)>([\\s\\S]*?)<\\/\\1>/gi)) {
    if (attribute(match[2], "class").split(/\\s+/).includes(className)) return match[3];
  }
  return "";
}

function attribute(attrs, name) {
  const escaped = name.replace(/[.*+?^\u0024{}()|[\\]\\\\]/g, "\\$&");
  const match = attrs.match(new RegExp("\\b" + escaped + "\\s*=\\s*(['\\\"])(.*?)\\1", "i"));
  return match ? decode(match[2]) : "";
}

function text(value) {
  return decode(value.replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").trim());
}

function decode(value) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\\\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
