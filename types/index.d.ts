// string, not ModeId: a stored value may predate a renamed mode
export type StoredMode = string

export type Status = 'arbeitend' | 'wartet' | 'bereit' | 'beendet'
export type WaitingFor = 'Rückfrage' | 'Plan' | null

// one file per session under ~/.claude/leitstand/, written by its reporter
export type SessionFile = {
  v: 1
  sessionId: string
  title: string
  project: string
  cwd: string
  status: Status
  waitingFor: WaitingFor
  mode: string
  agents: number
  updatedAt: string
}

declare module 'claude-code' {
  interface PluginState {
    leitstand: { mode: StoredMode; status: Status; waitingFor: WaitingFor; title: string; pendingAsk: boolean; files: string[]; readAt: number; cwd: string }
  }
}
