# Cockpit (Plugin „leitstand“, Stufe 2)

Stand: 21.10.2026 · Status: Entwurf zur Freigabe

## Ziel
Max arbeitet mit sehr vielen Claude-Code-Sitzungen parallel in der Desktop-App.
Die Seitenleiste reicht ihm nicht, um zu sehen, wie viel gerade läuft. Ein
Cockpit-Fenster neben dem Chat zeigt über alle Sitzungen: oben Zahlen, darunter
eine Liste je Sitzung.

**Erfolg:** Max öffnet `/cockpit` in einer beliebigen Sitzung und sieht innerhalb
von 5 Sekunden, welche Sitzungen arbeiten, welche auf ihn warten und welche
fertig sind, dazu Modus und laufende Unteragenten.

**Nicht Teil von Stufe 2:** Modus aus dem Cockpit umschalten, Klick auf eine
Zeile springt zur Sitzung (bietet die Mod-API nicht), Aufräumen alter Dateien
(`$.fs` kann nicht löschen; die Dateien sind klein, ausgeblendet wird im Cockpit).

## Grundsatz
Kein Raten. Jeder Status kommt aus einem Ereignis, das die Sitzung selbst meldet.
Was sich nicht sicher melden lässt, zeigt das Cockpit als „unklar“ an.

## Ansatz
Jede Sitzung schreibt nur ihre eigene Datei (Melder). Das Cockpit liest alle
Dateien alle 5 Sekunden neu. Verworfen: gemeinsamer `$.store` (unklar, ob Werte
zwischen getrennten Prozessen live ankommen) und Auswerten der
Gesprächsprotokolle (wäre Raten).

## Schritt 0: Zähler-Test (vor dem Bauen)
Lehre aus Stufe 1: `prompt.compose` feuerte in der Desktop-App nicht, obwohl
`claude plugin test` grün war. Darum zuerst eine Wegwerf-Mod
`leitstand-probe` im Dev-Mod-Ordner einer Sitzung. Sie zählt in
`~/.claude/leitstand-probe.json`:

- Anzahl je Ereignis: `session.start`, `turn.start`, `turn.complete`,
  `tool.call`, `session.end`, jeweils getrennt nach Hauptschleife und
  Unteragent (`agentId`).
- Die gesehenen Werkzeugnamen bei `tool.call` (insbesondere `AskUserQuestion`,
  `ExitPlanMode`, `mcp__ccd_turn__wrap_up`) und bei wrap_up, ob `ask` gesetzt war.
- Ob `turn.start` den getippten Text enthält.
- Den letzten Stand von `$.agent.list()` (id, type, status).
- Ob `$.fs.write` nach `~/.claude/` schreiben darf.

Max führt in dieser Sitzung aus: eine Nachricht, eine Rückfrage
(AskUserQuestion), eine Planfreigabe (ExitPlanMode), einen Unteragenten, das
Schließen der Sitzung. Was nicht feuert, wird in dieser Spec gestrichen oder
ersetzt; die Änderung bekommt Max zum OK. Danach wird die Test-Mod gelöscht.

**Ergebnis (22./23.10.2026):** Alle Ereignisse feuern in der Desktop-App,
getrennt nach Haupt- und Unteragent; `tools` enthielt `AskUserQuestion`,
`ExitPlanMode`, `mcp__ccd_turn__wrap_up` (mit `ask`); `$.fs.write` nach
`~/.claude/` geht; `session.end` kam beim Beenden der App (Grund `other`).
`$.agent.list()` lieferte den Unteragenten mit `status`. Einziger Fund: der
Text bei `turn.start` (und `prompt.submit`) trägt vorangestellte
System-Hinweise, siehe `title`.

## Melder (läuft in jeder Sitzung)

### Datei
`~/.claude/leitstand/<sessionId>.json`, geschrieben nur von der eigenen Sitzung.
Der Home-Pfad kommt aus `$.env.get("HOME")`; `$.fs.write` legt fehlende Ordner
selbst an:

```json
{
  "v": 1,
  "sessionId": "…",
  "title": "Plane Stufe 2 des Plugins leitstand",
  "project": "leitstand",
  "cwd": "/Users/maximilian.haas/Documents/Projects/leitstand",
  "status": "arbeitend",
  "waitingFor": null,
  "mode": "abwesend",
  "agents": 2,
  "updatedAt": "2026-10-21T14:03:00.000Z"
}
```

- `title`: erster Satz der ersten Nachricht von Max, höchstens 60 Zeichen
  (mit „…“ gekürzt). Bis dahin leer. Grund: Die Mod-API kennt den
  Sitzungstitel der App nicht. Vorher werden Blöcke der Form `<tag>…</tag>`
  entfernt: Die App stellt Max' Text System-Hinweise (`<system-reminder>`)
  voran, und Hintergrund-Meldungen (`<task-notification>`) bestehen nur aus
  einem solchen Block (Zähler-Test). Bleibt nichts übrig, gilt der Text als leer.
- `project`: letzter Teil von `cwd`.
- `status`: `arbeitend`, `wartet`, `bereit` oder `beendet`.
- `waitingFor`: bei `wartet` `"Rückfrage"` oder `"Plan"`, sonst `null`.
- `mode`: Agentenmodus aus Stufe 1 (`begleitet`, `abwesend`, `vorbereiten`).
- `agents`: Zahl der Unteragenten mit Status `running` laut `$.agent.list()`.
- `updatedAt`: Zeitpunkt des letzten Lebenszeichens (ISO).

### Ereignisse

| Ereignis | Wirkung |
|---|---|
| `session.start` | Datei anlegen, Status `bereit` |
| `turn.start` (Hauptschleife) | Status `arbeitend`; Titel beim ersten nicht leeren Text setzen |
| `tool.call` `AskUserQuestion` (Hauptschleife) | vor `next`: `wartet` / „Rückfrage“; nach `next`: `arbeitend` |
| `tool.call` `ExitPlanMode` (Hauptschleife) | wie oben mit „Plan“ |
| `tool.call` `mcp__ccd_turn__wrap_up` mit gesetztem `ask` | merkt sich die offene Frage für das Rundenende |
| jeder andere `tool.call` | nur Lebenszeichen, höchstens alle 30 s geschrieben |
| `turn.complete` (Hauptschleife) | `wartet` / „Rückfrage“, wenn wrap_up eine Frage hatte, sonst `bereit` (auch bei Abbruch oder Fehler); Merker zurücksetzen |
| `turn.start` / `turn.complete` eines Unteragenten | `agents` neu zählen und schreiben |
| `/modus` (Stufe 1) | `mode` sofort mitschreiben |
| `session.end` | Status `beendet` schreiben (`$.fs` kann nicht löschen) |

Die wrap_up-Regel passt zur Regel in Max' CLAUDE.md: Jede Rückfrage geht über
die Frage-Box. Rechte-Abfragen der App (Permission-Dialoge) sieht die Mod nicht;
eine solche Sitzung steht weiter auf `arbeitend` und wird nach 10 Minuten
„unklar“.

### Zustand
Status, Titel und der wrap_up-Merker liegen in `$.state` (überleben Neuladen der
Mod). Neue Werte im Vertrag `types/index.d.ts`. Fehlt ein Wert, gelten `bereit`,
leerer Titel und kein Merker.

### Fehlerfälle
- Jeder Schreib- und Löschversuch läuft in `try/catch`; ein Fehler wird
  verschluckt. Die Sitzung darf nie an der Mod scheitern (wie Stufe 1).
- `HOME` fehlt: der Melder schreibt nichts.

## Cockpit-Fenster

### Öffnen
Befehl `/cockpit` (`command.register` in `session.start`) öffnet das Fenster per
`$.ui.open({ id: "cockpit", title: "Cockpit" })`. Ein zweiter Aufruf holt es nur
nach vorn. Geht in jeder Sitzung.

### Neu laden
Solange das Fenster offen ist, liest ein Zeitgeber (`$.clock.every`, 5 s) den
Ordner `~/.claude/leitstand/` (`$.fs.list`, `$.fs.read`) und legt die Einträge
in `$.state`; das Fenster zeichnet sich dadurch neu. Ist das Fenster zu, stoppt
der Zeitgeber.

### Rechenlogik (`board.ts`, rein, ohne `$`)
Eingang: die gelesenen Dateien (Text) und die aktuelle Zeit. Ausgang: Zahlen und
sortierte Zeilen.

- Kaputte oder fremde Dateien (kein gültiges JSON, `v` nicht 1) werden
  übersprungen.
- `status` `beendet` oder `updatedAt` älter als 24 h: ausgeblendet.
- `status` `arbeitend` und `updatedAt` älter als 10 Min: **unklar** (grau),
  zählt oben nicht mit.
- Zahlen oben: Arbeitend, Wartet auf dich, Bereit, Unteragenten aktiv (Summe
  `agents` der nicht ausgeblendeten, nicht unklaren Sitzungen).
- Reihenfolge: Wartet (am längsten Wartende zuerst), Arbeitet, Bereit, Unklar;
  innerhalb einer Gruppe neueste zuerst.

### Aufbau

```
 Arbeitend 4   Wartet auf dich 2   Bereit 7   Unteragenten aktiv 3
 ─────────────────────────────────────────────────────────────────
 Wartet (Rückfrage)  Plane Stufe 2 des Plugins…  leitstand  Begleitet  0  vor 2 Min
 Wartet (Plan)       Login-Seite umbauen…        titan      Begleitet  0  vor 9 Min
 Arbeitet            Tests für Import…           hr-suite   Abwesend   2  vor 10 s
 Bereit              Angebot Müller…             vertrieb   Begleitet  0  vor 1 h
 Unklar (grau)       Deploy prüfen…              website    Abwesend   1  vor 14 Min
```

Spalten: Status, Titel (leer: „(noch ohne Nachricht)“), Projekt, Modus,
Unteragenten, Zeit seit `updatedAt`. Die eigene Sitzung trägt „(diese)“.
Symbole und Farben richten sich danach, was die Desktop-Oberfläche zeichnet.

Leerer Zustand: „Noch keine Sitzung gemeldet. Sitzungen melden sich erst nach
einem Neustart mit dem Plugin.“

### Fehlerfälle
- Ordner fehlt oder ist leer: leerer Zustand.
- Eine Datei lässt sich nicht lesen: wird übersprungen, der Rest erscheint.

## Aufbau im Repo

| Datei | Inhalt |
|---|---|
| `hooks/reporter.ts` | Melder: Datei-Inhalt bauen, schreiben, löschen |
| `hooks/board.ts` | reine Rechenlogik für das Cockpit |
| `hooks/register.tsx` | Ereignisse verdrahten, Befehl `/cockpit`, Fenster zeichnen |
| `types/index.d.ts` | neue `$.state`-Werte |
| `.claude-plugin/plugin.json` | Version 0.2.0, Beschreibung ergänzt |

Stufe 1 (`modes.ts`, `/modus`, Regelblock) bleibt unverändert.

## Tests
- Automatisch (`claude plugin test`):
  1. `turn.start` setzt `arbeitend`, Titel nur beim ersten Mal.
  2. `AskUserQuestion` setzt `wartet` / „Rückfrage“, danach `arbeitend`;
     `ExitPlanMode` ebenso mit „Plan“.
  3. wrap_up mit `ask` führt am Rundenende zu `wartet`, ohne `ask` zu `bereit`.
  4. Unteragenten-Zahl folgt `$.agent.list()`.
  5. `session.end` schreibt `beendet`.
  6. Ein Schreibfehler lässt die Runde unberührt.
  7. `board.ts`: Zahlen, Sortierung, 10-Min- und 24-h-Grenze, kaputte Datei.
  8. Fenster wird auf `desktop` und `terminal` gezeichnet, leerer Zustand.
  9. Alle Tests aus Stufe 1 bleiben grün.
- Statisch: `claude plugin validate`, `tsc`.
- Echttest in der Desktop-App: zwei Sitzungen; eine öffnet `/cockpit`, die
  andere arbeitet, stellt eine Rückfrage und wird fertig. Das Fenster zeigt
  jeden Wechsel innerhalb von 5 s. Normalfall mitprüfen: Sitzung ohne Frage geht
  von `arbeitend` auf `bereit`.

## Abschluss
Review mit `/review` (mehrere Dateien), Installation wie in Stufe 1
(bestehende Sitzungen bekommen den Melder erst nach Neustart), Notiz per
`/brain-drop`.
