import { expect, test } from "bun:test"
import type { BridgeMessage } from "@opencode/plugin/gui/host"
import { createApiForServer } from "@/runtime/server/api"
import { createWebPluginBridge } from "./web-bridge"

const location = { directory: "/work" }

const info = (id: string, source: { type: string }, gui = true, status = "active") => ({
  id,
  source,
  features: gui ? { gui: true, server: true } : { server: true },
  state: { status },
})

// A server that lists the given plugins and serves each id's bundle, as `/api/plugin` and `/api/plugin/gui` do.
function serve(plugins: unknown[], bundles: Record<string, { revision: string; code: string } | undefined>) {
  const requests: string[] = []

  const fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : input)
      requests.push(url.pathname + url.search)

      if (url.pathname === "/api/plugin") return Response.json({ location, data: plugins })

      const bundle = bundles[url.searchParams.get("id") ?? ""]

      if (url.pathname === "/api/plugin/gui" && bundle)
        return Response.json({ location, data: { ...bundle, options: {} } })

      return new Response("missing", { status: 404 })
    },
    { preconnect: () => {} },
  )

  return { requests, api: createApiForServer({ server: { url: "http://server.test" }, fetch }) }
}

const settled = () => Bun.sleep(20)

test("a refresh loads the active plugins that ship a GUI and reserves the ids a built-in claims", async () => {
  const server = serve(
    [
      info("tree", { type: "local" }),
      info("server-only", { type: "local" }, false),
      info("failed", { type: "local" }, true, "failed"),
      info("builtin", { type: "builtin" }),
      info("opencode", { type: "local" }),
    ],
    {
      tree: { revision: "r1", code: "module.exports={}" },
      failed: { revision: "r1", code: "" },
      builtin: { revision: "r1", code: "" },
    },
  )

  const bridge = createWebPluginBridge()
  const messages: BridgeMessage[] = []
  bridge.on((message) => messages.push(message))
  expect(await bridge.pluginGuis()).toEqual({ plugins: [], reserved: [] })

  bridge.refresh(server.api)
  await settled()

  expect(await bridge.pluginGuis()).toEqual({
    plugins: [{ id: "tree", revision: "r1", code: "module.exports={}", options: {} }],
    reserved: ["opencode"],
  })
  expect(messages.map((message) => message.type)).toEqual(["installed", "pluginGuis"])
  expect(await bridge.manager.list()).toEqual([
    { id: "tree", builtin: false, enabled: true, server: true, tui: undefined },
  ])
  expect(server.requests.filter((request) => request.startsWith("/api/plugin/gui"))).toEqual([
    "/api/plugin/gui?id=tree",
  ])
})

test("a refresh that finds nothing new sends no message, and a new revision sends one", async () => {
  const bundles = { tree: { revision: "r1", code: "a" } }
  const server = serve([info("tree", { type: "local" })], bundles)
  const bridge = createWebPluginBridge()
  const messages: BridgeMessage[] = []
  bridge.on((message) => messages.push(message))

  bridge.refresh(server.api)
  await settled()
  bridge.refresh(server.api)
  await settled()
  expect(messages.filter((message) => message.type === "pluginGuis")).toHaveLength(1)

  bundles.tree = { revision: "r2", code: "b" }
  bridge.refresh(server.api)
  await settled()
  expect((await bridge.pluginGuis()).plugins.map((plugin) => plugin.revision)).toEqual(["r2"])
  expect(messages.filter((message) => message.type === "pluginGuis")).toHaveLength(2)
})

test("a bundle that cannot be read keeps the one the window runs, and a plugin that goes away is dropped", async () => {
  const bundles: Record<string, { revision: string; code: string } | undefined> = {
    tree: { revision: "r1", code: "a" },
  }

  const plugins = [info("tree", { type: "local" })]
  const server = serve(plugins, bundles)
  const bridge = createWebPluginBridge()

  bridge.refresh(server.api)
  await settled()

  bundles.tree = undefined
  bridge.refresh(server.api)
  await settled()
  expect((await bridge.pluginGuis()).plugins.map((plugin) => plugin.revision)).toEqual(["r1"])

  plugins.length = 0
  bridge.refresh(server.api)
  await settled()
  expect((await bridge.pluginGuis()).plugins).toEqual([])
})

test("the main process parts are unavailable", async () => {
  const bridge = createWebPluginBridge()

  expect(await bridge.subscribe("any")).toEqual({ available: false })
  expect(bridge.call({ ipc: "any", method: "run", input: null })).rejects.toThrow()
  expect(await bridge.manager.initial).toEqual([])
})
