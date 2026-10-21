import { expect, test } from 'claude-code/testing'

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
