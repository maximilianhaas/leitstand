import type { Register } from 'claude-code'

import { MODES, parseMode, toMode } from './modes'
import { flagAsk, report, setStatus, turnEnded, turnStarted } from './reporter'

// not exported: the engine refuses a $.state reference that leaves the module
const MODE_REF = { plugin: 'leitstand', key: 'mode' } as const

const IDS = Object.keys(MODES).join(', ')

// main-loop tools that wait for Max while they run
const WAITS: Record<string, 'Rückfrage' | 'Plan'> = { AskUserQuestion: 'Rückfrage', ExitPlanMode: 'Plan' }

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

    const started = await next(e)
    await setStatus($, 'bereit')
    return started
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await turnStarted($, e.text)
    const started = await next(e)
    if (e.agentId !== undefined) await report($)
    return started
  })

  on('turn.complete', async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      await (e.agentId === undefined ? turnEnded($) : report($))
    }
  })

  on('tool.call', async ($, e, next) => {
    const waitFor = e.agentId === undefined ? WAITS[e.tool] : undefined
    if (waitFor) {
      await setStatus($, 'wartet', waitFor)
      try {
        return await next(e)
      } finally {
        await setStatus($, 'arbeitend')
      }
    }
    // wrap_up with a question leaves the session waiting once the turn ends
    if (e.tool === 'mcp__ccd_turn__wrap_up' && e.agentId === undefined && String((e as { ask?: unknown }).ask ?? '').trim()) await flagAsk($)
    const ran = await next(e)
    await report($, { heartbeat: true })
    return ran
  })

  on('session.end', async ($, e, next) => {
    await setStatus($, 'beendet', null, e.sessionId)
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
    await report($)
    $.ui.status(id === 'begleitet' ? undefined : `Modus: ${MODES[id].label}`)

    return { text: `Modus: ${MODES[id].label}. Gilt ab deiner nächsten Nachricht.` }
  })

  on('prompt.submit', async ($, e, next) => {
    let rules: string | null
    try {
      rules = MODES[toMode((await $.state.get(MODE_REF)).value)].rules
    } catch {
      // the session must never fail because of this mod
      return next(e)
    }
    if (!rules) return next(e)

    return next({ ...e, context: [...(e.context ?? []), rules] })
  })
}
