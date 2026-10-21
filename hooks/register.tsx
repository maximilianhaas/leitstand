import type { Register } from 'claude-code'

import { MODES, parseMode, toMode } from './modes'

// not exported: the engine refuses a $.state reference that leaves the module
const MODE_REF = { plugin: 'leitstand', key: 'mode' } as const

const IDS = Object.keys(MODES).join(', ')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'modus',
      description: 'Agentenmodus setzen: begleitet, abwesend, vorbereiten',
    })
    // a reload or resume keeps $.state but not the status line
    try {
      const id = toMode((await $.state.get(MODE_REF)).value)
      if (id !== 'begleitet') $.ui.status(`Modus: ${MODES[id].label}`)
    } catch {}

    return next(e)
  })

  on('command.run', { command: 'modus' }, async ($, e) => {
    if (e.args.trim() === '') {
      const current = toMode((await $.state.get(MODE_REF)).value)
      return { text: `Aktueller Modus: ${MODES[current].label}. Möglich: ${IDS}.` }
    }

    const id = parseMode(e.args)
    if (!id) return { text: `Unbekannter Modus „${e.args.trim()}“. Möglich: ${IDS}.` }

    await $.state.set(MODE_REF, id)
    $.ui.status(id === 'begleitet' ? undefined : `Modus: ${MODES[id].label}`)

    return { text: `Modus: ${MODES[id].label}. Gilt ab der nächsten Runde.` }
  })

  on('prompt.compose', async ($, e, next) => {
    const base = await next(e)
    try {
      const rules = MODES[toMode((await $.state.get(MODE_REF)).value)].rules
      if (!rules) return base

      return { sections: [...base.sections, { id: 'leitstand:modus', text: rules, scope: 'session' }] }
    } catch {
      // the session must never fail because of this mod
      return base
    }
  })
}
