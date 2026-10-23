import type { SessionFile, WaitingFor } from '../types'

export const STALE_MS = 600_000
export const HIDE_MS = 86_400_000

export type RowState = 'wartet' | 'arbeitend' | 'bereit' | 'unklar'
export type Row = {
  sessionId: string
  title: string
  project: string
  mode: string
  agents: number
  state: RowState
  waitingFor: WaitingFor
  ageMs: number
}
export type Board = {
  counts: { arbeitend: number; wartet: number; bereit: number; agents: number }
  rows: Row[]
}

const ORDER: RowState[] = ['wartet', 'arbeitend', 'bereit', 'unklar']
const STATUSES = ['arbeitend', 'wartet', 'bereit', 'beendet']
// a hand-edited or foreign file must never break the drawing
const str = (value: unknown) => (typeof value === 'string' ? value : '')

export function parseFile(text: string): SessionFile | null {
  try {
    const f = JSON.parse(text)
    const ok = f?.v === 1 && typeof f.sessionId === 'string' && STATUSES.includes(f.status) && typeof f.updatedAt === 'string'
    return ok ? f : null
  } catch {
    return null
  }
}

export function buildBoard(texts: string[], now: number): Board {
  const counts = { arbeitend: 0, wartet: 0, bereit: 0, agents: 0 }
  const rows: Row[] = []
  for (const text of texts) {
    const f = parseFile(text)
    if (!f) continue
    const ageMs = now - Date.parse(f.updatedAt)
    if (f.status === 'beendet' || !(ageMs <= HIDE_MS)) continue
    const state: RowState = f.status === 'arbeitend' && ageMs > STALE_MS ? 'unklar' : f.status
    const agents = Number(f.agents) || 0
    if (state !== 'unklar') {
      counts[state]++
      counts.agents += agents
    }
    rows.push({
      sessionId: f.sessionId,
      title: str(f.title),
      project: str(f.project),
      mode: str(f.mode),
      agents,
      state,
      waitingFor: f.waitingFor === 'Plan' ? 'Plan' : f.waitingFor === 'Rückfrage' ? 'Rückfrage' : null,
      ageMs,
    })
  }
  rows.sort((a, b) =>
    ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || (a.state === 'wartet' ? b.ageMs - a.ageMs : a.ageMs - b.ageMs),
  )
  return { counts, rows }
}

export function ago(ms: number): string {
  if (ms < 60_000) return `vor ${Math.floor(ms / 1000)} s`
  if (ms < 3_600_000) return `vor ${Math.floor(ms / 60_000)} Min`
  return `vor ${Math.floor(ms / 3_600_000)} h`
}

export const compactLine = (c: Board['counts']) =>
  `⏳ ${c.wartet} warten · ⚙ ${c.arbeitend} arbeiten · ✓ ${c.bereit} bereit · 🤖 ${c.agents}`
