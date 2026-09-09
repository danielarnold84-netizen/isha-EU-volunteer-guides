"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const {
  checkParity,
  panels,
  sections,
  clockTimes,
  blockFingerprint,
  verbatimCells,
} = require("../tools/i18n-parity.js");

const PAGE = path.resolve(__dirname, "..", "index.html");
const html = fs.readFileSync(PAGE, "utf8");

const rules = (problems) => problems.map((p) => p.rule);

/**
 * Ersetzt etwas nur innerhalb einer Sprachfassung. Ein globales replace()
 * träfe alle fünf gleichzeitig — dann wäre nichts mehr auseinander.
 */
function inPanel(lang, from, to) {
  const start = html.indexOf('id="lang-' + lang + '"');
  assert.ok(start !== -1, "Sprachfassung " + lang + " nicht gefunden");
  const nextPanel = html.indexOf('class="lang-panel', start + 1);
  const end = nextPanel === -1 ? html.length : nextPanel;
  const slice = html.slice(start, end);
  assert.ok(slice.includes(from), lang + ": Textstelle nicht gefunden — " + from);
  return html.slice(0, start) + slice.replace(from, to) + html.slice(end);
}

// ---------------------------------------------------------------------------
// Die echte Seite
// ---------------------------------------------------------------------------

test("alle Sprachfassungen sind deckungsgleich", () => {
  const problems = checkParity(html);
  assert.deepStrictEqual(
    problems,
    [],
    "Abweichungen:\n" + problems.map((p) => "  [" + p.rule + "] " + p.message).join("\n")
  );
});

test("fünf Fassungen mit je neun Abschnitten", () => {
  const all = panels(html);
  assert.deepStrictEqual(all.map((p) => p.lang), ["de", "en", "es", "it", "fr"]);
  for (const p of all) {
    assert.strictEqual(sections(p.html).length, 9, p.lang);
  }
});

test("die letzte Fassung endet vor dem Skript", () => {
  // Sonst zählten navConfig und Passwort-Gate als französischer Inhalt.
  const last = panels(html).at(-1);
  assert.strictEqual(last.lang, "fr");
  assert.ok(!last.html.includes("navConfig"));
  assert.ok(!last.html.includes("PW_HASH"));
});

test("die französische Schreibweise 16h25 zählt als 16:25", () => {
  const de = panels(html).find((p) => p.lang === "de");
  const fr = panels(html).find((p) => p.lang === "fr");
  assert.ok(fr.html.includes("16h25"), "Voraussetzung: fr schreibt 16h25");
  assert.deepStrictEqual(clockTimes(fr.html), clockTimes(de.html));
  assert.ok(clockTimes(fr.html).includes("16:25"));
});

test("der Aufbau ignoriert Inline-Auszeichnung", () => {
  // Wo die Betonung im Satz sitzt, ist Sache der Übersetzung.
  const a = blockFingerprint("<p>Ein <b>Wort</b> im Satz</p>");
  const b = blockFingerprint("<p>Ein Wort im <em>Satz</em></p>");
  assert.deepStrictEqual(a, b);
});

test("Zoom-Begriffe werden mit ihrer Spalte erfasst", () => {
  const de = panels(html).find((p) => p.lang === "de");
  const cells = verbatimCells(de.html);
  assert.ok(cells.includes("yes=Yes"));
  assert.ok(cells.includes("restricted=Restricted"));
  assert.ok(cells.includes("chat-setting=Meeting group chat"));
});

// ---------------------------------------------------------------------------
// Die Regeln selbst
// ---------------------------------------------------------------------------

test("ein nur in einer Sprache ergänzter Stichpunkt wird gemeldet", () => {
  const broken = inPanel("en", "<li>Chat: ", "<li>New in English only</li>\n    <li>Chat: ");
  const problems = checkParity(broken);
  assert.ok(rules(problems).includes("parity-structure"));
  assert.ok(problems.some((p) => /en vs\. de/.test(p.message)));
});

test("ein gelöschter Stichpunkt wird gemeldet", () => {
  const broken = inPanel("es", "<li>✅ Chat</li>", "");
  assert.ok(rules(checkParity(broken)).includes("parity-structure"));
});

test("eine abweichende Uhrzeit wird gemeldet", () => {
  const broken = inPanel("es", "16:25", "16:35");
  const problems = checkParity(broken);
  assert.ok(rules(problems).includes("parity-time"));
  assert.ok(problems.some((p) => /16:35/.test(p.message)));
});

test("ein übersetzter Zoom-Begriff wird gemeldet", () => {
  const broken = inPanel("it", '<td class="yes">Yes</td>', '<td class="yes">Sì</td>');
  const problems = checkParity(broken);
  assert.ok(rules(problems).includes("parity-verbatim"));
  assert.ok(problems.some((p) => /Sì/.test(p.message)));
});

test("ein fehlender Abschnitt wird gemeldet", () => {
  const start = html.indexOf('<section id="fr-zoom">');
  const end = html.indexOf("</section>", start) + "</section>".length;
  const broken = html.slice(0, start) + html.slice(end);
  const problems = checkParity(broken);
  assert.ok(rules(problems).includes("parity-sections"));
  assert.ok(problems.some((p) => /fr vs\. de: 8 Abschnitte statt 9/.test(p.message)));
});

test("eine verschobene Abschnittsnummer wird gemeldet", () => {
  const broken = inPanel("en", '<span class="num">4</span>', '<span class="num">9</span>');
  assert.ok(rules(checkParity(broken)).includes("parity-section-num"));
});

test("ein abweichender externer Link wird gemeldet", () => {
  const broken = inPanel("en", "https://docs.google.com/spreadsheets/d/1SLVN6im", "https://example.org/x?a=1SLVN6im");
  assert.ok(rules(checkParity(broken)).includes("parity-link"));
});

test("eine Abschnitts-ID ohne Sprachpräfix wird gemeldet", () => {
  const broken = html.replace('<section id="es-qa">', '<section id="qa">');
  assert.ok(rules(checkParity(broken)).includes("parity-section-id"));
});

test("eine gegen die Abschnitte verdrehte Navigation wird gemeldet", () => {
  const broken = html.replace(
    "{id:'en-setup',label:'Setup'},\n    {id:'en-dryrun',label:'Dry Runs'},",
    "{id:'en-dryrun',label:'Dry Runs'},\n    {id:'en-setup',label:'Setup'},"
  );
  assert.notStrictEqual(broken, html, "Voraussetzung: navConfig-Stelle gefunden");
  const problems = checkParity(broken);
  assert.ok(rules(problems).includes("parity-nav"));
  assert.ok(problems.some((p) => /Reihenfolge/.test(p.message)));
});

test("ein verschobener ⭐-Punkt wird gemeldet", () => {
  const broken = html
    .replace("{id:'es-flow',label:'⭐ Flujo',star:true}", "{id:'es-flow',label:'Flujo'}")
    .replace("{id:'es-qa',label:'Q&A'}", "{id:'es-qa',label:'⭐ Q&A',star:true}");
  assert.notStrictEqual(broken, html, "Voraussetzung: navConfig-Stellen gefunden");
  assert.ok(rules(checkParity(broken)).includes("parity-nav-star"));
});

test("eine einsprachige Seite hat nichts zu vergleichen", () => {
  const single = '<div class="lang-panel" id="lang-de"><section id="de-a"><p>x</p></section></div>';
  assert.deepStrictEqual(checkParity(single), []);
});

test("eine Seite ohne Sprachfassungen wird gemeldet", () => {
  assert.deepStrictEqual(rules(checkParity("<p>nichts</p>")), ["parity-langs"]);
});
