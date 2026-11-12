import { expect, sourceURL, story } from "../../stories/playwright/story"

const fixture = sourceURL(new URL("./plugin-host.fixture.tsx", import.meta.url))

story.beforeEach(async ({ mount }) => {
  // Any story loads the app; the fixture mounts the real host APIs beside it.
  await mount("ui-line-comment--editor")
})

// The side region's pane API of the plugin host, through the real `createHostApis`. The app's layout is a stand-in
// (`mountPanes`) that runs the real pane model on one strip: `createPluginAttachment`, which holds `Layout.open`'s
// placement rules and the `panes` projection, needs the whole provider tree and cannot mount here. The rules a
// stand-in cannot reach (append, preview, an explicit pane and the narrow viewport never split) belong to
// e2e/regression/side-panels.spec.ts. Reload persistence also lives there: the component harness aliases the layout
// store to a mock, and the fixture's storage is not the layout's.

story("Layout.panes lists the leaves in visual order with their tabs and the tab each shows", async ({ page }) => {
  const result = await page.evaluate(async (fixture) => {
    const { mountPanes, splitSessionTab } = await import(fixture)
    const base = { all: ["x:a", "x:b", "y:c"], active: "x:a" }
    // `x:b` splits below `side`, then `y:c` splits `p1` beside it: side, p1, p2.
    const below = splitSessionTab(base, "x:b", { pane: "side", direction: "column" })
    const seed = splitSessionTab(below, "y:c", { pane: "p1", direction: "row" })
    const host = await mountPanes(seed)
    const panes = host.layout.panes(host.session)
    host.unmount()

    return panes
  }, fixture)

  expect(result).toEqual([
    { id: "side", tabs: ["x:a"], shown: "x:a" },
    { id: "p1", tabs: ["x:b"], shown: "x:b" },
    { id: "p2", tabs: ["y:c"], shown: "y:c" },
  ])
})

story("Layout.panes is empty before the app interface mounts", async ({ page }) => {
  const result = await page.evaluate(async (fixture) => {
    const { mountPanes } = await import(fixture)
    const host = await mountPanes({ all: ["x:a"], active: "x:a" }, { attach: false })
    const panes = host.layout.panes(host.session)
    host.unmount()

    return panes
  }, fixture)

  expect(result).toEqual([])
})

story("Layout.panes is empty while the session's location is unknown", async ({ page }) => {
  const result = await page.evaluate(async (fixture) => {
    const { mountPanes } = await import(fixture)
    const host = await mountPanes({ all: ["x:a"], active: "x:a" }, { located: false })
    const panes = host.layout.panes(host.session)
    host.unmount()

    return panes
  }, fixture)

  expect(result).toEqual([])
})

story("Layout.place moves a tab into the pane and selects it", async ({ page }) => {
  const result = await page.evaluate(async (fixture) => {
    const { mountPanes, splitSessionTab } = await import(fixture)
    const seed = splitSessionTab({ all: ["x:a", "x:b", "y:c"], active: "x:a" }, "y:c", {
      pane: "side",
      direction: "row",
    })

    const host = await mountPanes(seed)
    host.layout.place("x:a", host.session, "p1")
    const outcome = { calls: host.calls, panes: host.layout.panes(host.session), active: host.strip().active }
    host.unmount()

    return outcome
  }, fixture)

  expect(result).toEqual({
    calls: ["place x:a p1"],
    panes: [
      { id: "side", tabs: ["x:b"], shown: "x:b" },
      { id: "p1", tabs: ["y:c", "x:a"], shown: "x:a" },
    ],
    active: "x:a",
  })
})

story("Layout.place puts the tab before the given tab of the pane", async ({ page }) => {
  const result = await page.evaluate(async (fixture) => {
    const { mountPanes, splitSessionTab } = await import(fixture)
    const seed = splitSessionTab({ all: ["x:a", "x:b", "y:c"], active: "x:a" }, "y:c", {
      pane: "side",
      direction: "row",
    })

    const host = await mountPanes(seed)
    host.layout.place("x:b", host.session, "p1", { before: "y:c" })
    const outcome = { calls: host.calls, panes: host.layout.panes(host.session), active: host.strip().active }
    host.unmount()

    return outcome
  }, fixture)

  expect(result).toEqual({
    calls: ["place x:b p1 before y:c"],
    panes: [
      { id: "side", tabs: ["x:a"], shown: "x:a" },
      { id: "p1", tabs: ["x:b", "y:c"], shown: "x:b" },
    ],
    active: "x:b",
  })
})

story("Layout.place does nothing for a pane the strip does not list", async ({ page }) => {
  const result = await page.evaluate(async (fixture) => {
    const { mountPanes, splitSessionTab } = await import(fixture)
    const seed = splitSessionTab({ all: ["x:a", "x:b", "y:c"], active: "x:a" }, "y:c", {
      pane: "side",
      direction: "row",
    })

    const host = await mountPanes(seed)
    const before = host.layout.panes(host.session)
    host.layout.place("y:c", host.session, "nowhere")
    const outcome = { calls: host.calls, same: host.strip() === seed, panes: host.layout.panes(host.session), before }
    host.unmount()

    return outcome
  }, fixture)

  // The call reaches the interface, which leaves the strip as it was (`Layout.place` documents this).
  expect(result.calls).toEqual(["place y:c nowhere"])
  expect(result.same).toBe(true)
  expect(result.panes).toEqual(result.before)
  expect(result.before).toEqual([
    { id: "side", tabs: ["x:a", "x:b"], shown: "x:a" },
    { id: "p1", tabs: ["y:c"], shown: "y:c" },
  ])
})

story("Layout.place does nothing for a key the strip does not hold", async ({ page }) => {
  const result = await page.evaluate(async (fixture) => {
    const { mountPanes, splitSessionTab } = await import(fixture)
    const seed = splitSessionTab({ all: ["x:a", "x:b", "y:c"], active: "x:a" }, "y:c", {
      pane: "side",
      direction: "row",
    })

    const host = await mountPanes(seed)
    const before = host.layout.panes(host.session)
    host.layout.place("z:missing", host.session, "p1")
    const outcome = { calls: host.calls, same: host.strip() === seed, panes: host.layout.panes(host.session), before }
    host.unmount()

    return outcome
  }, fixture)

  // The call reaches the interface, which leaves the strip as it was.
  expect(result.calls).toEqual(["place z:missing p1"])
  expect(result.same).toBe(true)
  expect(result.panes).toEqual(result.before)
  expect(result.before).toHaveLength(2)
})

story("Layout.split row opens a pane beside and moves the tab there, selected", async ({ page }) => {
  const result = await page.evaluate(async (fixture) => {
    const { mountPanes } = await import(fixture)
    const host = await mountPanes({ all: ["x:a", "x:b", "y:c"], active: "x:a" })
    host.layout.split("x:b", host.session, { direction: "row" })
    const outcome = { calls: host.calls, panes: host.layout.panes(host.session), strip: host.strip() }
    host.unmount()

    return outcome
  }, fixture)

  expect(result.calls).toEqual(["split x:b row -"])
  expect(result.panes).toEqual([
    { id: "side", tabs: ["x:a", "y:c"], shown: "x:a" },
    { id: "p1", tabs: ["x:b"], shown: "x:b" },
  ])
  expect(result.strip.active).toBe("x:b")
  expect(result.strip.layout).toMatchObject({
    type: "split",
    direction: "row",
    children: [
      { type: "leaf", id: "side" },
      { type: "leaf", id: "p1" },
    ],
  })
})

story("Layout.split column opens a pane below and moves the tab there, selected", async ({ page }) => {
  const result = await page.evaluate(async (fixture) => {
    const { mountPanes } = await import(fixture)
    const host = await mountPanes({ all: ["x:a", "x:b", "y:c"], active: "x:a" })
    host.layout.split("x:b", host.session, { direction: "column" })
    const outcome = { calls: host.calls, panes: host.layout.panes(host.session), strip: host.strip() }
    host.unmount()

    return outcome
  }, fixture)

  expect(result.calls).toEqual(["split x:b column -"])
  expect(result.panes).toEqual([
    { id: "side", tabs: ["x:a", "y:c"], shown: "x:a" },
    { id: "p1", tabs: ["x:b"], shown: "x:b" },
  ])
  expect(result.strip.active).toBe("x:b")
  expect(result.strip.layout).toMatchObject({
    type: "split",
    direction: "column",
    children: [
      { type: "leaf", id: "side" },
      { type: "leaf", id: "p1" },
    ],
  })
})

story("Layout.split splits the given pane rather than the pane of the tab", async ({ page }) => {
  const result = await page.evaluate(async (fixture) => {
    const { mountPanes, splitSessionTab } = await import(fixture)
    const seed = splitSessionTab({ all: ["x:a", "x:b", "y:c"], active: "x:a" }, "y:c", {
      pane: "side",
      direction: "row",
    })

    const host = await mountPanes(seed)
    host.layout.split("x:a", host.session, { direction: "column", pane: "p1" })
    const outcome = { calls: host.calls, panes: host.layout.panes(host.session), active: host.strip().active }
    host.unmount()

    return outcome
  }, fixture)

  expect(result).toEqual({
    calls: ["split x:a column p1"],
    panes: [
      { id: "side", tabs: ["x:b"], shown: "x:b" },
      { id: "p1", tabs: ["y:c"], shown: "y:c" },
      { id: "p2", tabs: ["x:a"], shown: "x:a" },
    ],
    active: "x:a",
  })
})

story("placements made before the app interface mounts apply in call order once it mounts", async ({ page }) => {
  const result = await page.evaluate(async (fixture) => {
    const { mountPanes } = await import(fixture)
    const host = await mountPanes({ all: ["x:a", "x:b", "y:c"], active: "x:a" }, { attach: false })
    host.layout.split("x:b", host.session, { direction: "row" })
    host.layout.place("y:c", host.session, "p1")
    const early = { calls: [...host.calls], panes: host.layout.panes(host.session) }
    await host.attach()
    const outcome = { early, calls: host.calls, panes: host.layout.panes(host.session) }
    host.unmount()

    return outcome
  }, fixture)

  expect(result).toEqual({
    early: { calls: [], panes: [] },
    calls: ["split x:b row -", "place y:c p1"],
    panes: [
      { id: "side", tabs: ["x:a"], shown: "x:a" },
      { id: "p1", tabs: ["x:b", "y:c"], shown: "y:c" },
    ],
  })
})

story("Layout.open hands its pane to the interface, and its split with the pane it splits", async ({ page }) => {
  const calls = await page.evaluate(async (fixture) => {
    const { mountPanes } = await import(fixture)
    const host = await mountPanes({ all: ["x:a"], active: "x:a" })
    host.layout.open("x:b", host.session, { pane: "p1" })
    host.layout.open("x:c", host.session, { split: "row" })
    host.layout.open("x:d", host.session, { split: "column", pane: "p1" })
    host.layout.open("x:e", host.session, { pane: "nowhere", tab: "select" })
    const outcome = [...host.calls]
    host.unmount()

    return outcome
  }, fixture)

  expect(calls).toEqual([
    'open x:b {"pane":"p1"}',
    'open x:c {"split":"row"}',
    'open x:d {"split":"column","pane":"p1"}',
    'open x:e {"pane":"nowhere","tab":"select"}',
  ])
})

story(
  "Layout.open before the app interface mounts waits, then reaches it with its options in call order",
  async ({ page }) => {
    const result = await page.evaluate(async (fixture) => {
      const { mountPanes } = await import(fixture)
      const host = await mountPanes({ all: ["x:a"], active: "x:a" }, { attach: false })
      host.layout.open("x:b", host.session, { split: "row" })
      host.layout.open("x:c", host.session, { pane: "p1" })
      const early = [...host.calls]
      await host.attach()
      const outcome = { early, calls: [...host.calls] }
      host.unmount()

      return outcome
    }, fixture)

    expect(result).toEqual({ early: [], calls: ['open x:b {"split":"row"}', 'open x:c {"pane":"p1"}'] })
  },
)

// `Layout.open` asks `opensBeside` whether a tab opens in a new pane beside the others by default.
story(
  "a new tab opens beside only when the strip holds no such tab and another one shows outside the bottom pane",
  async ({ page }) => {
    const result = await page.evaluate(async (fixture) => {
      const { opensBeside } = await import(fixture)
      const showing = { all: ["x:a", "y:b"], active: "x:a" }
      const bottom = { all: ["x:a", "t:b"], active: "x:a", panes: { "t:b": "bottom" } }
      const bottomOnly = { all: ["t:b"], active: "t:b", panes: { "t:b": "bottom" } }
      const split = { all: ["x:a", "y:b"], active: "y:b", panes: { "y:b": "p1" } }

      return {
        newTab: opensBeside(showing, "z:new"),
        sameTab: opensBeside(showing, "y:b"),
        file: opensBeside(showing, "file:src/a.ts"),
        empty: opensBeside({ all: [] }, "z:new"),
        bottomPlusSide: opensBeside(bottom, "z:new"),
        bottomOnly: opensBeside(bottomOnly, "z:new"),
        otherPane: opensBeside(split, "z:new"),
      }
    }, fixture)

    expect(result).toEqual({
      newTab: true,
      sameTab: false,
      file: false,
      empty: false,
      bottomPlusSide: true,
      bottomOnly: false,
      otherPane: true,
    })
  },
)
