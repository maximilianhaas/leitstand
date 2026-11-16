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
  // added in 0.4.0, absent in older files
  context?: number
  limits?: Limit[]
  subagents?: Subagent[]
}

// one rate-limit window of the account, e.g. five_hour at 42 %
export type Limit = { kind: string; percent: number }

export type Subagent = {
  id: string
  description: string
  type: string
  model: string
  worktree: string
  status: string
  startedAt: number
  endedAt?: number
}

// the desktop app's own record of a session: the title in its sidebar, its local_ id
export type AppName = { title: string; id: string }

// what agent.spawn knows and agent.list does not
export type AgentMeta = { model: string; worktree: string; startedAt: number; endedAt?: number }

declare module 'claude-code' {
  interface PluginState {
    leitstand: { mode: StoredMode; status: Status; waitingFor: WaitingFor; title: string; pendingAsk: boolean; files: string[]; readAt: number; cwd: string; agentMeta: Record<string, AgentMeta>; names: Record<string, AppName> }
  }
}
