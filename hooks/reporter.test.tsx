import { expect, mock, test } from 'claude-code/testing'

import { register } from './register'
import { titleOf } from './reporter'

const PATH = '/home/max/.claude/leitstand/s1.json'

type Opts = { env?: Record<string, string>; agents?: unknown[]; failWrite?: boolean; tool?: () => unknown }

// Nothing sits beneath the plugin: these hooks stand for the engine.
async function start($: any, on: any, opts: Opts = {}) {
  const writes: { path: string; text: string }[] = []
  const clock = mock.clock(on, { now: Date.parse('2026-10-21T12:00:00Z') })
  mock.env(on, opts.env ?? { HOME: '/home/max' })
  on('fs.write', (_: unknown, e: any) => {
    if (opts.failWrite) throw new Error('disk full')
    writes.push(e)
    return { value: undefined }
  })
  on('agent.list', () => ({ value: opts.agents ?? [] }))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/p/leitstand' }))
  on('command.register', () => ({ value: { command: 'modus' } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('turn.start', (_: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', (_: unknown, e: any) => ({ sessionId: e.sessionId }))
  on('tool.call', () => opts.tool?.() ?? { result: {} })
  await $.session.start({ cwd: '/p/leitstand', surface: 'desktop', isInteractive: true })
  const last = () => JSON.parse(writes.filter(w => w.path === PATH).at(-1)?.text ?? 'null')
  return { writes, last, clock }
}

const turnStart = ($: any, text: string) => $.turn.start({ text, turnId: 't1' })
const turnComplete = ($: any) =>
  $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't1' })
const ask = { questions: [{ question: 'Q?', header: 'h', options: [{ label: 'a', description: 'a' }, { label: 'b', description: 'b' }], multiSelect: false }] }

test('titleOf takes the first sentence', () => {
  expect(titleOf('Plane Stufe 2. Dann mehr')).toBe('Plane Stufe 2')
  const long = titleOf('x'.repeat(80))
  expect(long.length).toBe(60)
  expect(long.endsWith('…')).toBe(true)
})

test('titleOf drops system blocks around the text', () => {
  expect(titleOf('<system-reminder>\nLinked sessions. now\n</system-reminder>\n\nTiteltest. Zweiter Satz')).toBe('Titeltest')
  expect(titleOf('<task-notification>\nDone.\n</task-notification>')).toBe('')
})

test('session.start writes bereit with project and no title', async ($, on) => {
  const { last } = await start($, on)
  expect(last()).toMatchObject({ v: 1, sessionId: 's1', status: 'bereit', project: 'leitstand', cwd: '/p/leitstand', title: '', mode: 'begleitet', agents: 0, waitingFor: null })
  expect(last().updatedAt).toBe('2026-10-21T12:00:00.000Z')
})

test('turn.start sets arbeitend and the title only once', async ($, on) => {
  const { last } = await start($, on)
  await turnStart($, 'Hallo Welt. Rest')
  expect(last()).toMatchObject({ status: 'arbeitend', title: 'Hallo Welt' })
  await turnStart($, 'Anderes')
  expect(last().title).toBe('Hallo Welt')
  await turnStart($, '')
  expect(last().title).toBe('Hallo Welt')
})

test('an empty first turn sets no title', async ($, on) => {
  const { last } = await start($, on)
  await turnStart($, '<task-notification>x</task-notification>')
  expect(last().title).toBe('')
  await turnStart($, 'Echt. Text')
  expect(last().title).toBe('Echt')
})

test('AskUserQuestion waits while it runs, then works on', async ($, on) => {
  let during: any
  const s = await start($, on, { tool: () => ((during = s.last()), { result: {} }) })
  await turnStart($, 'a')
  await $.tool.call({ tool: 'AskUserQuestion', ...ask })
  expect(during).toMatchObject({ status: 'wartet', waitingFor: 'Rückfrage' })
  expect(s.last()).toMatchObject({ status: 'arbeitend', waitingFor: null })
})

test('ExitPlanMode waits for the plan', async ($, on) => {
  let during: any
  const s = await start($, on, { tool: () => ((during = s.last()), { result: {} }) })
  await $.tool.call({ tool: 'ExitPlanMode' })
  expect(during).toMatchObject({ status: 'wartet', waitingFor: 'Plan' })
  expect(s.last().status).toBe('arbeitend')
})

test('a failing question still ends in arbeitend', async ($, on) => {
  const s = await start($, on, {
    tool: () => {
      throw new Error('denied')
    },
  })
  await $.tool.call({ tool: 'AskUserQuestion', ...ask }).catch(() => {})
  expect(s.last().status).toBe('arbeitend')
})

test('wrap_up with a question leaves the session waiting', async ($, on) => {
  const { last } = await start($, on)
  await turnStart($, 'a')
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'r', ask: 'Passt?' })
  await turnComplete($)
  expect(last()).toMatchObject({ status: 'wartet', waitingFor: 'Rückfrage' })
  await turnStart($, 'b')
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'r' })
  await turnComplete($)
  expect(last()).toMatchObject({ status: 'bereit', waitingFor: null })
})

test('agents counts running ones only', async ($, on) => {
  const { last } = await start($, on, {
    agents: [
      { id: 'a1', type: 'Explore', status: 'running', description: 'x' },
      { id: 'a2', type: 'Explore', status: 'completed', description: 'y' },
    ],
  })
  expect(last().agents).toBe(1)
})

test('session.end writes beendet', async ($, on) => {
  const { last } = await start($, on)
  await $.session.end({ reason: 'other', sessionId: 's1', resume: {} as any })
  expect(last().status).toBe('beendet')
})

test('a failing write leaves the turn untouched', async ($, on) => {
  await start($, on, { failWrite: true })
  expect(await turnStart($, 'a')).toEqual({ turnId: 't1' })
})

test('no HOME: nothing written', async ($, on) => {
  const { writes } = await start($, on, { env: {} })
  await turnStart($, 'a')
  expect(writes).toEqual([])
})

test('/modus writes the mode', async ($, on) => {
  const { last } = await start($, on)
  await ($ as any).command.run({ command: 'modus', args: 'abwesend' })
  expect(last().mode).toBe('abwesend')
})

test('other tool calls write a heartbeat at most every 30 s', async ($, on) => {
  const { writes, clock } = await start($, on)
  const before = writes.length
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(writes.length).toBe(before)
  await clock.advance(31_000)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(writes.length).toBe(before + 1)
})

// $.tool.call drops agentId, so a subagent's call is staged by calling the
// hook directly with a stand-in $.
test('a question inside a subagent never sets wartet', async () => {
  const hooks: Record<string, Function> = {}
  register(((name: string, ...rest: Function[]) => {
    hooks[name] ??= rest.at(-1)!
  }) as any, {} as any)
  const set: unknown[] = []
  const $ = { state: { set: async (_: unknown, v: unknown) => set.push(v), get: async () => ({}) } }
  await hooks['tool.call']!($, { tool: 'AskUserQuestion', agentId: 'a1' }, async () => ({}))
  expect(set).not.toContain('wartet')
})
