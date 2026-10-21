import { expect, test } from 'claude-code/testing'

import { register } from './register'

// The kit answers $.state itself, so a failing read is staged by calling
// the prompt.submit hook directly with a stand-in $.
test('a failing state read leaves the prompt unchanged', async () => {
  const hooks: Record<string, Function> = {}
  register(((name: string, ...rest: Function[]) => {
    hooks[name] = rest.at(-1)!
  }) as any, {} as any)
  const e = { text: 'hallo' }
  const passed: unknown[] = []
  const $ = { state: { get: async () => { throw new Error('x') } } }
  await hooks['prompt.submit']!($, e, async (x: unknown) => passed.push(x))
  expect(passed).toEqual([e])
})
