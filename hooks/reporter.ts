import type { AgentMeta, Limit, SessionFile, Status, Subagent, WaitingFor } from '../types'

// not exported: the engine refuses a $.state reference that leaves the module
const MODE = { plugin: 'leitstand', key: 'mode' } as const
const STATUS = { plugin: 'leitstand', key: 'status' } as const
const WAITING = { plugin: 'leitstand', key: 'waitingFor' } as const
const TITLE = { plugin: 'leitstand', key: 'title' } as const
const PENDING = { plugin: 'leitstand', key: 'pendingAsk' } as const
// the main loop's: a subagent in a worktree of its own answers its own cwd
const CWD = { plugin: 'leitstand', key: 'cwd' } as const
const META = { plugin: 'leitstand', key: 'agentMeta' } as const

const HEARTBEAT_MS = 30_000
// shortcut: lost on a reload, then the next heartbeat writes at once; harmless
let lastWrite = -Infinity

// the app puts <system-reminder> blocks before the typed text, and a
// background notice is nothing but a <task-notification> block
export function titleOf(text: string): string {
  const plain = text.replace(/<([a-z][\w-]*)>[\s\S]*?<\/\1>/g, '').trim()
  const first = plain.split(/[.!?\n]/)[0]!.trim()
  return first.length > 60 ? `${first.slice(0, 59)}…` : first
}

// worktree name from a cwd or prompt (".claude/worktrees/<name>"), else Hauptordner
export function worktreeOf(text: string | undefined): string {
  const hit = /\.claude\/worktrees\/([\w.-]+)/.exec(text ?? '')
  return hit ? hit[1]! : 'Hauptordner'
}

// "claude-sonnet-5-5" -> "sonnet"
export function modelLabel(model: string | undefined): string {
  if (!model) return '?'
  const hit = /(opus|sonnet|haiku|fable)/i.exec(model)
  return hit ? hit[1]!.toLowerCase() : model
}

const DONE = ['completed', 'failed', 'killed']
const KEEP_DONE_MS = 3_600_000
const MAX_SUBAGENTS = 10

// the list joined with what agent.spawn saw; marks newly finished ones, so meta
// comes back as a new object only when something changed
export function subagentsOf(
  list: { id: string; description: string; type: string; status: string }[],
  meta: Record<string, AgentMeta>,
  now: number,
): { subagents: Subagent[]; meta: Record<string, AgentMeta> } {
  let next = meta
  const all: Subagent[] = []
  for (const a of list) {
    let m = next[a.id]
    const done = DONE.includes(a.status)
    // one spawned before the mod loaded: count from first sight
    if (!m || (done && m.endedAt === undefined)) {
      m = { model: '?', worktree: 'Hauptordner', startedAt: now, ...m, ...(done ? { endedAt: now } : {}) }
      next = { ...next, [a.id]: m }
    }
    if (done && now - (m.endedAt ?? now) > KEEP_DONE_MS) continue
    all.push({ id: a.id, description: a.description, type: a.type, model: m.model, worktree: m.worktree, status: a.status, startedAt: m.startedAt, endedAt: done ? m.endedAt : undefined })
  }
  all.sort((a, b) => Number(DONE.includes(a.status)) - Number(DONE.includes(b.status)) || b.startedAt - a.startedAt)
  return { subagents: all.slice(0, MAX_SUBAGENTS), meta: next }
}

// subagents spawn in parallel: write only over the version read, else read again
async function editMeta($: any, edit: (meta: Record<string, AgentMeta>) => Record<string, AgentMeta>): Promise<Record<string, AgentMeta>> {
  let meta: Record<string, AgentMeta> = {}
  for (let i = 0; i < 5; i++) {
    const held = await $.state.get(META)
    meta = edit(held.value ?? {})
    if (meta === held.value || (await $.state.set(META, meta, { ifVersion: held.version })).isSet) break
  }
  return meta
}

// never throws: the session must never fail because of this mod
export async function report($: any, opts: { heartbeat?: boolean; sessionId?: string } = {}): Promise<void> {
  try {
    const now: number = await $.clock.now()
    if (opts.heartbeat && now - lastWrite < HEARTBEAT_MS) return
    const home: string | undefined = await $.env.get('HOME')
    if (!home) return
    const id: string = opts.sessionId ?? (await $.session.id())
    const cwd: string = (await $.state.get(CWD)).value || (await $.session.cwd())
    const list = await $.agent.list()
    const agents = list.filter((a: { status: string }) => a.status === 'running').length
    const { subagents } = subagentsOf(list, await editMeta($, meta => subagentsOf(list, meta, now).meta), now)
    let context: number | undefined
    let limits: Limit[] | undefined
    // a host without usage figures still gets its file
    try {
      const usage = await $.session.usage()
      context = usage.context.percent
      limits = usage.rateLimits.map((r: { kind: string; percentUsed: number }) => ({ kind: r.kind, percent: Math.round(r.percentUsed) }))
    } catch {}
    const file: SessionFile = {
      v: 1,
      sessionId: id,
      title: (await $.state.get(TITLE)).value ?? '',
      project: cwd.split('/').filter(Boolean).at(-1) ?? '',
      cwd,
      status: (await $.state.get(STATUS)).value ?? 'bereit',
      waitingFor: (await $.state.get(WAITING)).value ?? null,
      mode: (await $.state.get(MODE)).value ?? 'begleitet',
      agents,
      updatedAt: new Date(now).toISOString(),
      context,
      limits,
      subagents,
    }
    lastWrite = now
    await $.fs.write(`${home}/.claude/leitstand/${id}.json`, JSON.stringify(file))
  } catch {}
}

// agent.spawn knows the model and where it runs; agent.list does not
export async function agentSpawned($: any, input: { cwd?: string; prompt: string; model?: string }, result: { agentId?: string; model?: string }): Promise<void> {
  if (!result.agentId) return
  try {
    const now: number = await $.clock.now()
    const entry: AgentMeta = { model: modelLabel(result.model ?? input.model), worktree: worktreeOf(input.cwd ?? input.prompt), startedAt: now }
    await editMeta($, meta => ({ ...meta, [result.agentId!]: entry }))
  } catch {}
  await report($)
}

// only ever called from the main loop
export async function setStatus($: any, status: Status, waitingFor: WaitingFor = null, sessionId?: string): Promise<void> {
  try {
    await $.state.set(CWD, await $.session.cwd())
    await $.state.set(STATUS, status)
    await $.state.set(WAITING, waitingFor)
  } catch {}
  await report($, { sessionId })
}

export async function turnStarted($: any, text: string): Promise<void> {
  try {
    const title = titleOf(text)
    if (title && !(await $.state.get(TITLE)).value) await $.state.set(TITLE, title)
  } catch {}
  await setStatus($, 'arbeitend')
}

export async function turnEnded($: any): Promise<void> {
  let asked = false
  try {
    asked = (await $.state.get(PENDING)).value === true
    await $.state.set(PENDING, false)
  } catch {}
  await setStatus($, asked ? 'wartet' : 'bereit', asked ? 'Rückfrage' : null)
}

export async function flagAsk($: any): Promise<void> {
  try {
    await $.state.set(PENDING, true)
  } catch {}
}

// session.start also runs on every reload of the mod: keep what is still true
export async function sessionStarted($: any): Promise<void> {
  let status: Status | undefined
  try {
    status = (await $.state.get(STATUS)).value
  } catch {}
  await (status === undefined || status === 'beendet' ? setStatus($, 'bereit') : report($))
}

// after /clear the process goes on under a new id with no session.start
export async function sessionEnded($: any, sessionId: string, reason: string): Promise<void> {
  await setStatus($, 'beendet', null, sessionId)
  if (reason !== 'clear') return
  try {
    await $.state.set(STATUS, 'bereit')
    await $.state.set(TITLE, '')
    await $.state.set(PENDING, false)
  } catch {}
}
