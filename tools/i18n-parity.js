/*
 * i18n-parity.js — hält die fünf Sprachfassungen von index.html in Deckung.
 *
 * Die Seite ist eine Datei mit fünf vollständigen Übersetzungen desselben
 * Ablaufs. Gepflegt wird sie fast immer in einer Sprache: jemand ergänzt
 * einen Stichpunkt auf Deutsch, und die anderen vier bleiben zurück. Das
 * fällt niemandem auf — die spanische Fassung sieht ja weiterhin heil aus.
 * Auffallen tut es erst dem Volunteer, der am Sonntag danach sucht.
 *
 * Geprüft wird darum nicht der Text (der soll sich unterscheiden), sondern
 * alles, was sich beim Übersetzen NICHT ändern darf:
 *
 *   - dieselben Abschnitte in derselben Reihenfolge, mit denselben Nummern
 *   - derselbe Aufbau je Abschnitt (Absätze, Listen, Tabellenzeilen)
 *   - dieselben Uhrzeiten in derselben Reihenfolge
 *   - dieselben externen Links
 *   - dieselben Zoom-Begriffe in den Tabellenspalten (Yes/No, Open/…)
 *   - eine Navigation, die 1:1 auf die Abschnitte des Panels passt
 *
 * Referenz ist die erste Sprachfassung im Dokument (derzeit Deutsch).
 *
 *   node tools/i18n-parity.js
 */

"use strict";

const fs = require("fs");
const path = require("path");

const PAGE = path.resolve(__dirname, "..", "index.html");

/* Blockelemente. Inline-Auszeichnung (<b>, <em>, <a>, <br>) bleibt der
 * Übersetzung überlassen — wo im Satz die Betonung sitzt, ist Sprachsache. */
const BLOCK_TAGS = "h2|h3|h4|p|ul|ol|li|hr|table|thead|tbody|tr|th|td|div";

/* Spalten der Flow-Tabelle, deren Inhalt in allen Sprachen gleich bleibt:
 * das sind Zoom-Bedienbegriffe, keine Prosa. */
const VERBATIM_CLASSES = ["yes", "no", "open", "restricted", "focus"];

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Zerlegt die Seite in ihre Sprachfassungen.
 * @returns {Array<{lang: string, html: string}>} in Dokumentreihenfolge
 */
function panels(html) {
  const source = stripComments(html);
  const starts = [...source.matchAll(/<div class="lang-panel[^"]*" id="lang-([a-z]{2})">/g)];
  return starts.map((m, i) => {
    const from = m.index + m[0].length;
    // Die letzte Fassung endet nicht an der nächsten — sondern hinter ihrem
    // letzten </section>. Alles danach (Skript, Fußzeile) gehört keiner
    // Sprache und darf den Vergleich nicht verfälschen.
    const to =
      i + 1 < starts.length
        ? starts[i + 1].index
        : source.lastIndexOf("</section>") + "</section>".length;
    return { lang: m[1], html: to > from ? source.slice(from, to) : "" };
  });
}

/** Die Abschnitte einer Sprachfassung, in Dokumentreihenfolge. */
function sections(panelHtml) {
  return [...panelHtml.matchAll(/<section id="([^"]+)">([\s\S]*?)<\/section>/g)].map((m) => ({
    id: m[1],
    html: m[2],
    num: (m[2].match(/<span class="num">([^<]*)<\/span>/) || [])[1] || null,
  }));
}

/**
 * Der Aufbau eines Abschnitts als Folge von Blockelementen mit ihren Klassen.
 * Zwei Fassungen desselben Abschnitts müssen hier identisch sein.
 */
function blockFingerprint(sectionHtml) {
  const re = new RegExp("<(" + BLOCK_TAGS + ")\\b([^>]*)>", "gi");
  return [...sectionHtml.matchAll(re)].map((m) => {
    const cls = (m[2].match(/class\s*=\s*"([^"]*)"/) || [])[1];
    return m[1].toLowerCase() + (cls ? "." + cls.trim().split(/\s+/).join(".") : "");
  });
}

/**
 * Alle Uhrzeiten einer Fassung, auf HH:MM normalisiert.
 * Französisch schreibt 16h25 — dieselbe Zeit, andere Schreibweise.
 */
function clockTimes(panelHtml) {
  return [...panelHtml.matchAll(/\b([0-2]?\d)[:h]([0-5]\d)\b/g)].map(
    (m) => m[1].padStart(2, "0") + ":" + m[2]
  );
}

/** Externe Ziele einer Fassung, in Dokumentreihenfolge. */
function externalLinks(panelHtml) {
  return [...panelHtml.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]);
}

/** Tabellenzellen und Chat-Angaben, die unübersetzt bleiben müssen. */
function verbatimCells(panelHtml) {
  const re = new RegExp(
    '<(?:td|span) class="(' + VERBATIM_CLASSES.join("|") + '|chat-setting)"[^>]*>([^<]*)<',
    "g"
  );
  return [...panelHtml.matchAll(re)].map((m) => m[1] + "=" + m[2].trim());
}

/** Die in navConfig gepflegten Sprünge, mit ihrer Reihenfolge und ⭐-Markierung. */
function navSections(html) {
  const block = stripComments(html).match(/const\s+navConfig\s*=\s*\{([\s\S]*?)\n\};/);
  if (!block) return null;
  const config = {};
  const langRe = /(\w{2})\s*:\s*\[([\s\S]*?)\]/g;
  let m;
  while ((m = langRe.exec(block[1])) !== null) {
    config[m[1]] = [...m[2].matchAll(/\{([^}]*)\}/g)].map((entry) => ({
      id: (entry[1].match(/id\s*:\s*'([^']+)'/) || [])[1] || null,
      star: /star\s*:\s*true/.test(entry[1]),
    }));
  }
  return config;
}

function sameList(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Findet den ersten Unterschied zweier Listen — für eine brauchbare Meldung. */
function firstDiff(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return "Position " + i + ": " + JSON.stringify(a[i] ?? null) + " statt " + JSON.stringify(b[i] ?? null);
    }
  }
  return "";
}

function checkParity(html) {
  const problems = [];
  const fail = (rule, message) => problems.push({ rule, message });

  const all = panels(html);
  if (all.length < 2) {
    if (all.length === 0) fail("parity-langs", "Keine Sprachfassungen gefunden");
    return problems;
  }

  const ref = all[0];
  const refSections = sections(ref.html);
  if (refSections.length === 0) {
    fail("parity-sections", ref.lang + " hat keine Abschnitte — nichts zu vergleichen");
    return problems;
  }

  const nav = navSections(html);

  for (const panel of all) {
    const own = sections(panel.html);
    const label = panel.lang + " vs. " + ref.lang;

    // --- Abschnitte ---
    if (own.length !== refSections.length) {
      fail(
        "parity-sections",
        label + ": " + own.length + " Abschnitte statt " + refSections.length
      );
      continue; // Ohne gleiche Anzahl ist ein Vergleich je Abschnitt sinnlos.
    }

    const nums = own.map((s) => s.num);
    const refNums = refSections.map((s) => s.num);
    if (!sameList(nums, refNums)) {
      fail("parity-section-num", label + ": Abschnittsnummern weichen ab — " + firstDiff(nums, refNums));
    }

    // Die Kennung ist übersetzt (de-vor / en-before), das Präfix nicht.
    own.forEach((s, i) => {
      if (!s.id.startsWith(panel.lang + "-")) {
        fail("parity-section-id", panel.lang + ': Abschnitt ' + i + ' heißt "' + s.id + '" ohne Sprachpräfix');
      }
    });

    if (panel !== ref) {
      // --- Aufbau je Abschnitt ---
      own.forEach((s, i) => {
        const mine = blockFingerprint(s.html);
        const theirs = blockFingerprint(refSections[i].html);
        if (!sameList(mine, theirs)) {
          fail(
            "parity-structure",
            label + ", Abschnitt " + i + " (" + s.id + "): Aufbau weicht ab — " + firstDiff(mine, theirs)
          );
        }
      });

      // --- Zeiten, Links, feste Begriffe ---
      const checks = [
        ["parity-time", "Uhrzeiten", clockTimes],
        ["parity-link", "externe Links", externalLinks],
        ["parity-verbatim", "unübersetzte Zoom-Begriffe", verbatimCells],
      ];
      for (const [rule, what, extract] of checks) {
        const mine = extract(panel.html);
        const theirs = extract(ref.html);
        if (!sameList(mine, theirs)) {
          fail(rule, label + ": " + what + " weichen ab — " + firstDiff(mine, theirs));
        }
      }
    }

    // --- Navigation passt auf die Abschnitte ---
    if (nav) {
      const entries = nav[panel.lang];
      if (!entries) continue; // meldet bereits check-page.js
      if (entries.length !== own.length) {
        fail(
          "parity-nav",
          panel.lang + ": " + entries.length + " Navigationspunkte für " + own.length + " Abschnitte"
        );
        continue;
      }
      const navIds = entries.map((e) => e.id);
      const sectionIds = own.map((s) => s.id);
      if (!sameList(navIds, sectionIds)) {
        fail(
          "parity-nav",
          panel.lang + ": Navigation und Abschnitte in anderer Reihenfolge — " + firstDiff(navIds, sectionIds)
        );
      }
      const stars = entries.map((e) => e.star);
      const refStars = (nav[ref.lang] || []).map((e) => e.star);
      if (refStars.length === stars.length && !sameList(stars, refStars)) {
        fail("parity-nav-star", label + ": ⭐ sitzt an anderer Stelle — " + firstDiff(stars, refStars));
      }
    }
  }

  return problems;
}

function main() {
  const problems = checkParity(fs.readFileSync(PAGE, "utf8"));
  const count = panels(fs.readFileSync(PAGE, "utf8")).length;
  if (problems.length === 0) {
    console.log("✓ " + count + " Sprachfassungen sind deckungsgleich.");
    return 0;
  }
  for (const p of problems) console.error("  [" + p.rule + "] " + p.message);
  console.error("\n✗ " + problems.length + " Abweichung(en) zwischen den Sprachfassungen.");
  return 1;
}

if (require.main === module) process.exit(main());

module.exports = {
  checkParity,
  panels,
  sections,
  blockFingerprint,
  clockTimes,
  externalLinks,
  verbatimCells,
  navSections,
  stripComments,
};
