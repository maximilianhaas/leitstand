# Agentenmodi (Plugin „leitstand“, Stufe 1)

Stand: 21.10.2026 · Status: Entwurf zur Freigabe

## Ziel
Max arbeitet mit vielen Claude-Code-Sitzungen parallel und ist oft nicht am Rechner.
Pro Sitzung soll sich einstellen lassen, wie selbstständig Claude arbeitet: mit
Rückfragen und Freigaben (wie bisher), allein mit gesammelten Fragen und
Zusammenfassung am Ende, oder nur vorbereitend ohne Änderungen.

**Erfolg:** `/modus abwesend` in einer Sitzung führt dazu, dass Claude ohne
Warten durcharbeitet, Annahmen protokolliert und mit dem festen Abschlussblock
endet. Neue Sitzungen starten in „Begleitet“. Der Modus überlebt das Verdichten
langer Gespräche.

**Nicht Teil von Stufe 1:** Cockpit, Status-Melder, Umschalten aus dem Cockpit,
frei wählbarer Standardmodus. Das kommt in Stufe 2 auf derselben Basis.

## Die drei Modi

| Modus | Plan | Rückfragen | Dateien ändern | Ende |
|---|---|---|---|---|
| Begleitet (Standard) | zeigen, auf OK warten | einzeln stellen | nach OK | kurze Meldung |
| Abwesend | schreiben, nicht warten | sammeln, selbst entscheiden | ja | Abschlussblock |
| Nur vorbereiten | ausarbeiten | sammeln | nein (außer Plan/Notizen) | Vorbereitungsblock |

### Begleitet
Kein Regelblock. Es gilt die CLAUDE.md wie bisher.

### Abwesend
- Plan in die Sitzung schreiben, nicht auf Freigabe warten.
- Bei offenen Fragen die vorsichtigste, umkehrbare Variante wählen und unter
  „Annahmen“ festhalten.
- Unumkehrbares oder nach außen Gehendes (mergen, deployen, pushen, PR öffnen,
  löschen, Mails/Nachrichten senden, Zahlungen, Einstellungen von Konten)
  nicht ausführen, sondern unter „Wartet auf dein OK“ parken und am Rest
  weiterarbeiten.
- Commits auf dem eigenen Branch sind erlaubt.
- Superpowers-Freigabeschritte (Brainstorming-Gates) gelten in diesem Modus
  nicht; Design und Plan werden geschrieben, aber nicht abgewartet.
- Abschlussblock am Ende jeder abgeschlossenen Aufgabe:
  **Erledigt · Annahmen · Offene Fragen · Wartet auf dein OK · Wie geprüft**.

### Nur vorbereiten
- Lesen, analysieren, Plan schreiben, Fragen sammeln.
- Keine Änderungen an Projektdateien, keine Commits. Erlaubt: Plan- und
  Notizdateien unter `docs/` bzw. im Scratchpad.
- Vorbereitungsblock am Ende: **Plan · Fragen an dich · Risiken · Aufwand**.

### Grenzen in jedem Modus
Kein Modus hebt Claudes eigene Sicherheitsregeln auf. Unumkehrbares und nach
außen Gehendes braucht immer Max' ausdrückliches OK im Chat.

## Aufbau

Projekt: `~/Documents/Projects/leitstand/` (eigenes Git-Repo).

```
leitstand/
  .claude-plugin/plugin.json        Manifest (Name, Version, types)
  .claude-plugin/marketplace.json   lokaler Marketplace für die Installation
  hooks/hooks.json                  { "modules": ["./register.tsx"] }
  hooks/register.tsx                Ereignis-Hooks (Befehl, Prompt, Status)
  hooks/modes.ts                    Modusnamen + Regeltexte (reine Daten)
  hooks/register.test.tsx           Tests
  types/index.d.ts                  Vertrag für $.state (Wert: mode)
```

### Bausteine
- **`modes.ts`**: Liste der Modi (`begleitet`, `abwesend`, `vorbereiten`) mit
  Anzeigename und Regeltext. Begleitet hat keinen Regeltext. Einzige Stelle zum
  Anpassen der Texte.
- **Befehl `/modus [name]`** (`command.register` in `session.start`,
  beantwortet über `command.run`):
  - mit gültigem Namen: Modus in `$.state` (pro Sitzung) speichern,
    Statuszeile setzen, Bestätigung zurückgeben.
  - ohne Namen: aktuellen Modus und die drei Möglichkeiten anzeigen.
  - unbekannter Name: Hinweis mit den gültigen Namen, nichts ändern.
- **Regelblock** (`prompt.compose`): Ist der Modus nicht „begleitet“, wird ein
  Abschnitt `leitstand-modus` mit `scope: 'session'` ans Ende angehängt.
  Wirksam ab der nächsten Runde.
- **Statuszeile** (`$.ui.status`): „Modus: Abwesend“ bzw. „Modus: Nur
  vorbereiten“; bei Begleitet leer.

### Datenfluss
`/modus abwesend` → `command.run` → `$.state.mode = 'abwesend'` → nächste
Runde: `prompt.compose` liest den Modus → hängt den Regelblock an → Claude
arbeitet nach den Regeln.

### Speicherung
`$.state` gilt pro Sitzung und überlebt Neuladen der Mod. Fehlt ein Wert, gilt
„begleitet“. Kein `$.store` (das wäre sitzungsübergreifend).

## Verankerung in der CLAUDE.md
Neuer Absatz unter „Arbeitsweise“ in `~/.claude/CLAUDE.md`:

> **Agentenmodus** (`/modus`, Plugin leitstand): Ohne gesetzten Modus gilt
> Begleitet. Ist ein Modus aktiv, hat er Vorrang vor den Plan- und OK-Regeln
> hier und vor Superpowers. Die Sicherheitsgrenzen bleiben.

## Fehlerfälle
- Unbekannter Modusname: Hinweis, keine Änderung.
- Fehlender oder ungültiger gespeicherter Wert: wie „begleitet“ behandeln.
- Hook-Fehler in `prompt.compose`: Prompt unverändert durchreichen
  (die Sitzung darf nie an der Mod scheitern).

## Tests
- Automatisch (`claude plugin test`):
  1. `/modus abwesend` speichert den Modus und meldet ihn zurück.
  2. Bei „abwesend“ und „vorbereiten“ hängt `prompt.compose` den passenden
     Abschnitt an; bei „begleitet“ und ohne Wert nicht.
  3. `/modus quatsch` lehnt ab und ändert nichts.
  4. `/modus` ohne Argument zeigt den aktuellen Modus.
- Statisch: `claude plugin validate`, Typprüfung mit `tsc`.
- Echttest: Projektordner per Symlink in den Dev-Mod-Ordner dieser Sitzung
  (`~/.claude/dev-mods/<sitzung>/leitstand`) hängen, damit er ohne Neustart
  lädt; `/modus abwesend` setzen,
  prüfen, dass der Regelblock in der nächsten Runde ankommt; zurück auf
  „begleitet“ prüfen, dass er wegfällt.

## Installation
Lokaler Marketplace im Repo, dann `claude plugin marketplace add
~/Documents/Projects/leitstand` und `claude plugin install leitstand@leitstand`
(Scope user). Bestehende Sitzungen bekommen das Plugin erst nach Neustart.
Später: Aufnahme ins private Org-Marketplace-Repo.
