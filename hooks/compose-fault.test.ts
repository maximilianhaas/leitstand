import { expect, test } from 'claude-code/testing'

import { register } from './register'

// The kit answers $.state itself, so a failing read is staged by calling
// the prompt.compose hook directly with a stand-in $.
test('a failing state read leaves the prompt unchanged', async () => {
  const hooks: Record<string, Function> = {}
  register(((name: string, ...rest: Function[]) => {
    hooks[name] = rest.at(-1)!
  }) as any, {} as any)
  const base = { sections: [{ id: 'base', text: 'x', scope: 'shared' }] }
  const $ = { state: { get: async () => { throw new Error('x') } } }
  expect(await hooks['prompt.compose']!($, {}, async () => base)).toBe(base)
})
