/*
 * _browser.js — gemeinsamer Unterbau der Smoke-Tests.
 *
 * Die Unit-Tests prüfen Logik ohne Browser; hier geht es um das, was sich
 * nur im Browser zeigt: lädt die Seite überhaupt, ohne dass etwas in der
 * Konsole bricht, und tut das Klicken, was es soll.
 *
 * Playwright ist die einzige Abhängigkeit des Repos und wird bewusst nicht
 * von `npm test` verlangt: ohne sie überspringen sich diese Tests mit einem
 * Hinweis, statt fehlzuschlagen. `npm run check` bleibt damit in einem
 * frischen Checkout ohne Installation lauffähig.
 */

"use strict";

const path = require("path");
const { pathToFileURL } = require("url");
const { createRequire } = require("module");
const { execFileSync } = require("child_process");

const HINT = "Playwright fehlt — `npm install` und `npx playwright install chromium`.";

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (e) {
    /* nicht im Projekt installiert — global versuchen */
  }
  try {
    const root = execFileSync("npm", ["root", "-g"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return createRequire(path.join(root, "anchor.js"))("playwright");
  } catch (e) {
    return null;
  }
}

const playwright = loadPlaywright();

/** Als `{ skip: SKIP }` an test() übergeben — false heisst: läuft. */
const SKIP = playwright ? false : HINT;

let browserPromise = null;

function browser() {
  if (!browserPromise) browserPromise = playwright.chromium.launch();
  return browserPromise;
}

async function closeBrowser() {
  if (!browserPromise) return;
  const b = await browserPromise;
  browserPromise = null;
  await b.close();
}

/**
 * Öffnet eine lokale Seite und sammelt dabei alles, was schiefgeht.
 *
 * Externe Anfragen (Google Fonts) werden leer beantwortet: sie machen den
 * Lauf vom Netz abhängig, und ihr Ausgang sagt nichts über die Seite aus.
 * Gezählt werden nur Anfragen an das Dateisystem — dort bedeutet ein
 * Fehlschlag eine kaputte Referenz im Repo.
 *
 * Die Browsersprache wird gesetzt, nicht geerbt: Seiten, die ihre Sprache
 * aus navigator.language wählen, liefen sonst je nach Rechner anders.
 */
async function openPage(file, options = {}) {
  const context = await (await browser()).newContext({
    viewport: options.viewport || { width: 1280, height: 900 },
    locale: options.locale || "de-DE",
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const failedFiles = [];

  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("file://") || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    // Externes (Schriften) wird leer beantwortet statt abgewiesen: ein
    // Abbruch landete als "Failed to load resource" in der Konsole und
    // wäre von einem echten Seitenfehler nicht zu unterscheiden.
    return route.fulfill({ status: 200, contentType: "text/plain", body: "" });
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err && err.message ? err.message : err)));
  page.on("requestfailed", (req) => {
    if (req.url().startsWith("file://")) failedFiles.push(req.url());
  });

  if (options.beforeLoad) await options.beforeLoad(page);

  const url = pathToFileURL(file).href;
  if (options.storage) {
    // localStorage gehört zum Ursprung, den es erst nach dem ersten Aufruf
    // gibt — also einmal laden, füllen, neu laden.
    await page.goto(url);
    await page.evaluate((entries) => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, options.storage);
    consoleErrors.length = 0;
    failedFiles.length = 0;
  }
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");

  return {
    page,
    consoleErrors,
    failedFiles,
    close: () => context.close(),
  };
}

module.exports = { playwright, SKIP, HINT, openPage, closeBrowser };
