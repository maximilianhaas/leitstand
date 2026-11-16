import type { Limit, Subagent } from '../types'
import { DONE, STATUS_DE, ago, duration } from './board'
import type { Board, Row, RowState } from './board'
import { MODES } from './modes'

// the drawing of /cockpit: tiles, one card per session, its subagents beneath

const GROUPS: [RowState, string][] = [
  ['wartet', 'Wartet auf dich'],
  ['arbeitend', 'Arbeitet'],
  ['bereit', 'Bereit'],
  ['unklar', 'Unklar (kein Lebenszeichen)'],
]
const DOT: Record<RowState, string> = { wartet: 'warning', arbeitend: 'claude', bereit: 'success', unklar: 'inactive' }
const WINDOW_DE: Record<string, string> = { five_hour: '5 h', seven_day: '7 Tage' }
const WAIT_DE = { Rückfrage: 'wartet auf deine Antwort', Plan: 'wartet auf Planfreigabe' } as const

// an Svg is drawn as an image and cannot follow the theme: mid tones read on light and dark
const tone = (pct: number) => (pct >= 90 ? '#d64545' : pct >= 80 ? '#d99a1e' : '#3a9d5d')
const themeTone = (pct: number) => (pct >= 90 ? 'error' : pct >= 80 ? 'warning' : 'success')

// a thin fill bar: Svg where the surface has it, block characters in a terminal
// (resolve answers every name, so the surface decides, not E.Svg)
function bar(E: any, pct: number, width: number) {
  const p = Math.max(0, Math.min(100, pct))
  if (E.svg) {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 6" preserveAspectRatio="none" width="${width}" height="6"><rect width="100" height="6" rx="3" fill="#8884"/><rect width="${Math.max(3, p)}" height="6" rx="3" fill="${tone(p)}"/></svg>`
    return <E.Svg source={source} alt={`${p} %`} width={width} height={6} />
  }
  const n = Math.round(p / 10)
  return <E.Text color={themeTone(p)}>{'▰'.repeat(n) + '▱'.repeat(10 - n)}</E.Text>
}

function tile(E: any, value: number, label: string, alert = false) {
  return (
    <E.Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={alert ? 'warning' : 'subtle'} paddingX={1}>
      <E.Text size="title" weight="semibold" tabular color={alert ? 'warning' : undefined}>{String(value)}</E.Text>
      <E.Text size="caption" dimColor>{label}</E.Text>
    </E.Box>
  )
}

function limits(E: any, list: Limit[]) {
  return (
    <E.Box flexDirection="row" gap="md" alignItems="center" flexWrap="wrap">
      <E.Text size="caption" dimColor>Nutzungslimit</E.Text>
      {list.map(l => (
        <E.Box flexDirection="row" gap="xs" alignItems="center">
          <E.Text size="caption">{WINDOW_DE[l.kind] ?? l.kind}</E.Text>
          {bar(E, l.percent, 80)}
          <E.Text size="caption" tabular>{`${l.percent} %`}</E.Text>
        </E.Box>
      ))}
    </E.Box>
  )
}

function subagent(E: any, a: Subagent, now: number) {
  const failed = a.status === 'failed'
  const color = failed ? 'error' : a.status === 'running' ? 'claude' : 'inactive'
  const facts = [a.model, a.type, a.worktree, duration((a.endedAt ?? now) - a.startedAt)].filter(Boolean).join(' · ')
  return (
    <E.Box flexDirection="row" gap="xs">
      <E.Text size="caption" color={color}>{failed ? '✕' : '●'}</E.Text>
      <E.Text size="caption" wrap="truncate-end">{a.status === 'running' ? a.description : `${a.description} (${STATUS_DE[a.status] ?? a.status})`}</E.Text>
      <E.Text size="caption" dimColor wrap="truncate-end">{facts}</E.Text>
    </E.Box>
  )
}

function card(E: any, r: Row, self: string, now: number, jump?: (id: string) => void) {
  const mode = MODES[r.mode as keyof typeof MODES]?.label ?? r.mode
  const meta = [r.project, mode, ago(r.ageMs), r.waitingFor ? WAIT_DE[r.waitingFor] : undefined].filter(Boolean).join(' · ')
  // finished ones only as a count, failed ones stay visible
  const shown = r.subagents.filter(a => !DONE.includes(a.status) || a.status === 'failed')
  const finished = r.subagents.length - shown.length
  const title = <E.Text weight="semibold" dimColor={r.state === 'unklar'} wrap="truncate-end">{r.title || '(noch ohne Nachricht)'}</E.Text>
  return (
    <E.Box flexDirection="column" borderStyle="round" borderColor={r.state === 'wartet' ? 'warning' : 'subtle'} paddingX={1} gap="xs">
      <E.Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm">
        <E.Box flexDirection="row" gap="xs" flexShrink={1}>
          <E.Text color={DOT[r.state]}>●</E.Text>
          {r.appId && jump && r.sessionId !== self ? (
            <E.Button key={r.sessionId} plain onPress={() => jump(r.appId!)}>{title}</E.Button>
          ) : (
            title
          )}
          {r.sessionId === self && <E.Text size="caption" color="claude">diese</E.Text>}
        </E.Box>
        {r.context !== undefined && (
          <E.Box flexDirection="row" gap="xs" alignItems="center" flexShrink={0}>
            <E.Text size="caption" dimColor tabular>{`Kontext ${r.context} %`}</E.Text>
            {bar(E, r.context, 48)}
          </E.Box>
        )}
      </E.Box>
      <E.Text size="caption" dimColor wrap="truncate-end">{meta}</E.Text>
      {shown.map(a => subagent(E, a, now))}
      {finished > 0 && <E.Text size="caption" dimColor>{`+${finished} fertig`}</E.Text>}
    </E.Box>
  )
}

export function cockpit(elements: any, surface: string, board: Board, self: string, now: number, jump?: (id: string) => void) {
  const E = { Box: elements.Box, Text: elements.Text, Svg: elements.Svg, Button: elements.Button, svg: surface !== 'terminal' }
  const { counts, rows } = board
  return (
    <E.Box flexDirection="column" gap="md">
      <E.Box flexDirection="row" gap="sm">
        {tile(E, counts.wartet, 'Wartet auf dich', counts.wartet > 0)}
        {tile(E, counts.arbeitend, 'Arbeitet')}
        {tile(E, counts.bereit, 'Bereit')}
        {tile(E, counts.agents, 'Unteragenten')}
      </E.Box>
      {board.limits.length > 0 && limits(E, board.limits)}
      {rows.length === 0 && (
        <E.Box flexDirection="column" alignItems="center" paddingY={2}>
          <E.Text weight="semibold">Noch keine Sitzung gemeldet.</E.Text>
          <E.Text size="caption" dimColor>Sitzungen melden sich erst nach einem Neustart mit dem Plugin.</E.Text>
        </E.Box>
      )}
      {GROUPS.filter(([state]) => rows.some(r => r.state === state)).map(([state, title]) => (
        <E.Box flexDirection="column" gap="sm">
          <E.Text size="caption" weight="semibold" dimColor>{`${title.toUpperCase()} · ${rows.filter(r => r.state === state).length}`}</E.Text>
          {rows.filter(r => r.state === state).map(r => card(E, r, self, now, jump))}
        </E.Box>
      ))}
    </E.Box>
  )
}
