import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const workerUrl = (process.env.PUSH_WORKER_URL || "").replace(/\/+$/, "");
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
  if (!old) {
    type = /repost|relisted|republicad[oa]|повторно опублик|повторно опублік/i.test(item.status)
      ? "relisted"
      : "new";
  } else if (old.price !== item.price) {
    type = "price_changed";
  } else if (old.signature !== item.signature) {
    type = "terms_changed";
  }
  if (!type) continue;

  const eventId = digest([sha, item.url, type, item.price, item.signature].join("\n"));
  events.push({
    eventId,
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
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(event)
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error("Push Worker rejected " + event.type + " for " + event.url +
      " (HTTP " + response.status + "): " + body);
  }
  console.log("Push event " + event.type + " for " + event.url + ": " + body);
}

function parseEligible(html) {
  const listings = [];
  const sections = /<section\b[^>]*>([\s\S]*?)<\/section>/gi;

  for (const sectionMatch of html.matchAll(sections)) {
    const sectionHtml = sectionMatch[1];
    const sectionTitle = text(capture(sectionHtml, "h2"));
    if (/filtered|відсіяні/i.test(sectionTitle)) continue;

    const articles = /<article\b([^>]*)>([\s\S]*?)<\/article>/gi;
    for (const articleMatch of sectionHtml.matchAll(articles)) {
      if (!classNames(articleMatch[1]).includes("card")) continue;

      const card = articleMatch[2];
      const title = text(capture(card, "h3"));
      const price = text(captureByClass(card, "price"));
      const status = text(captureByClass(card, "status"));
      const factsHtml = captureByClass(card, "facts");
      const facts = text(factsHtml);
      const combined = [title, facts, status].join(" ");
      const bedroomMatch = combined.match(/\bT\s*([23])\b|(?:^|\s)([23])\s*quartos?\b/i);
      const bedrooms = Number(bedroomMatch?.[1] || bedroomMatch?.[2] || 0);
      const priceMatch = price.match(/€\s*([\d][\d\s.,]*)/);
      const monthlyPrice = Number((priceMatch?.[1] || "").replace(/\D/g, ""));
      const areaMatch = combined.match(/([\d]+(?:[.,]\d+)?)\s*(?:м²|m²|m2|sqm)/i);
      const areaNumber = Number((areaMatch?.[1] || "").replace(",", "."));
      const longTermConfirmed = isConfirmedLongTerm(combined);
      const href = listingHref(card);

      if (!href || !longTermConfirmed || !monthlyPrice || !bedrooms) continue;
      if (bedrooms === 3 && monthlyPrice > 1600) continue;
      if (bedrooms === 2 && (monthlyPrice > 1600 || !(areaNumber > 90))) continue;
      if (bedrooms !== 2 && bedrooms !== 3) continue;

      const descriptions = [...card.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)]
        .filter(match => !classNames(match[1]).includes("photo-note"))
        .map(match => text(match[2]))
        .filter(Boolean);
      const area = title.split(/[—–-]/).slice(1).join(" — ").trim() || sectionTitle;
      const signature = stableText([
        title,
        facts,
        status,
        ...descriptions
      ].join(" | "));

      listings.push({ url: href, title, area, price, status, signature });
    }
  }
  return listings;
}

function isConfirmedLongTerm(value) {
  if (/short[\s-]*term|temporary|tempor[aá]ria|temporada|curta dura[cç][aã]o|27\s*dias/i.test(value)) {
    return false;
  }
  return /(?:long[\s-]*term|longa dura[cç][aã]o|довгостроков(?:ий|а|е|ість)|contrato(?:\s+de)?\s+\d+\s+anos)[^.!?]{0,100}(?:confirmad[oa]|confirmed|sim|yes)|(?:confirmad[oa]|confirmed|sim|yes)[^.!?]{0,100}(?:long[\s-]*term|longa dura[cç][aã]o|довгостроков|contrato de longa dura[cç][aã]o)/i.test(value);
}

function listingHref(card) {
  for (const match of card.matchAll(/<a\b([^>]*)>/gi)) {
    const attrs = match[1];
    if (!classNames(attrs).includes("btn")) continue;
    const href = attribute(attrs, "href");
    if (!href) continue;
    try {
      const url = new URL(decode(href), "https://samback.github.io/sesimbra-rental-monitor/");
      if (url.protocol !== "https:") continue;
      if (/search|category|\/(?:rent|rendas)\/?$/i.test(url.pathname)) continue;
      return url.href;
    } catch {}
  }
  return "";
}

function capture(html, tag) {
  const escapedTag = tag.replace(/[.*+?^}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp("<" + escapedTag + "\\b[^>]*>([\\s\\S]*?)<\\/" + escapedTag + ">", "i"));
  return match ? match[1] : "";
}

function captureByClass(html, className) {
  for (const match of html.matchAll(/<([a-z0-9]+)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    if (classNames(match[2]).includes(className)) return match[3];
  }
  return "";
}

function classNames(attrs) {
  return (attribute(attrs, "class").match(/\S+/g) || []);
}

function attribute(attrs, name) {
  const match = attrs.match(/(?:^|\s)(?:class|href)\s*=\s*(["'])(.*?)\1/i);
  if (!match) return "";
  if (name === "class" && !/^\s*class\b/i.test(match[0])) {
    const classMatch = attrs.match(/(?:^|\s)class\s*=\s*(["'])(.*?)\1/i);
    return classMatch ? decode(classMatch[2]) : "";
  }
  if (name === "href" && !/^\s*href\b/i.test(match[0])) {
    const hrefMatch = attrs.match(/(?:^|\s)href\s*=\s*(["'])(.*?)\1/i);
    return hrefMatch ? decode(hrefMatch[2]) : "";
  }
  return decode(match[2]);
}

function text(value) {
  return decode(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function stableText(value) {
  return text(value)
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b/g, "")
    .replace(/\b(?:checked|updated|перевірено|оновлено)\b[^|.]{0,60}/gi, "")
    .replace(/\b\d+\s*(?:photos?|фото)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function decode(value) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
