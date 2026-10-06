import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const errors = [];
const fail = message => errors.push(message);
const matches = (value, regex) => [...value.matchAll(regex)];

if (!/^<!doctype html>/i.test(html.trimStart())) {
  fail("Missing HTML doctype.");
}

const pairedTags = ["html", "head", "body", "main", "section", "article", "script", "div"];
for (const tag of pairedTags) {
  const opening = matches(html, new RegExp("<" + tag + "\\b", "gi")).length;
  const closing = matches(html, new RegExp("</" + tag + "\\s*>", "gi")).length;
  if (opening !== closing) {
    fail("<" + tag + "> tags are unbalanced (" + opening + " opening, " + closing + " closing).");
  }
}

const headEnd = html.indexOf("</head>");
const viewportTags = matches(
  html,
  /<meta\b(?=[^>]*\bname\s*=\s*["']viewport["'])[^>]*>/gi
);
if (headEnd < 0) {
  fail("Missing closing </head>.");
}
if (viewportTags.length !== 1) {
  fail("Expected exactly one complete viewport meta tag; found " + viewportTags.length + ".");
} else {
  const viewport = viewportTags[0];
  if (viewport.index > headEnd) {
    fail("Viewport meta tag must be inside <head>.");
  }
  if (!/\bcontent\s*=\s*["']width=device-width,initial-scale=1["']/i.test(viewport[0])) {
    fail("Viewport meta tag has an unexpected or incomplete content value.");
  }
}

const mainStart = html.indexOf("<main");
const mainEnd = html.indexOf("</main>");
if (mainStart < 0 || mainEnd < mainStart) {
  fail("Missing or malformed <main> region.");
}

const sections = matches(html, /<section\b[^>]*>[\s\S]*?<\/section\s*>/gi);
const sectionOpenCount = matches(html, /<section\b/gi).length;
if (sections.length < 1 || sections.length !== sectionOpenCount) {
  fail("Every section must have a complete, separately matchable closing tag.");
}

const articles = matches(html, /<article\b[^>]*>[\s\S]*?<\/article\s*>/gi);
const articleOpenCount = matches(html, /<article\b/gi).length;
if (articles.length !== articleOpenCount) {
  fail("Every listing card must have a complete closing </article>.");
}

if (articles.length === 0) {
  fail("No listing cards were found.");
}

const gridBounds = new Map();
for (const section of sections) {
  if (mainStart >= 0 && mainEnd >= mainStart &&
      (section.index < mainStart || section.index + section[0].length > mainEnd)) {
    fail("A catalog section is outside <main>.");
    break;
  }

  const gridOpenings = matches(
    section[0],
    /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bgrid\b[^"']*["'][^>]*>/gi
  );
  if (gridOpenings.length !== 1) {
    fail("Each catalog section must contain exactly one card grid.");
    continue;
  }

  const divTags = /<\/?div\b[^>]*>/gi;
  divTags.lastIndex = gridOpenings[0].index;
  let depth = 0;
  let gridClose = -1;
  let divTag;
  while ((divTag = divTags.exec(section[0]))) {
    depth += /^<\//.test(divTag[0]) ? -1 : 1;
    if (depth === 0) {
      gridClose = divTag.index;
      break;
    }
  }
  if (gridClose < 0) {
    fail("A catalog section's card grid has no matching closing </div>.");
    continue;
  }

  gridBounds.set(section, {
    start: section.index + gridOpenings[0].index,
    end: section.index + gridClose
  });
}

for (const article of articles) {
  const containingSections = sections.filter(section =>
    article.index >= section.index &&
    article.index + article[0].length <= section.index + section[0].length
  );
  if (containingSections.length !== 1) {
    fail("A listing card is outside a section or belongs to more than one section.");
    break;
  }

  const bounds = gridBounds.get(containingSections[0]);
  if (!bounds ||
      article.index < bounds.start ||
      article.index + article[0].length > bounds.end) {
    fail("A listing card is outside its section's card grid.");
    break;
  }

  const openingTag = article[0].match(/^<article\b[^>]*>/i)?.[0] || "";
  if (!/\bclass\s*=\s*["'][^"']*\bcard\b[^"']*["']/i.test(openingTag)) {
    fail("A listing article is missing the card class.");
    break;
  }
}

if (errors.length) {
  console.error("Catalog validation failed; GitHub Pages deployment stopped:");
  for (const error of errors) console.error(" - " + error);
  process.exitCode = 1;
} else {
  console.log(
    "Catalog validation passed: " + articles.length + " cards in " +
    sections.length + " sections; viewport and paired HTML structure are intact."
  );
}
