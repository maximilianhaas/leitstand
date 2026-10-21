declare module 'claude-code' {
  interface PluginState {
    // string, not ModeId: a stored value may predate a renamed mode
    leitstand: { mode: string }
  }
}

export {}
