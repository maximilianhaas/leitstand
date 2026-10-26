import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { HIDE_MS, buildBoard, compactLine } from './board'
import { cockpit } from './view'

import { MODES, parseMode, toMode } from './modes'
import { agentSpawned, flagAsk, report, sessionEnded, sessionStarted, setStatus, turnEnded, turnStarted } from './reporter'

// not exported: the engine refuses a $.state reference that leaves the module
const MODE_REF = { plugin: 'leitstand', key: 'mode' } as const

const IDS = Object.keys(MODES).join(', ')

const PANE = 'cockpit'
const TICK_MS = 5_000
// raw texts of every session file, and when they were read
const files = atom({ plugin: 'leitstand', key: 'files' } as const, [] as string[])
const readAt = atom({ plugin: 'leitstand', key: 'readAt' } as const, 0)
// kompakt (counts), detail (counts and waiting titles) or aus: one setting for every session, kept in a file they all read
const DISPLAYS = ['kompakt', 'detail', 'aus']
const settingPath = async ($: any) => `${await $.env.get('HOME')}/.claude/leitstand-anzeige.json`
// the counts part of the status line from the last tick, and the line last shown
let line: string | undefined
let shown: string | undefined
// the module's own: a reload drops it, session.start starts it again
let tick: { cancel: () => void } | undefined
// a tick that is still reading skips the next one, so an older read never lands last
let busy = false


async function readSetting($: any): Promise<string> {
  try {
    const value = JSON.parse(String(await $.fs.read(await settingPath($)))).anzeige
    return DISPLAYS.includes(value) ? value : 'aus'
  } catch {
    return 'aus'
  }
}

// the mode of this session and, unless the display is aus, the counts of all
async function showStatus($: any, force = false): Promise<void> {
  try {
    const mode = toMode((await $.state.get(MODE_REF)).value)
    const text = [mode === 'begleitet' ? undefined : `Modus: ${MODES[mode].label}`, line].filter(Boolean).join(' · ') || undefined
    if (force || text !== shown) $.ui.status(text)
    shown = text
  } catch {}
}

// one tick: the setting, then the folder while a pane or the display needs it
async function readFiles($: any, known?: string): Promise<void> {
  if (busy) return
  busy = true
  try {
    const setting = known ?? (await readSetting($))
    const isOpen = (await $.ui.panes()).some((p: { id: string }) => p.id === PANE)
    if (!isOpen && setting === 'aus') {
      line = undefined
      return void (await showStatus($))
    }
    const dir = `${await $.env.get('HOME')}/.claude/leitstand`
    const now: number = await $.clock.now()
    const texts: string[] = []
    try {
      for (const entry of await $.fs.list(dir)) {
        // the mod cannot delete: old files pile up, so skip them unread
        if (entry.kind !== 'file' || !entry.name.endsWith('.json') || now - entry.mtimeMs > HIDE_MS) continue
        try {
          texts.push(String(await $.fs.read(`${dir}/${entry.name}`)))
        } catch {}
      }
    } catch {}
    // only a drawing reads these: no state writes while the pane is closed
    if (isOpen) {
      await update($, files, () => texts)
      await update($, readAt, () => now)
    }
    const { counts, rows } = buildBoard(texts, now)
    const waiting = rows.filter(r => r.state === 'wartet').map(r => r.title || '(ohne Titel)')
    line = setting === 'aus' ? undefined : compactLine(counts, setting === 'detail' ? waiting : undefined)
    await showStatus($)
  } catch {
  } finally {
    busy = false
  }
}

function startTick($: any): void {
  tick ??= $.clock.every(TICK_MS, () => void readFiles($))
}

// main-loop tools that wait for Max while they run
const WAITS: Record<string, 'Rückfrage' | 'Plan'> = { AskUserQuestion: 'Rückfrage', ExitPlanMode: 'Plan' }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'modus',
      description: 'Agentenmodus setzen: begleitet, abwesend, vorbereiten',
    })
    await $.command.register({ name: 'cockpit', description: 'Cockpit über alle Sitzungen öffnen' })
    // a reload or resume keeps $.state but not the status line
    await showStatus($, true)

    const started = await next(e)
    await sessionStarted($)
    // every session reads the shared setting, so a change anywhere reaches it
    startTick($)
    return started
  })

  on('command.run', { command: 'cockpit' }, async ($, e) => {
    const word = e.args.trim().toLowerCase()
    if (DISPLAYS.includes(word)) {
      try {
        await $.fs.write(await settingPath($), JSON.stringify({ anzeige: word }))
      } catch {
        return { text: 'Die Einstellung konnte nicht gespeichert werden.' }
      }
      startTick($)
      await readFiles($, word)
      return { text: `Anzeige: ${word}. Gilt in allen Sitzungen mit dem Plugin, spätestens nach 5 s.` }
    }
    if (word !== '') return { text: `Unbekannt: „${word}“. Möglich: /cockpit (Fenster), /cockpit kompakt, /cockpit detail, /cockpit aus.` }
    await $.ui.open({ id: PANE, title: 'Cockpit' })
    startTick($)
    await readFiles($)
    return { text: 'Cockpit geöffnet.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const now = await read($, readAt)
    return cockpit($.ui.resolve(e), e.surface, buildBoard(await read($, files), now), await $.session.id(), now)
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

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    await agentSpawned($, e, result)
    return result
  })

  on('session.end', async ($, e, next) => {
    await sessionEnded($, e.sessionId, e.reason)
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
    await showStatus($, true)

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
