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

// What the prompt carries once the plugin is done: the stand-in for the
// engine records the input it receives.
async function submit($: any, on: any) {
  const seen: any[] = []
  on('prompt.submit', (_: unknown, e: any) => {
    seen.push(e)
    return { text: e.text }
  })
  await start($, on)
  return async (text = 'hallo') => {
    await $.prompt.submit({ text })
    return seen.at(-1)?.context ?? []
  }
}

test('abwesend attaches its rules to the prompt', async ($, on) => {
  const send = await submit($, on)
  await modus($, 'abwesend')
  expect(await send()).toEqual([MODES.abwesend.rules])
})

test('vorbereiten attaches its own rules', async ($, on) => {
  const send = await submit($, on)
  await modus($, 'vorbereiten')
  expect(await send()).toEqual([MODES.vorbereiten.rules])
})

test('no mode set: nothing attached', async ($, on) => {
  const send = await submit($, on)
  expect(await send()).toEqual([])
})

test('back to begleitet attaches nothing again', async ($, on) => {
  const send = await submit($, on)
  await modus($, 'abwesend')
  await modus($, 'begleitet')
  expect(await send()).toEqual([])
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
