import {
  pluginIdAvailable,
  shipsPluginGui,
  type Bridge,
  type BridgeMessage,
  type BridgePluginGui,
  type BridgePluginGuis,
  type Installed,
} from "@opencode/plugin/gui/host"
import type { ServerApi } from "@/runtime/server/api"
import { builtins } from "./builtins"

/** The browser's plugin bridge, which reads GUI bundles from the server that served the app. */
export type WebPluginBridge = Bridge & {
  /** Lists the GUI plugins on the server behind `api` and reads their bundles; a change goes out as a `pluginGuis` message. */
  refresh(api: ServerApi): void
}

/**
 * A browser has no main process, so only the plugin GUIs exist: the bridge answers `pluginGuis` the way the desktop
 * app's main process does, from the server's `plugin.list` and `plugin.gui`, and offers no Ipc, embed or menubar item.
 * The loader calls `refresh` with the app's own authenticated client on each connection and `plugin.updated`.
 */
export function createWebPluginBridge(): WebPluginBridge {
  const listeners = new Set<(message: BridgeMessage) => void>()

  const state: { guis: BridgePluginGuis; installed: readonly Installed[]; listing: boolean; next?: ServerApi } = {
    guis: { plugins: [], reserved: [] },
    installed: [],
    listing: false,
  }

  const read = async (api: ServerApi) => {
    const listed = await api.plugin.list().then((result) => result.data)
    const shipped = listed.filter(shipsPluginGui)
    const reserved = shipped.flatMap((plugin) => (pluginIdAvailable(plugin.id, builtins) ? [] : [plugin.id]))
    const loadable = shipped.filter((plugin) => !reserved.includes(plugin.id))

    // A bundle that fails to read keeps the one the window runs.
    const plugins = await Promise.all(
      loadable.map((plugin) =>
        api.plugin.gui({ id: plugin.id }).then(
          (result): BridgePluginGui => ({ id: plugin.id, ...result.data }),
          (cause: unknown) => {
            console.error("[plugin] bundle read failed", plugin.id, cause)

            return state.guis.plugins.find((previous) => previous.id === plugin.id)
          },
        ),
      ),
    )

    const installed = loadable.map((plugin) => ({
      id: plugin.id,
      builtin: false,
      enabled: true,
      server: plugin.features.server,
      tui: plugin.features.tui,
    }))

    return { guis: { plugins: plugins.filter((plugin) => !!plugin), reserved }, installed }
  }

  const apply = (next: Awaited<ReturnType<typeof read>>) => {
    if (JSON.stringify(next) === JSON.stringify({ guis: state.guis, installed: state.installed })) return

    state.guis = next.guis
    state.installed = next.installed
    listeners.forEach((listener) => {
      listener({ type: "installed", list: next.installed })
      listener({ type: "pluginGuis", ...next.guis })
    })
  }

  // One listing at a time; a change during a listing lists once more.
  const refresh = (api: ServerApi) => {
    if (state.listing) return void (state.next = api)
    state.listing = true
    void read(api)
      .then(apply)
      .catch((cause: unknown) => console.error("[plugin] listing failed", cause))
      .finally(() => {
        state.listing = false
        const next = state.next
        state.next = undefined

        if (next) refresh(next)
      })
  }

  const unavailable = () => new Error("Plugin main parts are unavailable in the browser")

  return {
    packaged: false,
    call: () => Promise.reject(unavailable()),
    subscribe: async () => ({ available: false }),
    on(listener) {
      listeners.add(listener)

      return () => void listeners.delete(listener)
    },
    embed: () => {},
    capture: async () => undefined,
    runMenubarItem: () => {},
    configure: () => {},
    pluginGuis: async () => state.guis,
    manager: {
      // No saved enable state exists in a browser; an empty list lets activation start at once.
      initial: Promise.resolve([]),
      list: async () => state.installed,
      enable: () => Promise.reject(unavailable()),
      disable: () => Promise.reject(unavailable()),
      reload: async () => {},
    },
    refresh,
  }
}
