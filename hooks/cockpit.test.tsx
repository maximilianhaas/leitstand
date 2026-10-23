import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-21T12:00:00Z')
const DIR = '/home/max/.claude/leitstand'
const SETTING = '/home/max/.claude/leitstand-anzeige.json'

const PANE = {
  plugin: 'leitstand',
  component: 'Pane',
  requestId: 'cockpit',
  props: { title: 'Cockpit', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const file = (over: Record<string, unknown>) =>
  JSON.stringify({
    v: 1, sessionId: 'x', title: 'Titel', project: 'p', cwd: '/p', status: 'bereit',
    waitingFor: null, mode: 'begleitet', agents: 0, updatedAt: new Date(NOW).toISOString(), ...over,
  })

type World = { setting?: string; noCommand?: boolean; files?: Record<string, string>; listFails?: boolean; mtimes?: Record<string, number>; slowRead?: boolean }

// Nothing sits beneath the plugin: these hooks stand for the engine.
async function start($: any, on: any, world: World = {}) {
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { HOME: '/home/max' })
  const opened: unknown[] = []
  const state = { status: [] as unknown[], writes: [] as { path: string; text: string }[], reads: [] as string[], active: 0, maxActive: 0, panes: [{ id: 'cockpit', title: 'Cockpit', isShown: true, isFocused: false, isPlaced: true }], lists: 0, paneReads: 0 }
  on('fs.write', (_: unknown, e: any) => (state.writes.push(e), { value: undefined }))
  on('fs.list', () => {
    state.lists++
    if (world.listFails) throw new Error('no dir')
    return { value: Object.keys(world.files ?? {}).map(name => ({ name, kind: 'file', size: 1, mtimeMs: world.mtimes?.[name] ?? NOW })) }
  })
  on('fs.read', async (_: unknown, e: any) => {
    if (e.path === SETTING) {
      if (world.setting === undefined) throw new Error('no file')
      return { value: world.setting }
    }
    state.reads.push(e.path)
    state.maxActive = Math.max(state.maxActive, ++state.active)
    if (world.slowRead) await clock.sleep(6_000)
    state.active--
    return { value: world.files?.[e.path.slice(DIR.length + 1)] ?? '' }
  })
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/p/leitstand' }))
  on('command.register', (_: unknown, e: any) => ({ value: { command: e.name } }))
  on('ui.status', (_: unknown, e: unknown) => (state.status.push(e), { value: undefined }))
  on('ui.open', (_: unknown, e: unknown) => (opened.push(e), { value: { isPlaced: true } }))
  on('ui.panes', () => (state.paneReads++, { value: state.panes }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/p/leitstand', surface: 'desktop', isInteractive: true })
  const reply = world.noCommand ? undefined : await $.command.run({ command: 'cockpit', args: '' })
  return { clock, opened, state, reply }
}

const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text as string)

for (const surface of ['terminal', 'desktop'] as const) {
  test(`/cockpit opens the pane (${surface})`, async ($, on) => {
    const { opened, reply } = await start($, on)
    expect(reply.text).toContain('Cockpit')
    expect(opened).toEqual([expect.objectContaining({ id: 'cockpit', title: 'Cockpit' })])
  })

  test(`the pane shows counts and waiting first (${surface})`, async ($, on) => {
    const { clock } = await start($, on, {
      files: {
        's1.json': file({ sessionId: 's1', status: 'arbeitend', title: 'Eigene', mode: 'abwesend' }),
        's2.json': file({ sessionId: 's2', status: 'wartet', waitingFor: 'Rückfrage', title: 'Andere' }),
        'notes.txt': 'kein json',
      },
    })
    await clock.advance(5_000)
    const ui = await $.ui.mount({ ...PANE, surface })
    const all = await texts(ui)
    expect(all.join('\n')).toContain('Wartet auf dich 1')
    expect(all.join('\n')).toContain('Arbeitend 1')
    const waiting = all.findIndex((t: string) => t.includes('Andere'))
    const own = all.findIndex((t: string) => t.includes('Eigene'))
    expect(waiting).toBeGreaterThan(-1)
    expect(own).toBeGreaterThan(waiting)
    expect(all[waiting]).toContain('Wartet (Rückfrage)')
    expect(all[own]).toContain('(diese)')
    expect(all[own]).toContain('Abwesend')
    expect(all[waiting]).not.toContain('(diese)')
    await ui.unmount()
  })

  test(`an empty folder shows the empty state (${surface})`, async ($, on) => {
    const { clock } = await start($, on, { files: {} })
    await clock.advance(5_000)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await texts(ui)).join('\n')).toContain('Noch keine Sitzung gemeldet. Sitzungen melden sich erst nach einem Neustart mit dem Plugin.')
    await ui.unmount()
  })
}

test('a missing folder shows the empty state', async ($, on) => {
  const { clock } = await start($, on, { listFails: true })
  await clock.advance(5_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await texts(ui)).join('\n')).toContain('Noch keine Sitzung gemeldet.')
  await ui.unmount()
})

test('a session without a title says so', async ($, on) => {
  const { clock } = await start($, on, { files: { 's2.json': file({ sessionId: 's2', title: '' }) } })
  await clock.advance(5_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await texts(ui)).join('\n')).toContain('(noch ohne Nachricht)')
  await ui.unmount()
})

test('a closed pane with display aus stops reading the folder', async ($, on) => {
  const { clock, state } = await start($, on, { files: {} })
  await clock.advance(5_000)
  state.panes = []
  await clock.advance(5_000)
  const lists = state.lists
  await clock.advance(15_000)
  expect(state.lists).toBe(lists)
})

test('W2: files older than 24 h are not read at all', async ($, on) => {
  const { state } = await start($, on, {
    files: { 'alt.json': file({ sessionId: 'alt' }), 'neu.json': file({ sessionId: 'neu' }) },
    mtimes: { 'alt.json': NOW - 25 * 3_600_000 },
  })
  expect(state.reads.some(p => p.endsWith('alt.json'))).toBe(false)
  expect(state.reads.some(p => p.endsWith('neu.json'))).toBe(true)
})

test('W2: a slow read never overlaps the next tick', async ($, on) => {
  const world: World = { files: { 'a.json': file({}) } }
  const { clock, state } = await start($, on, world)
  world.slowRead = true
  await clock.advance(5_000)
  await clock.advance(5_000)
  await clock.advance(5_000)
  expect(state.maxActive).toBe(1)
})

const run = ($: any, args: string) => $.command.run({ command: 'cockpit', args })
const lastStatus = (state: { status: unknown[] }) => JSON.stringify(state.status.at(-1) ?? null)
const counts = (state: { writes: { path: string; text: string }[] }) => state.writes

const twoSessions = {
  's1.json': file({ sessionId: 's1', status: 'arbeitend', title: 'Eigene' }),
  's2.json': file({ sessionId: 's2', status: 'wartet', waitingFor: 'Plan', title: 'Login-Seite umbauen', project: 'titan' }),
}

test('/cockpit kompakt stores the setting and shows the counts', async ($, on) => {
  const world: World = { files: twoSessions }
  const { clock, state } = await start($, on, world)
  const reply = await run($, 'kompakt')
  expect(reply.text).toContain('kompakt')
  expect(counts(state).find(w => w.path === SETTING)?.text).toBe(JSON.stringify({ anzeige: 'kompakt' }))
  world.setting = JSON.stringify({ anzeige: 'kompakt' })
  await clock.advance(5_000)
  expect(lastStatus(state)).toContain('⏳ 1 warten · ⚙ 1 arbeiten · ✓ 0 bereit · 🤖 0')
})

test('a setting written by another session reaches this one', async ($, on) => {
  const world: World = { files: twoSessions, noCommand: true }
  const { clock, state } = await start($, on, world)
  world.setting = JSON.stringify({ anzeige: 'kompakt' })
  await clock.advance(5_000)
  expect(lastStatus(state)).toContain('⏳ 1 warten')
})

test('the mode stays in the status line beside the counts', async ($, on) => {
  const world: World = { files: twoSessions, setting: JSON.stringify({ anzeige: 'kompakt' }), noCommand: true }
  const { clock, state } = await start($, on, world)
  await ($ as any).command.run({ command: 'modus', args: 'abwesend' })
  await clock.advance(5_000)
  expect(lastStatus(state)).toContain('Modus: Abwesend · ⏳ 1 warten')
})

test('/cockpit aus clears the counts again', async ($, on) => {
  const world: World = { files: twoSessions, setting: JSON.stringify({ anzeige: 'kompakt' }), noCommand: true }
  const { clock, state } = await start($, on, world)
  await clock.advance(5_000)
  expect(lastStatus(state)).toContain('⏳')
  await run($, 'aus')
  world.setting = JSON.stringify({ anzeige: 'aus' })
  await clock.advance(5_000)
  expect(lastStatus(state)).not.toContain('⏳')
})

test('/cockpit with an unknown word explains the options', async ($, on) => {
  await start($, on, { noCommand: true })
  const reply = await run($, 'bunt')
  for (const word of ['kompakt', 'detail', 'aus']) expect(reply.text).toContain(word)
})

const BAND = {
  plugin: 'leitstand',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 100 },
} as const

test('detail shows the waiting sessions above the prompt', async ($, on) => {
  const world: World = { files: twoSessions, setting: JSON.stringify({ anzeige: 'detail' }), noCommand: true }
  const { clock } = await start($, on, world)
  await clock.advance(5_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  const all = (await texts(ui)).join('\n')
  expect(all).toContain('⏳ Login-Seite umbauen · titan')
  expect(all).not.toContain('Eigene')
  await ui.unmount()
})

test('kompakt leaves the band to the engine', async ($, on) => {
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const world: World = { files: twoSessions, setting: JSON.stringify({ anzeige: 'kompakt' }), noCommand: true }
  const { clock } = await start($, on, world)
  await clock.advance(5_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  expect((await texts(ui)).join('\n')).toBe('engine')
  await ui.unmount()
})
