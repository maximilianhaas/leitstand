# leitstand

Claude-Code-Plugin: Agentenmodi pro Sitzung und ein Cockpit über alle Sitzungen.

| Befehl | Wirkung |
|---|---|
| `/modus` | zeigt den aktuellen Modus |
| `/modus begleitet` | Standard: Plan zeigen, auf OK warten |
| `/modus abwesend` | allein durcharbeiten, Fragen sammeln, Abschlussblock am Ende |
| `/modus vorbereiten` | nur planen, nichts ändern |

Neue Sitzungen starten in „begleitet“. In den anderen Modi hängt die Mod die Regeln unsichtbar an jede deiner Nachrichten (ca. 200 Tokens). Regeltexte: `hooks/modes.ts`.
Spezifikation: `docs/superpowers/specs/2026-10-21-agentenmodi-design.md`.

Installation (lokal):

    claude plugin marketplace add ~/Documents/Projects/leitstand
    claude plugin install leitstand@leitstand

## Cockpit

`/cockpit` öffnet neben dem Chat ein Fenster über alle Sitzungen. Es liest alle 5 Sekunden neu.

Oben stehen vier Zahlen:

- **Arbeitend**: Sitzungen, die gerade eine Runde laufen haben.
- **Wartet auf dich**: Sitzungen mit offener Rückfrage (Frage-Box oder AskUserQuestion) oder Planfreigabe.
- **Bereit**: Runde fertig, nichts offen.
- **Unteragenten aktiv**: laufende Unteragenten aller sichtbaren Sitzungen.

Darunter steht das Nutzungslimit des Kontos (z. B. `5 h 42 % · 7 Tage 18 %`, aus der zuletzt gemeldeten Sitzung; ohne Abo fehlt die Zeile).

Dann eine Zeile je Sitzung: Status, Titel (erster Satz deiner ersten Nachricht), Projekt, Kontext (wie voll das Kontextfenster ist, ab 80 % gelb), Modus, Unteragenten, letztes Lebenszeichen. Die eigene Sitzung trägt „(diese)“. Wartende stehen oben, die am längsten Wartende zuerst. „Unklar“ (grau) heißt: arbeitend gemeldet, aber seit 10 Minuten kein Lebenszeichen, etwa bei einem Rechte-Dialog der App, den die Mod nicht sieht. Beendete Sitzungen und alles, was älter als 24 Stunden ist, blendet das Cockpit aus.

Ganz unten stehen die **Unteragenten** aller sichtbaren Sitzungen: Status, Aufgabe, darunter Modell, Agententyp, Worktree (oder „Hauptordner“), Laufzeit und Sitzung. Laufende stehen oben. Fertige bleiben eine Stunde sichtbar, höchstens 15 Einträge. Unteragenten, die vor dem Laden des Plugins gestartet wurden, zeigen Modell „?“.

### Anzeige in der Statuszeile

| Befehl | Wirkung |
|---|---|
| `/cockpit kompakt` | Zahlen in der Statuszeile jeder Sitzung |
| `/cockpit detail` | dazu die Titel von bis zu zwei wartenden Sitzungen, der Rest als „+N“ |
| `/cockpit aus` | Statuszeile wieder ohne Zahlen (Standard) |

Die Einstellung gilt für alle Sitzungen mit dem Plugin und kommt dort spätestens nach 5 Sekunden an. Sie liegt in `~/.claude/leitstand-anzeige.json`. Die Zeichen bedeuten:

- ⏳ Sitzungen, die auf dich warten (bei `detail` mit Titel)
- ⚙ Sitzungen, die gerade arbeiten
- ✓ Sitzungen, die fertig sind und nichts Offenes haben
- 🤖 laufende Unteragenten über alle diese Sitzungen

Ein gesetzter Agentenmodus steht davor, z. B. `Modus: Abwesend · ⏳ 2 warten · …`. Die Desktop-App zeichnet kein Band über dem Eingabefeld, darum nutzt `detail` die Statuszeile.

Jede Sitzung schreibt ihren Stand nach `~/.claude/leitstand/<sitzung>.json`. Laufende Sitzungen melden sich erst nach einem Neustart mit dem Plugin. Die Dateien bleiben liegen (die Mod kann nicht löschen); sie sind klein und dürfen von Hand gelöscht werden.

Spezifikation: `docs/superpowers/specs/2026-10-21-cockpit-design.md`.

## Hinweis

Der Modus gilt pro Sitzung. Nach einem Neustart der App kann er wieder auf „begleitet“ stehen; die Statuszeile zeigt immer den wirksamen Modus.
