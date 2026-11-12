import { expect, test } from "bun:test"
import {
  closeSessionTab,
  moveSessionTab,
  openSessionTab,
  opensBeside,
  paneLeaves,
  placeSessionTabs,
  previewSessionTab,
  resizeSessionPane,
  sessionPaneIds,
  sessionPaneLayout,
  sessionTabPane,
  splitSessionPane,
  splitSessionTab,
  type SessionTabState,
  type SessionTabs,
} from "./session-tabs"

const OPEN = "file:open"

const SECOND = "file:open:2"

const launchers = new Set([OPEN])

const state = (all: string[], active?: string, preview?: string): SessionTabState => ({
  tabs: { all, active },
  preview,
})

test.each([
  {
    name: "preview appends the Open File placeholder",
    run: () => previewSessionTab(state(["file://a.ts"], "file://a.ts"), OPEN),
    expected: state(["file://a.ts", OPEN], OPEN, OPEN),
  },
  {
    name: "preview replaces the current preview in place",
    run: () => previewSessionTab(state(["context", OPEN, "file://b.ts"], OPEN, OPEN), "file://a.ts"),
    expected: state(["context", "file://a.ts", "file://b.ts"], "file://a.ts", "file://a.ts"),
  },
  {
    name: "preview activates a durable tab without duplicating it",
    run: () => previewSessionTab(state(["file://a.ts", OPEN, "file://b.ts"], OPEN, OPEN), "file://b.ts"),
    expected: state(["file://a.ts", "file://b.ts"], "file://b.ts"),
  },
  {
    name: "preview replaces a restored Open File placeholder",
    run: () => previewSessionTab(state(["file://a.ts", OPEN], OPEN), "file://b.ts", launchers),
    expected: state(["file://a.ts", "file://b.ts"], "file://b.ts", "file://b.ts"),
  },
  {
    name: "preview replaces the selected Open File placeholder among several",
    run: () =>
      previewSessionTab(
        state([OPEN, "file://a.ts", SECOND], SECOND, "file://a.ts"),
        "file://b.ts",
        new Set([OPEN, SECOND]),
      ),
    expected: state([OPEN, "file://a.ts", "file://b.ts"], "file://b.ts", "file://b.ts"),
  },
  {
    name: "open pins the current preview",
    run: () => openSessionTab(state(["file://a.ts"], "file://a.ts", "file://a.ts"), "file://a.ts"),
    expected: state(["file://a.ts"], "file://a.ts"),
  },
  {
    name: "open replaces a preview with a directly opened file",
    run: () => openSessionTab(state(["file://a.ts"], "file://a.ts", "file://a.ts"), "file://b.ts"),
    expected: state(["file://b.ts"], "file://b.ts"),
  },
  {
    name: "open replaces a restored Open File placeholder",
    run: () => openSessionTab(state(["file://a.ts", OPEN], OPEN), "file://b.ts", launchers),
    expected: state(["file://a.ts", "file://b.ts"], "file://b.ts"),
  },
  {
    name: "close clears preview metadata and selects the left neighbor",
    run: () =>
      closeSessionTab(
        state(["file://a.ts", "file://b.ts", "file://c.ts"], "file://b.ts", "file://b.ts"),
        "file://b.ts",
      ),
    expected: state(["file://a.ts", "file://c.ts"], "file://a.ts"),
  },
])("$name", ({ run, expected }) => {
  expect(run()).toEqual(expected)
})

const A = "file:a"

const B = "file:b"

const T1 = "terminal:1"

const T2 = "terminal:2"

test.each<{ name: string; run: () => SessionTabs; expected: SessionTabs }>([
  {
    name: "move to the bottom pane selects the tab there and keeps the side pane's tab shown",
    run: () => moveSessionTab({ all: [A, T1], active: A }, T1, "bottom"),
    expected: { all: [A, T1], active: T1, panes: { [T1]: "bottom" }, selected: { side: A, bottom: T1 } },
  },
  {
    name: "move places the tab before another in the target pane",
    run: () => moveSessionTab({ all: [A, T1, T2], active: A, panes: { [T1]: "bottom" } }, T2, "bottom", T1),
    expected: {
      all: [A, T2, T1],
      active: T2,
      panes: { [T1]: "bottom", [T2]: "bottom" },
      selected: { side: A, bottom: T2 },
    },
  },
  {
    name: "a tab moved back to the side pane leaves the bottom pane showing its neighbour",
    run: () =>
      moveSessionTab(
        { all: [A, T1, T2], active: T2, panes: { [T1]: "bottom", [T2]: "bottom" }, selected: { side: A } },
        T2,
        "side",
      ),
    expected: { all: [A, T2, T1], active: T2, panes: { [T1]: "bottom" }, selected: { side: T2, bottom: T1 } },
  },
  {
    name: "a new tab joins the pane of its plugin's last tab",
    run: () =>
      placeSessionTabs({ all: [A, T1], active: T1, panes: { [T1]: "bottom" } }, { all: [A, T1, T2], active: T2 }),
    expected: {
      all: [A, T1, T2],
      active: T2,
      panes: { [T1]: "bottom", [T2]: "bottom" },
      selected: { bottom: T2 },
    },
  },
  {
    name: "a preview that replaces a tab in place takes its pane",
    run: () => placeSessionTabs({ all: [T1, A], active: A, panes: { [A]: "split" } }, { all: [T1, B], active: B }),
    expected: { all: [T1, B], active: B, panes: { [B]: "split" }, selected: { split: B } },
  },
  {
    name: "a pane's target places a new tab of another plugin",
    run: () => placeSessionTabs({ all: [A], active: A }, { all: [A, T1], active: T1 }, "split"),
    expected: { all: [A, T1], active: T1, panes: { [T1]: "split" }, selected: { side: A, split: T1 } },
  },
])("$name", ({ run, expected }) => {
  expect(run()).toEqual(expected)
})

test("closing the selected tab of a pane selects its neighbour in the same pane", () => {
  const tabs = { all: [A, T1, B, T2], active: T2, panes: { [T1]: "bottom" as const, [T2]: "bottom" as const } }

  expect(closeSessionTab({ tabs }, T2).tabs.active).toBe(T1)
})

test("a split puts a tab in its own pane beside the pane it split", () => {
  const tabs = splitSessionTab({ all: [A], active: A }, OPEN, { direction: "row" })
  const layout = sessionPaneLayout(tabs)

  expect(paneLeaves(layout)).toEqual(["side", "p1"])
  expect(layout.type === "split" && layout.direction).toBe("row")
  expect(tabs.panes).toEqual({ [OPEN]: "p1" })
  expect(tabs.active).toBe(OPEN)
  expect(tabs.serial).toBe(1)
})

test("a split of a pane named by the caller leaves the others alone", () => {
  const tabs = splitSessionTab({ all: [A, T1], active: A, panes: { [T1]: "bottom" } }, OPEN, {
    pane: "side",
    direction: "column",
  })

  expect(sessionPaneIds(tabs)).toEqual(["side", "p1", "bottom"])
  expect(tabs.panes).toEqual({ [T1]: "bottom", [OPEN]: "p1" })
})

test("a pane that loses its last tab closes and gives its room back", () => {
  const split = splitSessionTab({ all: [A], active: A }, OPEN, { direction: "row" })
  const tabs = placeSessionTabs(split, { ...split, all: [A], active: A })

  expect(paneLeaves(sessionPaneLayout(tabs))).toEqual(["side"])
  expect(tabs.layout).toBeUndefined()
  expect(tabs.panes).toBeUndefined()
})

test("a pane the user just split keeps its room until a tab closes in it", () => {
  const split = splitSessionPane({ all: [A], active: A }, { pane: "side", direction: "row" })
  const tabs = placeSessionTabs({ ...split.tabs, all: [A], active: A }, { ...split.tabs, all: [A], active: A })

  expect(paneLeaves(sessionPaneLayout(tabs))).toEqual(["side", "p1"])
})

test("a split's ratio is stored and kept across placement", () => {
  const split = splitSessionTab({ all: [A], active: A }, OPEN, { direction: "row" })
  const resized = resizeSessionPane(split, "split:p1", 0.3, split)
  const layout = sessionPaneLayout(resized)

  expect(layout.type === "split" && layout.ratio).toBe(0.3)

  const later = placeSessionTabs(resized, { ...resized, all: [A, OPEN], active: A })

  expect((sessionPaneLayout(later) as { ratio?: number }).ratio).toBe(0.3)
})

test("a tab stored in the legacy split pane migrates to a tree without rewriting its pane", () => {
  const tabs = placeSessionTabs({ all: [A], active: A }, { all: [A, T1], active: T1, panes: { [T1]: "split" } })

  expect(paneLeaves(sessionPaneLayout(tabs))).toEqual(["side", "split"])
  expect(tabs.panes).toEqual({ [T1]: "split" })
  expect(tabs.layout).toBeUndefined()
})

test("moving a tab into another pane keeps the selection of both", () => {
  const split = splitSessionTab({ all: [A, T1], active: T1 }, OPEN, { direction: "row" })
  const tabs = moveSessionTab(split, T1, "side")

  expect(tabs.panes).toEqual({ [OPEN]: "p1" })
  expect(tabs.active).toBe(T1)
  expect(tabs.selected).toEqual({ side: T1, p1: OPEN })
})

test.each<{ name: string; tabs: SessionTabs; tab: string; expected: boolean }>([
  { name: "a new tab beside a showing tab", tabs: { all: [A] }, tab: T1, expected: true },
  { name: "a tab the strip already holds", tabs: { all: [A, T1] }, tab: T1, expected: false },
  { name: "the first tab of an empty strip", tabs: { all: [] }, tab: T1, expected: false },
  { name: "a file, which joins its pane", tabs: { all: [A] }, tab: "file://b.ts", expected: false },
  { name: "a file launcher, which joins its pane", tabs: { all: [A] }, tab: OPEN, expected: false },
  { name: "a strip holding only bottom tabs", tabs: { all: [T1], panes: { [T1]: "bottom" } }, tab: T2, expected: false },
  { name: "a new plugin beside a tab in a split pane", tabs: { all: [T1], panes: { [T1]: "split" } }, tab: "artifacts:main", expected: true },
  { name: "a tab of a plugin that already has one, which joins that pane", tabs: { all: [A, T1] }, tab: T2, expected: false },
  { name: "a tab of a plugin whose sibling sits in the bottom pane", tabs: { all: [A, T1], panes: { [T1]: "bottom" } }, tab: T2, expected: false },
])("opensBeside: $name", ({ tabs, tab, expected }) => {
  expect(opensBeside(tabs, tab)).toBe(expected)
})

test("splitting a pane's only tab changes nothing, since the pane it left would close", () => {
  const single = { all: [A], active: A }
  const start = splitSessionTab({ all: [A, B], active: A }, B, { direction: "row" })

  expect(splitSessionTab(single, A, { direction: "row" })).toBe(single)
  expect(splitSessionTab(start, B, { pane: "p1", direction: "column" })).toBe(start)
})

test("dropping a pane's only tab on another pane's edge splits that pane and closes the pane it left", () => {
  const start = splitSessionTab({ all: [A, B], active: A }, B, { direction: "row" })
  const tabs = splitSessionTab(start, B, { pane: "side", direction: "column" })
  const leaves = paneLeaves(sessionPaneLayout(tabs))

  expect(leaves).toHaveLength(2)
  expect(leaves).not.toContain("p1")
  expect(sessionTabPane(tabs, A)).toBe("side")
  expect(sessionTabPane(tabs, B)).toBe("p2")
})

test("a split into the bottom pane, or into a pane that does not exist, moves nothing", () => {
  const tabs = { all: [A, B], active: A }

  expect(splitSessionTab(tabs, B, { pane: "bottom", direction: "row" })).toBe(tabs)
  expect(moveSessionTab(tabs, B, "p9")).toBe(tabs)
})

test("a closed side pane is not brought back by a tab opened later", () => {
  const split = splitSessionTab({ all: [A, B], active: A }, B, { direction: "row" })
  const moved = moveSessionTab(split, A, "p1")
  const opened = placeSessionTabs(moved, { ...moved, all: [...moved.all, "file:c"], active: "file:c" })
  const leaves = paneLeaves(sessionPaneLayout(opened))

  expect(paneLeaves(sessionPaneLayout(moved))).toEqual(["p1"])
  expect(leaves).toEqual(["p1"])
  expect(sessionTabPane(opened, "file:c")).toBe("p1")
})

test("a stale pane id in the stored strip falls back to the first pane instead of creating one", () => {
  const stored = { all: [A, B], active: A, panes: { [B]: "p9" } }
  const tabs = placeSessionTabs(stored, { ...stored, active: B })

  expect(paneLeaves(sessionPaneLayout(tabs))).toEqual(["side"])
  expect(sessionTabPane(tabs, B)).toBe("side")
})

test("a stored tree is cleaned: bottom and repeated leaves go, ratios stay in range", () => {
  const dirty: SessionTabs = {
    all: [A],
    layout: {
      type: "split",
      id: "split:p1",
      direction: "row",
      ratio: 7,
      children: [
        { type: "leaf", id: "side" },
        {
          type: "split",
          id: "split:p2",
          direction: "column",
          ratio: -3,
          children: [
            { type: "leaf", id: "bottom" },
            { type: "leaf", id: "side" },
          ],
        },
      ],
    },
  }

  const layout = sessionPaneLayout(dirty)

  expect(paneLeaves(layout)).toEqual(["side"])
  expect(sessionPaneLayout({ all: [], layout: { type: "leaf", id: "bottom" } })).toEqual({ type: "leaf", id: "side" })

  const ratios = sessionPaneLayout({
    all: [],
    layout: {
      type: "split",
      id: "split:p1",
      direction: "row",
      ratio: 7,
      children: [
        { type: "leaf", id: "side" },
        { type: "leaf", id: "p1" },
      ],
    },
  })

  expect(ratios.type === "split" && ratios.ratio).toBe(0.95)
  expect(sessionPaneLayout(dirty)).toEqual(layout)
})

test("a stored tree with nothing to clean keeps its identity", () => {
  const split = splitSessionTab({ all: [A, B], active: A }, B, { direction: "row" })

  expect(sessionPaneLayout(split) === split.layout).toBe(true)
})

test("a split can put the new pane first, for a drop on the left or top edge", () => {
  const after = splitSessionTab({ all: [A, B], active: A }, B, { direction: "row" })
  const before = splitSessionTab({ all: [A, B], active: A }, B, { direction: "row", first: true })

  expect(paneLeaves(sessionPaneLayout(after))).toEqual(["side", "p1"])
  expect(paneLeaves(sessionPaneLayout(before))).toEqual(["p1", "side"])
  expect(before.panes).toEqual({ [B]: "p1" })
})
