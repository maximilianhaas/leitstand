import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-21T12:00:00Z')
const DIR = '/home/max/.claude/leitstand'

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

type World = { files?: Record<string, string>; listFails?: boolean }

// Nothing sits beneath the plugin: these hooks stand for the engine.
async function start($: any, on: any, world: World = {}) {
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { HOME: '/home/max' })
  const opened: unknown[] = []
  const state = { panes: [{ id: 'cockpit', title: 'Cockpit', isShown: true, isFocused: false, isPlaced: true }], lists: 0, paneReads: 0 }
  on('fs.write', () => ({ value: undefined }))
  on('fs.list', () => {
    state.lists++
    if (world.listFails) throw new Error('no dir')
    return { value: Object.keys(world.files ?? {}).map(name => ({ name, kind: 'file', size: 1 })) }
  })
  on('fs.read', (_: unknown, e: any) => ({ value: world.files?.[e.path.slice(DIR.length + 1)] ?? '' }))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/p/leitstand' }))
  on('command.register', (_: unknown, e: any) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', (_: unknown, e: unknown) => (opened.push(e), { value: { isPlaced: true } }))
  on('ui.panes', () => (state.paneReads++, { value: state.panes }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/p/leitstand', surface: 'desktop', isInteractive: true })
  const reply = await $.command.run({ command: 'cockpit', args: '' })
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

test('a closed pane stops the reading', async ($, on) => {
  const { clock, state } = await start($, on, { files: {} })
  await clock.advance(5_000)
  state.panes = []
  await clock.advance(5_000)
  const lists = state.lists
  const paneReads = state.paneReads
  await clock.advance(15_000)
  expect(state.lists).toBe(lists)
  // the timer itself is gone, not just skipping its work
  expect(state.paneReads).toBe(paneReads)
})
