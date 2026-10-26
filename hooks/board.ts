import type { Limit, SessionFile, Subagent, WaitingFor } from '../types'

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
  context?: number
}
// a subagent with the session it runs in
export type SubRow = Subagent & { session: string }
export type Board = {
  counts: { arbeitend: number; wartet: number; bereit: number; agents: number }
  rows: Row[]
  // the account's windows, from the freshest file that has them
  limits: Limit[]
  subagents: SubRow[]
}

const ORDER: RowState[] = ['wartet', 'arbeitend', 'bereit', 'unklar']
const STATUSES = ['arbeitend', 'wartet', 'bereit', 'beendet']
// a hand-edited or foreign file must never break the drawing
const str = (value: unknown) => (typeof value === 'string' ? value : '')
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
const DONE = ['completed', 'failed', 'killed']
const MAX_SUBAGENTS = 15

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
  let limits: Limit[] = []
  let limitsAge = Infinity
  const subagents: SubRow[] = []
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
      context: num(f.context),
    })
    if (Array.isArray(f.limits) && f.limits.length && ageMs < limitsAge) {
      limits = f.limits.filter(l => typeof l?.kind === 'string' && num(l.percent) !== undefined)
      limitsAge = ageMs
    }
    if (state === 'unklar' || !Array.isArray(f.subagents)) continue
    for (const a of f.subagents) {
      if (typeof a?.id !== 'string' || num(a.startedAt) === undefined) continue
      subagents.push({ ...a, description: str(a.description), type: str(a.type), model: str(a.model), worktree: str(a.worktree), status: str(a.status), endedAt: num(a.endedAt), session: str(f.title) || str(f.project) })
    }
  }
  subagents.sort((a, b) => Number(DONE.includes(a.status)) - Number(DONE.includes(b.status)) || b.startedAt - a.startedAt)
  rows.sort((a, b) =>
    ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || (a.state === 'wartet' ? b.ageMs - a.ageMs : a.ageMs - b.ageMs),
  )
  return { counts, rows, limits, subagents: subagents.slice(0, MAX_SUBAGENTS) }
}

export const STATUS_DE: Record<string, string> = {
  running: 'läuft',
  waiting: 'wartet',
  pending: 'startet',
  idle: 'bereit',
  completed: 'fertig',
  failed: 'Fehler',
  killed: 'gestoppt',
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} Min`
}

const WINDOW_DE: Record<string, string> = { five_hour: '5 h', seven_day: '7 Tage' }
export function limitLine(limits: Limit[]): string {
  return limits.map(l => `${WINDOW_DE[l.kind] ?? l.kind} ${l.percent} %`).join(' · ')
}

export function ago(ms: number): string {
  if (ms < 60_000) return `vor ${Math.floor(ms / 1000)} s`
  if (ms < 3_600_000) return `vor ${Math.floor(ms / 60_000)} Min`
  return `vor ${Math.floor(ms / 3_600_000)} h`
}

// the status line is narrow: two short titles at most, the rest as +N
export function compactLine(c: Board['counts'], waiting?: string[]): string {
  const short = (t: string) => (t.length > 22 ? `${t.slice(0, 21)}…` : t)
  const more = waiting && waiting.length > 2 ? ` +${waiting.length - 2}` : ''
  const names = waiting?.length ? `: ${waiting.slice(0, 2).map(short).join(', ')}${more}` : ''
  return `⏳ ${c.wartet} warten${names} · ⚙ ${c.arbeitend} arbeiten · ✓ ${c.bereit} bereit · 🤖 ${c.agents}`
}
