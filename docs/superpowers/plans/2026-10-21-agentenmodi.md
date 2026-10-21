# Agentenmodi (leitstand, Stufe 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plugin `leitstand` mit Befehl `/modus`, der pro Sitzung einen von drei Agentenmodi setzt und dessen Regeln bei jeder Runde an den System-Prompt hängt.

**Architecture:** Claude-Code-Mod (Hooks-Modul `register.tsx`). Modus liegt in `$.state` (pro Sitzung). `command.run` setzt ihn, `prompt.compose` hängt bei Bedarf einen `session`-Abschnitt an, `$.ui.status` zeigt ihn. Regeltexte als reine Daten in `modes.ts`.

**Tech Stack:** TypeScript/TSX gegen `claude-code` (Build 2.1.304), Tests mit `claude-code/testing` über `claude plugin test`.

**Spec:** `docs/superpowers/specs/2026-10-21-agentenmodi-design.md`

**API-Referenz:** `/private/tmp/claude-501/bundled-skills/2.1.304/f8108bf6cc6e6ef7b1fcf0a0c8e67be6/plugin-authoring/types/claude-code.d.ts` (grep nach `CommandRunInput`, `PromptComposeResult`, `state: {`), Beispiele im Nachbarordner `examples/` (`pane.tsx`, `pane.test.tsx`, `pane-state.d.ts`). `claude` liegt nicht im PATH: `C="$HOME/Library/Application Support/Claude/claude-code/2.1.304/6bbba6adc37f/claude.app/Contents/MacOS/claude"`.

## Global Constraints

- Modus-IDs exakt: `begleitet`, `abwesend`, `vorbereiten`. Standard ohne Wert: `begleitet`.
- Anzeigenamen exakt: „Begleitet“, „Abwesend“, „Nur vorbereiten“.
- Abschnitt-ID im System-Prompt: `leitstand-modus`, `scope: 'session'`, immer ans Ende.
- Bei `begleitet` wird kein Abschnitt angehängt und die Statuszeile geleert (`$.ui.status(undefined)`).
- Statuszeile sonst: `Modus: Abwesend` bzw. `Modus: Nur vorbereiten`.
- Die Sitzung darf nie an der Mod scheitern: jeder Fehler in `prompt.compose` reicht `next(e)` unverändert durch.
- Kein `$.store`, nur `$.state`.
- Texte deutsch, keine Gedankenstriche (—) in Regeltexten.

## Review Focus

1. `/modus  Abwesend ` (Großschreibung, Leerzeichen) soll wie `abwesend` wirken → Test in Task 2.
2. `/modus nur vorbereiten` (zwei Wörter, Anzeigename statt ID) soll ablehnen und die drei IDs nennen, nichts ändern → Test in Task 2.
3. Gespeicherter Wert ist Unsinn (z. B. alter/umbenannter Modus) → wie `begleitet`, kein Abschnitt → Test in Task 3.
4. Lesen des Zustands wirft in `prompt.compose` → Prompt unverändert → Test in Task 3.
5. Zurückschalten auf `begleitet` entfernt den Abschnitt in der nächsten Runde wieder → Test in Task 3.

---

### Task 1: Gerüst und Modus-Daten

**Files:**
- Create: `.claude-plugin/plugin.json` → `{ "name": "leitstand", "version": "0.1.0", "description": "Agentenmodi pro Sitzung (/modus)", "types": "./types/index.d.ts" }`
- Create: `hooks/hooks.json` → `{ "modules": ["./register.tsx"] }`
- Create: `types/index.d.ts` (Vertrag: `interface PluginState { leitstand: { mode: string } }`, Muster wie `pane-state.d.ts`; `string` statt `ModeId`, weil gespeicherte Altwerte vorkommen können, siehe Review Focus 3)
- Create: `hooks/modes.ts`
- Create: `hooks/register.tsx` (vorerst leeres `register`)
- Test: `hooks/modes.test.ts`

**Interfaces:**
- Produces (`hooks/modes.ts`):
  - `export type ModeId = 'begleitet' | 'abwesend' | 'vorbereiten'`
  - `export const MODES: Record<ModeId, { label: string; rules: string | null }>`
  - `export function parseMode(arg: string): ModeId | null` (trim, lowercase, nur exakte IDs)
  - `export function toMode(stored: unknown): ModeId` (gültige ID → sie selbst, sonst `'begleitet'`)

- [ ] **Step 1: Failing test `hooks/modes.test.ts`**
  - `parseMode('abwesend') === 'abwesend'`, `parseMode('  Abwesend ') === 'abwesend'`, `parseMode('nur vorbereiten') === null`, `parseMode('') === null`
  - `toMode(undefined) === 'begleitet'`, `toMode('weg') === 'begleitet'`, `toMode('vorbereiten') === 'vorbereiten'`
  - `MODES.begleitet.rules === null`; `MODES.abwesend.rules` enthält `Wartet auf dein OK`; `MODES.vorbereiten.rules` enthält `Keine Änderungen an Projektdateien`
- [ ] **Step 2:** `"$C" plugin test .` → FAIL (modes.ts fehlt)
- [ ] **Step 3: `hooks/modes.ts` schreiben.** Regeltexte (exakt, aus der Spec):

  `abwesend`:
  ```
  Agentenmodus: Abwesend. Max ist nicht am Rechner. Dieser Modus hat Vorrang vor Plan- und OK-Regeln der CLAUDE.md und vor Superpowers-Freigabeschritten.
  - Plan in die Sitzung schreiben, nicht auf Freigabe warten.
  - Offene Fragen: die vorsichtigste, umkehrbare Variante wählen und unter „Annahmen“ festhalten.
  - Nicht selbst ausführen, sondern unter „Wartet auf dein OK“ parken und am Rest weiterarbeiten: mergen, deployen, pushen, PR öffnen, löschen, Mails oder Nachrichten senden, Zahlungen, Konto-Einstellungen.
  - Commits auf dem eigenen Branch sind erlaubt.
  - Am Ende jeder Aufgabe dieser Block: Erledigt · Annahmen · Offene Fragen · Wartet auf dein OK · Wie geprüft.
  ```
  `vorbereiten`:
  ```
  Agentenmodus: Nur vorbereiten. Dieser Modus hat Vorrang vor Plan- und OK-Regeln der CLAUDE.md und vor Superpowers-Freigabeschritten.
  - Lesen, analysieren, Plan schreiben, Fragen sammeln.
  - Keine Änderungen an Projektdateien, keine Commits. Erlaubt sind nur Plan- und Notizdateien unter docs/ oder im Scratchpad.
  - Am Ende dieser Block: Plan · Fragen an dich · Risiken · Aufwand.
  ```
- [ ] **Step 4:** `"$C" plugin test .` → PASS
- [ ] **Step 5:** `git add -A && git commit -m "feat: Gerüst und Modus-Daten"`

### Task 2: Befehl `/modus` mit Zustand und Statuszeile

**Files:**
- Modify: `hooks/register.tsx`
- Test: `hooks/register.test.tsx`

**Interfaces:**
- Consumes: `parseMode`, `toMode`, `MODES`, `ModeId` aus Task 1
- Produces: `const MODE_REF = { plugin: 'leitstand', key: 'mode' } as const` (in `register.tsx`, von Task 3 genutzt)

- [ ] **Step 1: Failing tests in `hooks/register.test.tsx`** (Engine-Stellvertreter wie in `pane.test.tsx`: `on('command.register', () => ({ value: { command: 'modus' } }))`, `on('session.start', (_, e) => ({ cwd: e.cwd }))`; dann `$.session.start(...)`, danach `$.command.run({ command: 'modus', args })`)
  - `args: 'abwesend'` → `text` enthält `Abwesend`; `$.state.get(MODE_REF)` ergibt `value === 'abwesend'`
  - `args: '  Abwesend '` → `value === 'abwesend'`
  - `args: 'nur vorbereiten'` → `text` enthält `begleitet`, `abwesend` und `vorbereiten`; Zustand unverändert
  - `args: ''` → `text` enthält den aktuellen Anzeigenamen (`Begleitet` ohne gesetzten Wert)
- [ ] **Step 2:** `"$C" plugin test .` → FAIL
- [ ] **Step 3: Implementieren in `register.tsx`:** in `session.start` `$.command.register({ name: 'modus', description: 'Agentenmodus setzen: begleitet, abwesend, vorbereiten' })`, dann `next(e)`. Hook `on('command.run', { command: 'modus' }, ...)`: leeres Argument → aktuellen Modus + Liste zurückgeben; ungültig → Hinweis mit den drei IDs; gültig → `$.state.set(MODE_REF, id)`, `$.ui.status(id === 'begleitet' ? undefined : 'Modus: ' + MODES[id].label)`, Bestätigung `Modus: <label>. Gilt ab der nächsten Runde.` Antwort jeweils `{ text }` ohne `next`.
- [ ] **Step 4:** `"$C" plugin test .` → PASS
- [ ] **Step 5:** `git commit -am "feat: /modus setzt den Agentenmodus"`

### Task 3: Regelblock im System-Prompt

**Files:**
- Modify: `hooks/register.tsx`
- Test: `hooks/register.test.tsx`

**Interfaces:**
- Consumes: `MODE_REF` (Task 2), `toMode`, `MODES` (Task 1)

- [ ] **Step 1: Failing tests** (Engine-Stellvertreter: `on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'x', scope: 'shared' }] }))`; aufrufen mit `$.prompt.compose()`)
  - Zustand `abwesend` → letzte Section `{ id: 'leitstand-modus', scope: 'session' }`, Text = `MODES.abwesend.rules`; `base` bleibt erste
  - Zustand `vorbereiten` → Text = `MODES.vorbereiten.rules`
  - kein Zustand → genau 1 Section (`base`)
  - Zustand `'weg'` (direkt per `$.state.set`) → genau 1 Section
  - erst `abwesend`, dann `/modus begleitet` → nächster `compose` hat genau 1 Section
  - `$.state.get` wirft (Stellvertreter `on('state.get', () => { throw new Error('x') })`) → Ergebnis gleich dem von `next(e)`
- [ ] **Step 2:** `"$C" plugin test .` → FAIL
- [ ] **Step 3: Implementieren:** `on('prompt.compose', async ($, e, next) => ...)`: `const base = await next(e)`; in `try` Modus lesen, `toMode`, bei Regeltext `{ sections: [...base.sections, { id: 'leitstand-modus', text, scope: 'session' }] }`; sonst und im `catch` `base`.
- [ ] **Step 4:** `"$C" plugin test .` → PASS
- [ ] **Step 5:** `git commit -am "feat: Regelblock je Modus im System-Prompt"`

### Task 4: Prüfen, Echttest, Installation, Verankerung

**Files:**
- Create: `.claude-plugin/marketplace.json` → Marketplace `leitstand`, ein Plugin `leitstand`, `source: "./"`
- Create: `README.md` (5-10 Zeilen: Zweck, `/modus`-Befehle, Installation)
- Modify: `~/.claude/CLAUDE.md` (Absatz unter „Arbeitsweise“, Wortlaut aus der Spec, Abschnitt „Verankerung“)

- [ ] **Step 1:** `"$C" plugin validate .` → keine Fehler; Typprüfung `npx -y -p typescript tsc -p .` (tsconfig laut Header der API-Typdatei, außerhalb des Repos ablegen, falls nötig) → 0 Fehler
- [ ] **Step 2: Echttest:** `ln -s ~/Documents/Projects/leitstand ~/.claude/dev-mods/<sitzungs-id>/leitstand`; Nutzer bestätigt „Turn them on“; `/modus abwesend` → Statuszeile zeigt `Modus: Abwesend`; nächste Runde: Claude bestätigt den Regelblock im System-Prompt; `/modus begleitet` → Block weg. Danach Symlink entfernen.
- [ ] **Step 3: Installation:** `"$C" plugin marketplace add ~/Documents/Projects/leitstand` und `"$C" plugin install leitstand@leitstand` → `claude plugin list` zeigt `leitstand` (scope user)
- [ ] **Step 4:** Absatz in `~/.claude/CLAUDE.md` einfügen (Edit, kein Überschreiben)
- [ ] **Step 5:** `git add -A && git commit -m "chore: Marketplace, README, Installation"`; Review mit `/ponytail-review` (kleine Änderung laut CLAUDE.md)
