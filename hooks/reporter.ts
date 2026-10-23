import type { SessionFile, Status, WaitingFor } from '../types'

// not exported: the engine refuses a $.state reference that leaves the module
const MODE = { plugin: 'leitstand', key: 'mode' } as const
const STATUS = { plugin: 'leitstand', key: 'status' } as const
const WAITING = { plugin: 'leitstand', key: 'waitingFor' } as const
const TITLE = { plugin: 'leitstand', key: 'title' } as const
const PENDING = { plugin: 'leitstand', key: 'pendingAsk' } as const
// the main loop's: a subagent in a worktree of its own answers its own cwd
const CWD = { plugin: 'leitstand', key: 'cwd' } as const

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

// never throws: the session must never fail because of this mod
export async function report($: any, opts: { heartbeat?: boolean; sessionId?: string } = {}): Promise<void> {
  try {
    const now: number = await $.clock.now()
    if (opts.heartbeat && now - lastWrite < HEARTBEAT_MS) return
    const home: string | undefined = await $.env.get('HOME')
    if (!home) return
    const id: string = opts.sessionId ?? (await $.session.id())
    const cwd: string = (await $.state.get(CWD)).value || (await $.session.cwd())
    const agents = (await $.agent.list()).filter((a: { status: string }) => a.status === 'running').length
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
    }
    lastWrite = now
    await $.fs.write(`${home}/.claude/leitstand/${id}.json`, JSON.stringify(file))
  } catch {}
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
