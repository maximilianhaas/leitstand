import { expect, test } from 'claude-code/testing'
import { MODES } from './modes'

// The test's $ has no $.state of its own: the stored mode is read back
// through `/modus` without an argument, which reports it.
async function start($: any, on: any) {
  // Nothing sits beneath the plugin: these hooks stand for the engine.
  on('command.register', () => ({ value: { command: 'modus' } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
}

const modus = async ($: any, args: string): Promise<string> =>
  (await $.command.run({ command: 'modus', args })).text

test('/modus abwesend stores the mode', async ($, on) => {
  await start($, on)
  expect(await modus($, 'abwesend')).toContain('Abwesend')
  expect(await modus($, '')).toContain('Aktueller Modus: Abwesend')
})

test('/modus trims and ignores case', async ($, on) => {
  await start($, on)
  await modus($, '  Abwesend ')
  expect(await modus($, '')).toContain('Aktueller Modus: Abwesend')
})

test('/modus with an unknown name refuses and changes nothing', async ($, on) => {
  await start($, on)
  const text = await modus($, 'nur vorbereiten')
  expect(text).toContain('begleitet')
  expect(text).toContain('abwesend')
  expect(text).toContain('vorbereiten')
  expect(await modus($, '')).toContain('Aktueller Modus: Begleitet')
})

test('/modus alone shows the current mode', async ($, on) => {
  await start($, on)
  expect(await modus($, '')).toContain('Begleitet')
})

const BASE = { id: 'base', text: 'x', scope: 'shared' } as const

async function compose($: any, on: any) {
  on('prompt.compose', () => ({ sections: [BASE] }))
  await start($, on)
}

const INPUT = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] }
const sections = async ($: any) => (await $.prompt.compose(INPUT)).sections

test('abwesend appends its rules last, as a session section', async ($, on) => {
  await compose($, on)
  await modus($, 'abwesend')
  const list = await sections($)
  expect(list[0].id).toBe('base')
  expect(list.at(-1)).toEqual({ id: 'leitstand:modus', text: MODES.abwesend.rules, scope: 'session' })
})

test('vorbereiten appends its own rules', async ($, on) => {
  await compose($, on)
  await modus($, 'vorbereiten')
  expect((await sections($)).at(-1).text).toBe(MODES.vorbereiten.rules)
})

test('no mode set: prompt unchanged', async ($, on) => {
  await compose($, on)
  expect(await sections($)).toEqual([BASE])
})

test('back to begleitet removes the block', async ($, on) => {
  await compose($, on)
  await modus($, 'abwesend')
  await modus($, 'begleitet')
  expect(await sections($)).toEqual([BASE])
})

test('a new start of the session restores the status line', async ($, on) => {
  const shown: unknown[] = []
  on('command.register', () => ({ value: { command: 'modus' } }))
  on('ui.status', (_: unknown, e: unknown) => {
    shown.push(e)
    return { value: undefined }
  })
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await modus($, 'abwesend')
  shown.length = 0
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(JSON.stringify(shown)).toContain('Modus: Abwesend')
})
