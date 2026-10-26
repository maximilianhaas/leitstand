import { expect, mock, test } from 'claude-code/testing'

import { register } from './register'
import { modelLabel, subagentsOf, titleOf, worktreeOf } from './reporter'

const PATH = '/home/max/.claude/leitstand/s1.json'

type Opts = { usage?: unknown; world?: { id: string; cwd: string }; env?: Record<string, string>; agents?: unknown[]; failWrite?: boolean; tool?: () => unknown }

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
  if (opts.usage) on('session.usage', () => ({ value: opts.usage }))
  on('agent.spawn', () => ({ agentId: 'a1', model: 'claude-haiku-5-5' }))
  const world = opts.world ?? { id: 's1', cwd: '/p/leitstand' }
  on('session.id', () => ({ value: world.id }))
  on('session.cwd', () => ({ value: world.cwd }))
  on('command.register', () => ({ value: { command: 'modus' } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('turn.start', (_: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', (_: unknown, e: any) => ({ sessionId: e.sessionId }))
  on('tool.call', () => opts.tool?.() ?? { result: {} })
  await $.session.start({ cwd: '/p/leitstand', surface: 'desktop', isInteractive: true })
  const last = () => JSON.parse(writes.filter(w => w.path === PATH).at(-1)?.text ?? 'null')
  return { writes, last, clock, world }
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

test('W3: a subagent in its own worktree does not change the project', async ($, on) => {
  const { last, world } = await start($, on)
  await turnStart($, 'a')
  world.cwd = '/p/leitstand/.claude/worktrees/agent-x'
  await $.turn.start({ text: 'sub', turnId: 't2', agentId: 'a1' })
  expect(last()).toMatchObject({ project: 'leitstand', cwd: '/p/leitstand' })
})

test('W4: after /clear the new session gets its own title and status', async ($, on) => {
  const { writes, world } = await start($, on)
  await turnStart($, 'Alt. x')
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} as any })
  world.id = 's2'
  await ($ as any).command.run({ command: 'modus', args: 'abwesend' })
  const s2 = () => JSON.parse(writes.filter(w => w.path.endsWith('/s2.json')).at(-1)!.text)
  expect(s2().status).toBe('bereit')
  await turnStart($, 'Neu. y')
  expect(s2()).toMatchObject({ title: 'Neu', status: 'arbeitend' })
})

test('W5: a reload keeps a waiting session waiting', async ($, on) => {
  const { last } = await start($, on)
  await turnStart($, 'a')
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'r', ask: 'Passt?' })
  await turnComplete($)
  await $.session.start({ cwd: '/p/leitstand', surface: 'desktop', isInteractive: true })
  expect(last()).toMatchObject({ status: 'wartet', waitingFor: 'Rückfrage' })
})

test('worktreeOf and modelLabel', () => {
  expect(worktreeOf('/p/.claude/worktrees/fix-1/src')).toBe('fix-1')
  expect(worktreeOf(undefined)).toBe('Hauptordner')
  expect(modelLabel('claude-sonnet-5-5')).toBe('sonnet')
  expect(modelLabel(undefined)).toBe('?')
})

test('subagentsOf marks the end once and drops old finished ones', () => {
  const list = [
    { id: 'a1', description: 'd', type: 'Explore', status: 'completed' },
    { id: 'a2', description: 'd', type: 'Explore', status: 'running' },
  ]
  const meta = { a1: { model: 'haiku', worktree: 'w', startedAt: 0 }, a2: { model: 'sonnet', worktree: 'Hauptordner', startedAt: 5 } }
  const first = subagentsOf(list, meta, 100)
  expect(first.meta.a1!.endedAt).toBe(100)
  expect(first.subagents.map(a => a.id)).toEqual(['a2', 'a1'])
  const again = subagentsOf(list, first.meta, 200)
  expect(again.meta).toBe(first.meta)
  expect(subagentsOf(list, first.meta, 100 + 3_600_001).subagents.map(a => a.id)).toEqual(['a2'])
})

test('the file carries context, limits and spawned subagents', async ($, on) => {
  const usage = { startedAt: 0, context: { window: 200_000, percent: 63 }, rateLimits: [{ kind: 'five_hour', percentUsed: 41.6 }] }
  const agents = [{ id: 'a1', type: 'Explore', status: 'running', description: 'Suche' }]
  const { last } = await start($, on, { usage, agents })
  await $.agent.spawn({ prompt: 'arbeite in /p/.claude/worktrees/w1', description: 'Suche', subagentType: 'Explore' } as any)
  expect(last()).toMatchObject({ context: 63, limits: [{ kind: 'five_hour', percent: 42 }] })
  expect(last().subagents).toEqual([expect.objectContaining({ id: 'a1', model: 'haiku', worktree: 'w1', status: 'running' })])
})
