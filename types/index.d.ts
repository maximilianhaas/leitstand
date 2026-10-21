// string, not ModeId: a stored value may predate a renamed mode
export type StoredMode = string

declare module 'claude-code' {
  interface PluginState {
    leitstand: { mode: StoredMode }
  }
}
