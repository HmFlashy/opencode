import { expect, test } from "bun:test"
import {
  closeSessionTab,
  moveSessionTab,
  openSessionTab,
  paneLeaves,
  placeSessionTabs,
  previewSessionTab,
  resizeSessionPane,
  sessionPaneIds,
  sessionPaneLayout,
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
