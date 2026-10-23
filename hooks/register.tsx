import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { ago, buildBoard } from './board'
import type { Row } from './board'

import { MODES, parseMode, toMode } from './modes'
import { flagAsk, report, setStatus, turnEnded, turnStarted } from './reporter'

// not exported: the engine refuses a $.state reference that leaves the module
const MODE_REF = { plugin: 'leitstand', key: 'mode' } as const

const IDS = Object.keys(MODES).join(', ')

const PANE = 'cockpit'
const TICK_MS = 5_000
const EMPTY = 'Noch keine Sitzung gemeldet. Sitzungen melden sich erst nach einem Neustart mit dem Plugin.'
// raw texts of every session file, and when they were read
const files = atom({ plugin: 'leitstand', key: 'files' } as const, [] as string[])
const readAt = atom({ plugin: 'leitstand', key: 'readAt' } as const, 0)
// the module's own: a reload drops it, session.start starts it again
let tick: { cancel: () => void } | undefined

const STATE_LABEL = { arbeitend: 'Arbeitet', bereit: 'Bereit', unklar: 'Unklar' } as const
const label = (r: Row) => (r.state === 'wartet' ? `Wartet (${r.waitingFor ?? 'Rückfrage'})` : STATE_LABEL[r.state])
const cut = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text).padEnd(n)

async function readFiles($: any): Promise<void> {
  try {
    if (!(await $.ui.panes()).some((p: { id: string }) => p.id === PANE)) {
      tick?.cancel()
      tick = undefined
      return
    }
    const dir = `${await $.env.get('HOME')}/.claude/leitstand`
    const texts: string[] = []
    try {
      for (const entry of await $.fs.list(dir)) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
        try {
          texts.push(String(await $.fs.read(`${dir}/${entry.name}`)))
        } catch {}
      }
    } catch {}
    const now: number = await $.clock.now()
    await update($, files, () => texts)
    await update($, readAt, () => now)
  } catch {}
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
    try {
      const id = toMode((await $.state.get(MODE_REF)).value)
      if (id !== 'begleitet') $.ui.status(`Modus: ${MODES[id].label}`)
    } catch {}

    const started = await next(e)
    await setStatus($, 'bereit')
    try {
      if ((await $.ui.panes()).some(p => p.id === PANE)) startTick($)
    } catch {}
    return started
  })

  on('command.run', { command: 'cockpit' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Cockpit' })
    startTick($)
    await readFiles($)
    return { text: 'Cockpit geöffnet.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { counts, rows } = buildBoard(await read($, files), await read($, readAt))
    const self = await $.session.id()
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 4)

    return (
      <Box flexDirection="column">
        <Text>{`Arbeitend ${counts.arbeitend}   Wartet auf dich ${counts.wartet}   Bereit ${counts.bereit}   Unteragenten aktiv ${counts.agents}`}</Text>
        {rows.length === 0 && <Text dimColor>{EMPTY}</Text>}
        {rows.slice(0, room).map(r => (
          <Text dimColor={r.state === 'unklar'}>
            {[
              cut(label(r), 18),
              cut(r.title || '(noch ohne Nachricht)', 32),
              cut(r.project, 14),
              cut(MODES[r.mode as keyof typeof MODES]?.label ?? r.mode, 15),
              String(r.agents).padStart(2),
              ago(r.ageMs),
            ].join('  ') + (r.sessionId === self ? '  (diese)' : '')}
          </Text>
        ))}
      </Box>
    )
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
