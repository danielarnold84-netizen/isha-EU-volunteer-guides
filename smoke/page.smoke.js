/*
 * page.smoke.js — was sich an index.html nur im Browser zeigt.
 *
 * Der Konsistenz-Check liest das Markup, die Unit-Tests prüfen die Regeln.
 * Was beide nicht sehen: ob die Seite beim Öffnen tatsächlich hochkommt, ob
 * das Passwortfeld tut, was es soll, und ob nach einem Sprachwechsel genau
 * eine Fassung sichtbar ist und die Navigation dazu passt.
 *
 *   npm run smoke
 */

"use strict";

const { test, after } = require("node:test");
const assert = require("node:assert");
const path = require("path");

const { SKIP, openPage, closeBrowser } = require("./_browser.js");

const PAGE = path.resolve(__dirname, "..", "index.html");
const LANGS = ["de", "en", "es", "it", "fr"];
const GATE_KEY = "isha-gate-ok";

after(closeBrowser);

test("der Browser steht bereit, wo er verlangt wird", () => {
  // Lokal darf Playwright fehlen — in CI wäre ein stiller Komplettdurchfall
  // sonst grün. SMOKE_REQUIRED=1 macht daraus einen Fehlschlag.
  assert.ok(!SKIP || !process.env.SMOKE_REQUIRED, String(SKIP));
});

/** Öffnet die Seite bereits entsperrt — sonst liegt das Gate über allem. */
function openUnlocked() {
  return openPage(PAGE, { storage: { [GATE_KEY]: "1" } });
}

test("die Seite lädt ohne Fehler in der Konsole", { skip: SKIP }, async () => {
  const { consoleErrors, failedFiles, page, close } = await openUnlocked();
  try {
    assert.deepStrictEqual(consoleErrors, []);
    assert.deepStrictEqual(failedFiles, []);
    assert.match(await page.title(), /\S/);
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------
// Passwortabfrage
// ---------------------------------------------------------------------------

test("ohne Passwort liegt die Abfrage über dem Guide", { skip: SKIP }, async () => {
  const { page, close } = await openPage(PAGE);
  try {
    await assertVisible(page, "#pw-gate");
    assert.strictEqual(await page.locator("#pw-err").isVisible(), false);
    // Der Guide ist im Markup vorhanden, aber verdeckt.
    assert.strictEqual(await page.locator("#pw-gate").evaluate((el) => getComputedStyle(el).position), "fixed");
  } finally {
    await close();
  }
});

test("ein falsches Passwort meldet sich und lässt nicht durch", { skip: SKIP }, async () => {
  const { page, close } = await openPage(PAGE);
  try {
    await page.fill("#pw-input", "definitiv-falsch");
    await page.click("#pw-btn");
    await page.waitForFunction(() => document.getElementById("pw-err").offsetParent !== null);
    await assertVisible(page, "#pw-gate");
    const stored = await page.evaluate((k) => localStorage.getItem(k), GATE_KEY);
    assert.strictEqual(stored, null, "ein Fehlversuch darf nichts merken");
  } finally {
    await close();
  }
});

test("ein bereits entsperrter Browser sieht die Abfrage nicht mehr", { skip: SKIP }, async () => {
  const { page, close } = await openUnlocked();
  try {
    assert.strictEqual(await page.locator("#pw-gate").isVisible(), false);
    await assertVisible(page, "#lang-de");
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------
// Sprachumschaltung
// ---------------------------------------------------------------------------

test("beim Öffnen ist genau die deutsche Fassung sichtbar", { skip: SKIP }, async () => {
  const { page, close } = await openUnlocked();
  try {
    assert.deepStrictEqual(await activePanels(page), ["lang-de"]);
    assert.deepStrictEqual(await activeButtons(page), ["de"]);
  } finally {
    await close();
  }
});

test("jede Schaltfläche zeigt genau ihre Fassung", { skip: SKIP }, async () => {
  const { page, close } = await openUnlocked();
  try {
    for (const lang of LANGS) {
      await page.click('.lang-btn[data-lang="' + lang + '"]');
      assert.deepStrictEqual(await activePanels(page), ["lang-" + lang], lang);
      assert.deepStrictEqual(await activeButtons(page), [lang], lang);
      await assertVisible(page, "#lang-" + lang + " section");
    }
  } finally {
    await close();
  }
});

test("die Navigation zeigt in jeder Sprache auf vorhandene Abschnitte", { skip: SKIP }, async () => {
  const { page, close } = await openUnlocked();
  try {
    for (const lang of LANGS) {
      await page.click('.lang-btn[data-lang="' + lang + '"]');
      const targets = await page.$$eval("#sectionNav a:not(.ext)", (as) =>
        as.map((a) => a.getAttribute("href"))
      );
      assert.strictEqual(targets.length, 9, lang + ": Anzahl Navigationspunkte");
      for (const href of targets) {
        assert.ok(href.startsWith("#" + lang + "-"), lang + ": " + href + " gehört zu einer anderen Sprache");
        const found = await page.locator(href).count();
        assert.strictEqual(found, 1, lang + ": " + href + " führt ins Leere");
      }
    }
  } finally {
    await close();
  }
});

test("ein Navigationspunkt springt zu seinem Abschnitt", { skip: SKIP }, async () => {
  const { page, close } = await openUnlocked();
  try {
    await page.click("#sectionNav a.star");
    await page.waitForFunction(() => location.hash === "#de-flow");
    await assertVisible(page, "#de-flow .flow-table");
  } finally {
    await close();
  }
});

test("der Link zum Spreadsheet öffnet sicher in einem neuen Tab", { skip: SKIP }, async () => {
  const { page, close } = await openUnlocked();
  try {
    const link = page.locator("#sectionNav a.ext");
    assert.strictEqual(await link.getAttribute("target"), "_blank");
    assert.match(await link.getAttribute("rel"), /noopener/);
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------

async function assertVisible(page, selector) {
  const locator = page.locator(selector).first();
  assert.strictEqual(await locator.isVisible(), true, selector + " ist nicht sichtbar");
}

async function activePanels(page) {
  return page.$$eval(".lang-panel.active", (els) => els.map((e) => e.id));
}

async function activeButtons(page) {
  return page.$$eval(".lang-btn.active", (els) => els.map((e) => e.dataset.lang));
}
