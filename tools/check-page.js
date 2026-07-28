/*
 * check-page.js — Konsistenz-Check für index.html.
 *
 * Die Seite ist eine einzelne Datei mit fünf Sprachfassungen und einer in JS
 * gepflegten Navigation. Was hier auseinanderlaufen kann, läuft leise
 * auseinander: ein Nav-Eintrag zeigt auf einen Abschnitt, den es nicht mehr
 * gibt; eine Sprachschaltfläche hat kein Panel; eine ID doppelt sich.
 * Genau das prüft dieser Lauf — ohne Abhängigkeiten.
 *
 *   node tools/check-page.js
 */

"use strict";

const fs = require("fs");
const path = require("path");

const PAGE = path.resolve(__dirname, "..", "index.html");

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function attr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', "i"));
  return m ? m[1] : null;
}

function openingTags(html, tagName) {
  const out = [];
  const re = new RegExp("<" + tagName + "\\b[^>]*>", "gi");
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[0]);
  return out;
}

function matchAll(html, re, group) {
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[group]);
  return out;
}

/** Alle im Markup vergebenen IDs. */
function ids(html) {
  return matchAll(html, /\bid\s*=\s*"([^"]+)"/gi, 1);
}

/** Sprachschaltflächen aus dem Markup (data-lang an .lang-btn). */
function langButtons(html) {
  return openingTags(html, "button")
    .filter((t) => /class\s*=\s*"[^"]*\blang-btn\b/.test(t))
    .map((t) => attr(t, "data-lang"))
    .filter(Boolean);
}

/** Sprachfassungen aus dem Markup (id="lang-xx"). */
function langPanels(html) {
  return matchAll(html, /\bid\s*=\s*"lang-([a-z]{2})"/gi, 1);
}

/** Die in navConfig gepflegten Sprachen und ihre Sprungziele. */
function navConfig(html) {
  const block = html.match(/const\s+navConfig\s*=\s*\{([\s\S]*?)\n\};/);
  if (!block) return null;
  const config = {};
  const langRe = /(\w{2})\s*:\s*\[([\s\S]*?)\]/g;
  let m;
  while ((m = langRe.exec(block[1])) !== null) {
    config[m[1]] = matchAll(m[2], /\{\s*id\s*:\s*'([^']+)'/g, 1);
  }
  return config;
}

function checkPage(html) {
  const problems = [];
  const fail = (rule, message) => problems.push({ rule, message });
  const source = stripComments(html);

  // --- Kopfbereich ---
  const robots = openingTags(source, "meta")
    .filter((t) => (attr(t, "name") || "").toLowerCase() === "robots")
    .map((t) => attr(t, "content"))[0];
  if (!robots || !/noindex/i.test(robots) || !/nofollow/i.test(robots)) {
    fail("noindex", "Die Seite ist nicht auf noindex,nofollow gestellt");
  }
  if (!openingTags(source, "meta").some((t) => (attr(t, "name") || "").toLowerCase() === "viewport")) {
    fail("viewport", 'Kein <meta name="viewport">');
  }
  if (!openingTags(source, "meta").some((t) => attr(t, "charset"))) {
    fail("charset", "Kein <meta charset>");
  }
  const htmlTag = openingTags(source, "html")[0];
  if (!htmlTag || !attr(htmlTag, "lang")) fail("lang", "<html> ohne lang-Attribut");
  const title = (source.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
  if (!title || !title.trim()) fail("title", "Kein oder leerer <title>");

  // --- IDs ---
  const seen = new Set();
  for (const id of ids(source)) {
    if (seen.has(id)) fail("duplicate-id", 'id="' + id + '" kommt mehrfach vor');
    seen.add(id);
  }

  // --- Sprachen ---
  const buttons = langButtons(source);
  const panels = langPanels(source);
  const config = navConfig(source);

  if (buttons.length === 0) fail("lang-buttons", "Keine Sprachschaltflächen gefunden");
  for (const lang of buttons) {
    if (!panels.includes(lang)) fail("lang-panel", "Schaltfläche " + lang + " hat keine Sprachfassung");
  }
  for (const lang of panels) {
    if (!buttons.includes(lang)) fail("lang-button", "Sprachfassung " + lang + " hat keine Schaltfläche");
  }

  if (!config) {
    fail("nav-config", "navConfig nicht gefunden — Navigation kann nicht geprüft werden");
    return problems;
  }

  for (const lang of buttons) {
    if (!config[lang]) fail("nav-config", "navConfig hat keinen Eintrag für " + lang);
  }
  for (const lang of Object.keys(config)) {
    if (!panels.includes(lang)) fail("nav-config", "navConfig kennt " + lang + ", die Seite nicht");
  }

  // --- Sprungziele ---
  for (const [lang, targets] of Object.entries(config)) {
    for (const target of targets) {
      if (!seen.has(target)) {
        fail("dead-anchor", lang + ": Navigationspunkt #" + target + " führt ins Leere");
      }
    }
  }

  // Alle Sprachen sollen dieselben Abschnitte anbieten.
  const counts = Object.entries(config).map(([lang, t]) => [lang, t.length]);
  const expected = counts.length ? counts[0][1] : 0;
  for (const [lang, count] of counts) {
    if (count !== expected) {
      fail("nav-parity", lang + " hat " + count + " Navigationspunkte, " + counts[0][0] + " hat " + expected);
    }
  }

  // --- Externe Links ---
  for (const tag of openingTags(source, "a")) {
    if (attr(tag, "target") !== "_blank") continue;
    if (!/\bnoopener\b/i.test(attr(tag, "rel") || "")) {
      fail("noopener", 'target="_blank" ohne rel="noopener": ' + tag.slice(0, 80));
    }
  }

  return problems;
}

function main() {
  const problems = checkPage(fs.readFileSync(PAGE, "utf8"));
  if (problems.length === 0) {
    console.log("✓ index.html ist in sich stimmig.");
    return 0;
  }
  for (const p of problems) console.error("  [" + p.rule + "] " + p.message);
  console.error("\n✗ " + problems.length + " Beanstandung(en).");
  return 1;
}

if (require.main === module) process.exit(main());

module.exports = { checkPage, langButtons, langPanels, navConfig, ids, stripComments };
