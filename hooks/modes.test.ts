import { expect, test } from 'claude-code/testing'

import { MODES, parseMode, toMode } from './modes'

test('parseMode takes exact ids, trimmed and case-insensitive', () => {
  expect(parseMode('abwesend')).toBe('abwesend')
  expect(parseMode('  Abwesend ')).toBe('abwesend')
  expect(parseMode('nur vorbereiten')).toBe(null)
  expect(parseMode('')).toBe(null)
})

test('toMode falls back to begleitet', () => {
  expect(toMode(undefined)).toBe('begleitet')
  expect(toMode('weg')).toBe('begleitet')
  expect(toMode('vorbereiten')).toBe('vorbereiten')
})

test('rule texts', () => {
  expect(MODES.begleitet.rules).toBe(null)
  expect(MODES.abwesend.rules).toContain('Wartet auf dein OK')
  expect(MODES.vorbereiten.rules).toContain('Keine Änderungen an Projektdateien')
})

test('every rule text keeps the safety limits', () => {
  for (const id of ['abwesend', 'vorbereiten'] as const) {
    expect(MODES[id].rules).toContain('Sicherheitsregeln und ausdrückliches OK für Unumkehrbares bleiben.')
  }
})
