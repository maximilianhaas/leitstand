import type { SessionFile, Status, WaitingFor } from '../types'

// not exported: the engine refuses a $.state reference that leaves the module
const MODE = { plugin: 'leitstand', key: 'mode' } as const
const STATUS = { plugin: 'leitstand', key: 'status' } as const
const WAITING = { plugin: 'leitstand', key: 'waitingFor' } as const
const TITLE = { plugin: 'leitstand', key: 'title' } as const
const PENDING = { plugin: 'leitstand', key: 'pendingAsk' } as const

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
    const cwd: string = await $.session.cwd()
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

export async function setStatus($: any, status: Status, waitingFor: WaitingFor = null, sessionId?: string): Promise<void> {
  try {
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
