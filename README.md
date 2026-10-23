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

Darunter eine Zeile je Sitzung: Status, Titel (erster Satz deiner ersten Nachricht), Projekt, Modus, Unteragenten, letztes Lebenszeichen. Die eigene Sitzung trägt „(diese)“. Wartende stehen oben, die am längsten Wartende zuerst. „Unklar“ (grau) heißt: arbeitend gemeldet, aber seit 10 Minuten kein Lebenszeichen, etwa bei einem Rechte-Dialog der App, den die Mod nicht sieht. Beendete Sitzungen und alles, was älter als 24 Stunden ist, blendet das Cockpit aus.

Jede Sitzung schreibt ihren Stand nach `~/.claude/leitstand/<sitzung>.json`. Laufende Sitzungen melden sich erst nach einem Neustart mit dem Plugin. Die Dateien bleiben liegen (die Mod kann nicht löschen); sie sind klein und dürfen von Hand gelöscht werden.

Spezifikation: `docs/superpowers/specs/2026-10-21-cockpit-design.md`.

## Hinweis

Der Modus gilt pro Sitzung. Nach einem Neustart der App kann er wieder auf „begleitet“ stehen; die Statuszeile zeigt immer den wirksamen Modus.
