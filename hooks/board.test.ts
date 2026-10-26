import { expect, test } from 'claude-code/testing'

import type { SessionFile } from '../types'
import { ago, buildBoard, compactLine } from './board'

const now = Date.parse('2026-10-21T12:00:00Z')
const minAgo = (m: number) => new Date(now - m * 60_000).toISOString()

let n = 0
const file = (over: Partial<SessionFile> = {}): string =>
  JSON.stringify({
    v: 1,
    sessionId: `s${++n}`,
    title: 'Titel',
    project: 'p',
    cwd: '/p',
    status: 'bereit',
    waitingFor: null,
    mode: 'begleitet',
    agents: 0,
    updatedAt: minAgo(0),
    ...over,
  })

test('counts per status, agents summed', () => {
  const board = buildBoard(
    [file({ status: 'arbeitend', agents: 2 }), file({ status: 'wartet', waitingFor: 'Rückfrage' }), file()],
    now,
  )
  expect(board.counts).toEqual({ arbeitend: 1, wartet: 1, bereit: 1, agents: 2 })
})

test('arbeitend older than 10 min is unklar and not counted', () => {
  const board = buildBoard(
    [file({ status: 'arbeitend', agents: 3, updatedAt: minAgo(11) }), file({ status: 'arbeitend', updatedAt: minAgo(9) })],
    now,
  )
  expect(board.rows.map(r => r.state)).toEqual(['arbeitend', 'unklar'])
  expect(board.counts.arbeitend).toBe(1)
  expect(board.counts.agents).toBe(0)
})

test('older than 24 h or beendet is hidden', () => {
  const board = buildBoard([file({ updatedAt: minAgo(25 * 60) }), file({ status: 'beendet' })], now)
  expect(board.rows).toEqual([])
})

test('order: wartet longest first, arbeitend, bereit, unklar', () => {
  const board = buildBoard(
    [
      file({ status: 'arbeitend', updatedAt: minAgo(11), title: 'unklar' }),
      file({ title: 'bereit' }),
      file({ status: 'wartet', waitingFor: 'Plan', updatedAt: minAgo(1), title: 'w1' }),
      file({ status: 'arbeitend', title: 'arb' }),
      file({ status: 'wartet', waitingFor: 'Rückfrage', updatedAt: minAgo(5), title: 'w5' }),
    ],
    now,
  )
  expect(board.rows.map(r => r.state)).toEqual(['wartet', 'wartet', 'arbeitend', 'bereit', 'unklar'])
  expect(board.rows[0]!.title).toBe('w5')
  expect(board.rows[0]!.waitingFor).toBe('Rückfrage')
})

test('newest first inside a group', () => {
  const board = buildBoard([file({ updatedAt: minAgo(30), title: 'alt' }), file({ updatedAt: minAgo(2), title: 'neu' })], now)
  expect(board.rows.map(r => r.title)).toEqual(['neu', 'alt'])
})

test('broken, foreign or half-written files are skipped', () => {
  const board = buildBoard(['{"v":1,"sess', JSON.stringify({ ...JSON.parse(file()), v: 2 }), 'quatsch', file({ title: 'gut' })], now)
  expect(board.rows.map(r => r.title)).toEqual(['gut'])
})

test('ago', () => {
  expect(ago(10_000)).toBe('vor 10 s')
  expect(ago(120_000)).toBe('vor 2 Min')
  expect(ago(3_600_000)).toBe('vor 1 h')
})

test('W1: unknown status or wrong field types never break the board', () => {
  const board = buildBoard(
    [file({ status: 'pausiert' as any }), file({ title: 5 as any, project: null as any, mode: {} as any, agents: '2' as any })],
    now,
  )
  expect(board.rows.length).toBe(1)
  expect(board.rows[0]).toMatchObject({ title: '', project: '', mode: '', agents: 2 })
  expect(board.counts.agents).toBe(2)
})

test('compactLine shows the four counts', () => {
  expect(compactLine({ arbeitend: 3, wartet: 2, bereit: 7, agents: 1 })).toBe('⏳ 2 warten · ⚙ 3 arbeiten · ✓ 7 bereit · 🤖 1')
})

test('compactLine names up to two waiting sessions when asked', () => {
  const c = { arbeitend: 0, wartet: 3, bereit: 0, agents: 0 }
  expect(compactLine(c, ['Login-Seite umbauen', 'Ein sehr langer Titel einer Sitzung', 'Dritte'])).toBe(
    '⏳ 3 warten: Login-Seite umbauen, Ein sehr langer Titel… +1 · ⚙ 0 arbeiten · ✓ 0 bereit · 🤖 0',
  )
})

test('context, freshest limits and subagents of visible sessions', () => {
  const sub = (id: string, status: string, startedAt: number) => ({ id, description: id, type: 'Explore', model: 'haiku', worktree: 'Hauptordner', status, startedAt })
  const board = buildBoard(
    [
      file({ title: 'A', context: 78, limits: [{ kind: 'five_hour', percent: 40 }], updatedAt: minAgo(5), subagents: [sub('a1', 'completed', now - 9), sub('a2', 'running', now - 5)] }),
      file({ title: 'B', limits: [{ kind: 'five_hour', percent: 42 }], subagents: [sub('b1', 'running', now - 1)] }),
      file({ status: 'arbeitend', updatedAt: minAgo(11), subagents: [sub('c1', 'running', now)] }),
      file({ subagents: 'kaputt' as any }),
    ],
    now,
  )
  expect(board.rows.find(r => r.title === 'A')?.context).toBe(78)
  expect(board.limits).toEqual([{ kind: 'five_hour', percent: 42 }])
  // unklar sessions are left out; running first, newest first
  expect(board.subagents.map(a => a.id)).toEqual(['b1', 'a2', 'a1'])
  expect(board.subagents[0]!.session).toBe('B')
})
