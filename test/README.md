# Tests

Drei Stufen, absichtlich getrennt:

```
npm run lint    # Markup + Sprachparität (tools/)
npm test        # Unit-Tests (test/)
npm run check   # beides — ohne jede Abhängigkeit
npm run smoke   # die Seite im Browser (smoke/) — braucht Playwright
```

`lint` und `test` laufen in einem frischen Checkout ohne `npm install`.
Nur `smoke` braucht einen Browser; fehlt er, überspringen sich die Tests mit
einem Hinweis, statt fehlzuschlagen. In CI läuft der Browser-Job getrennt
und mit `SMOKE_REQUIRED=1`, damit ein fehlender Browser dort nicht als
"alles übersprungen, also grün" durchgeht.

## `check-page.test.js`

Deckt `tools/check-page.js` ab: den Kopfbereich (`noindex`, Viewport,
charset, `lang`, Titel), doppelte IDs, ob jede Sprachschaltfläche eine
Fassung hat, ob `navConfig` und die Abschnitte zusammenpassen und ob externe
Links `rel="noopener"` tragen.

## `i18n-parity.test.js`

Deckt `tools/i18n-parity.js` ab — die Prüfung, die die fünf Sprachfassungen
in Deckung hält. Gepflegt wird die Seite fast immer in einer Sprache: jemand
ergänzt einen Stichpunkt auf Deutsch, die anderen vier bleiben zurück. Das
fällt beim Bauen nicht auf, weil die spanische Fassung weiterhin heil
aussieht — es fällt dem Volunteer auf, der am Sonntag danach sucht.

Verglichen wird deshalb alles, was sich beim Übersetzen *nicht* ändern darf:

- dieselben Abschnitte in derselben Reihenfolge, mit denselben Nummern
- derselbe Aufbau je Abschnitt — Absätze, Listen, Tabellenzeilen; die
  Inline-Auszeichnung bleibt der Übersetzung überlassen
- dieselben Uhrzeiten in derselben Reihenfolge, wobei die französische
  Schreibweise `16h25` als `16:25` zählt
- dieselben externen Links
- dieselben Zoom-Begriffe in den Tabellenspalten (`Yes`/`No`, `Restricted`,
  `Meeting group chat`) — das sind Bedienbegriffe, keine Prosa
- eine Navigation, die 1:1 und in derselben Reihenfolge auf die Abschnitte
  ihrer Sprachfassung passt, mit dem ⭐ an derselben Stelle

Referenz ist die erste Fassung im Dokument (derzeit Deutsch).

## `smoke/` — die Seite im Browser

Kein Unit-Test, sondern die Gegenprobe: `page.smoke.js` öffnet `index.html`
wirklich und prüft, was sich im Markup nicht zeigt — dass nichts in der
Konsole bricht, dass die Passwortabfrage über dem Guide liegt und ein
Fehlversuch sich nichts merkt, dass nach jedem Sprachwechsel genau eine
Fassung sichtbar ist und die Navigation danach auf Abschnitte genau dieser
Sprache zeigt.
