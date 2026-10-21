# leitstand

Claude-Code-Plugin: Agentenmodi pro Sitzung.

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

Hinweis: Der Modus gilt pro Sitzung. Nach einem Neustart der App kann er wieder auf „begleitet“ stehen; die Statuszeile zeigt immer den wirksamen Modus.
