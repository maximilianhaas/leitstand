# leitstand

Claude-Code-Plugin: Agentenmodi pro Sitzung.

| Befehl | Wirkung |
|---|---|
| `/modus` | zeigt den aktuellen Modus |
| `/modus begleitet` | Standard: Plan zeigen, auf OK warten |
| `/modus abwesend` | allein durcharbeiten, Fragen sammeln, Abschlussblock am Ende |
| `/modus vorbereiten` | nur planen, nichts ändern |

Neue Sitzungen starten in „begleitet“. Regeltexte: `hooks/modes.ts`.
Spezifikation: `docs/superpowers/specs/2026-10-21-agentenmodi-design.md`.

Installation (lokal):

    claude plugin marketplace add ~/Documents/Projects/leitstand
    claude plugin install leitstand@leitstand
