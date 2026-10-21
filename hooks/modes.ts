export type ModeId = 'begleitet' | 'abwesend' | 'vorbereiten'

export const MODES: Record<ModeId, { label: string; rules: string | null }> = {
  begleitet: { label: 'Begleitet', rules: null },
  abwesend: {
    label: 'Abwesend',
    rules: `Agentenmodus: Abwesend. Max ist nicht am Rechner. Dieser Modus hat Vorrang vor Plan- und OK-Regeln der CLAUDE.md und vor Superpowers-Freigabeschritten. Sicherheitsregeln und ausdrückliches OK für Unumkehrbares bleiben.
- Plan in die Sitzung schreiben, nicht auf Freigabe warten.
- Offene Fragen: die vorsichtigste, umkehrbare Variante wählen und unter „Annahmen“ festhalten.
- Nicht selbst ausführen, sondern unter „Wartet auf dein OK“ parken und am Rest weiterarbeiten: mergen, deployen, pushen, PR öffnen, löschen, Mails oder Nachrichten senden, Zahlungen, Konto-Einstellungen.
- Commits auf dem eigenen Branch sind erlaubt.
- Am Ende jeder Aufgabe dieser Block: Erledigt · Annahmen · Offene Fragen · Wartet auf dein OK · Wie geprüft.`,
  },
  vorbereiten: {
    label: 'Nur vorbereiten',
    rules: `Agentenmodus: Nur vorbereiten. Dieser Modus hat Vorrang vor Plan- und OK-Regeln der CLAUDE.md und vor Superpowers-Freigabeschritten. Sicherheitsregeln und ausdrückliches OK für Unumkehrbares bleiben.
- Lesen, analysieren, Plan schreiben, Fragen sammeln.
- Keine Änderungen an Projektdateien, keine Commits. Erlaubt sind nur Plan- und Notizdateien unter docs/ oder im Scratchpad.
- Am Ende dieser Block: Plan · Fragen an dich · Risiken · Aufwand.`,
  },
}

const isMode = (value: unknown): value is ModeId => typeof value === 'string' && Object.hasOwn(MODES, value)

export function parseMode(arg: string): ModeId | null {
  const id = arg.trim().toLowerCase()
  return isMode(id) ? id : null
}

export function toMode(stored: unknown): ModeId {
  return isMode(stored) ? stored : 'begleitet'
}
