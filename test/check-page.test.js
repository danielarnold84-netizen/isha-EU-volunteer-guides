"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { checkPage, langButtons, langPanels, navConfig } = require("../tools/check-page.js");

const PAGE = path.resolve(__dirname, "..", "index.html");
const html = fs.readFileSync(PAGE, "utf8");

const rules = (problems) => problems.map((p) => p.rule);

// ---------------------------------------------------------------------------
// Die echte Seite
// ---------------------------------------------------------------------------

test("index.html ist in sich stimmig", () => {
  const problems = checkPage(html);
  assert.deepStrictEqual(
    problems,
    [],
    "Beanstandungen:\n" + problems.map((p) => "  [" + p.rule + "] " + p.message).join("\n")
  );
});

test("die Seite hat fünf Sprachfassungen mit passenden Schaltflächen", () => {
  assert.deepStrictEqual(langButtons(html).sort(), ["de", "en", "es", "fr", "it"]);
  assert.deepStrictEqual(langPanels(html).sort(), ["de", "en", "es", "fr", "it"]);
});

test("jede Sprache bietet dieselben neun Abschnitte an", () => {
  const config = navConfig(html);
  assert.deepStrictEqual(Object.keys(config).sort(), ["de", "en", "es", "fr", "it"]);
  for (const [lang, targets] of Object.entries(config)) {
    assert.strictEqual(targets.length, 9, lang + " hat " + targets.length + " Punkte");
  }
});

test("alle Navigationsziele existieren als Abschnitt", () => {
  const config = navConfig(html);
  const ids = new Set(html.match(/\bid="([^"]+)"/g).map((s) => s.slice(4, -1)));
  for (const [lang, targets] of Object.entries(config)) {
    for (const target of targets) {
      assert.ok(ids.has(target), lang + ": #" + target + " fehlt");
    }
  }
});

// ---------------------------------------------------------------------------
// Die Regeln selbst
// ---------------------------------------------------------------------------

test("eine fehlende Sprachfassung wird gemeldet", () => {
  const broken = html.replace('id="lang-it"', 'id="lang-xx"');
  assert.ok(rules(checkPage(broken)).includes("lang-panel"));
});

test("ein totes Sprungziel wird gemeldet", () => {
  const broken = html.replace('id="fr-zoom"', 'id="fr-zoom-alt"');
  const problems = checkPage(broken);
  assert.ok(rules(problems).includes("dead-anchor"));
  assert.ok(problems.some((p) => /fr-zoom/.test(p.message)));
});

test("eine doppelte ID wird gemeldet", () => {
  const broken = html.replace('id="de-setup"', 'id="de-flow"');
  assert.ok(rules(checkPage(broken)).includes("duplicate-id"));
});

test("fehlendes noindex wird gemeldet", () => {
  const broken = html.replace(/<meta name="robots"[^>]*>/i, "");
  assert.ok(rules(checkPage(broken)).includes("noindex"));
});

test("ungleich lange Navigationen werden gemeldet", () => {
  const broken = html.replace("{id:'it-zoom',label:'Zoom'}", "");
  assert.ok(rules(checkPage(broken)).includes("nav-parity"));
});
