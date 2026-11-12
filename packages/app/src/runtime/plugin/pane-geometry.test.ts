import { expect, test } from "bun:test"
import type { PaneNode } from "@/shell/state/session-tabs"
import { paneGeometry } from "./pane-geometry"

const leaf = (id: string): PaneNode => ({ type: "leaf", id })

const split = (id: string, direction: "row" | "column", ratio: number, a: PaneNode, b: PaneNode): PaneNode => ({
  type: "split",
  id,
  direction,
  ratio,
  children: [a, b],
})

const all = () => true

test("a single pane fills the region and has no divider", () => {
  expect(paneGeometry(leaf("side"), all)).toEqual({
    panes: [{ id: "side", box: { x: 0, y: 0, w: 1, h: 1 } }],
    dividers: [],
  })
})

test("a row split shares the width at its ratio, with a divider between", () => {
  const geometry = paneGeometry(split("s", "row", 0.3, leaf("side"), leaf("p1")), all)

  expect(geometry.panes).toEqual([
    { id: "side", box: { x: 0, y: 0, w: 0.3, h: 1 } },
    { id: "p1", box: { x: 0.3, y: 0, w: 0.7, h: 1 } },
  ])
  expect(geometry.dividers).toEqual([
    {
      id: "s",
      direction: "row",
      ratio: 0.3,
      split: { x: 0, y: 0, w: 1, h: 1 },
      line: { x: 0.3, y: 0, w: 0, h: 1 },
    },
  ])
})

test("a column split shares the height", () => {
  const geometry = paneGeometry(split("s", "column", 0.25, leaf("side"), leaf("split")), all)

  expect(geometry.panes.map((pane) => pane.box)).toEqual([
    { x: 0, y: 0, w: 1, h: 0.25 },
    { x: 0, y: 0.25, w: 1, h: 0.75 },
  ])
})

test("nested splits divide the box of the pane they split, and each divider knows its own split", () => {
  const tree = split("a", "row", 0.5, leaf("side"), split("b", "column", 0.4, leaf("p1"), leaf("p2")))
  const geometry = paneGeometry(tree, all)

  expect(geometry.panes).toEqual([
    { id: "side", box: { x: 0, y: 0, w: 0.5, h: 1 } },
    { id: "p1", box: { x: 0.5, y: 0, w: 0.5, h: 0.4 } },
    { id: "p2", box: { x: 0.5, y: 0.4, w: 0.5, h: 0.6 } },
  ])
  expect(geometry.dividers.map((divider) => divider.id).toSorted()).toEqual(["a", "b"])
  expect(geometry.dividers.find((divider) => divider.id === "b")?.split).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 })
})

test("an empty pane gives its room to its sibling and leaves no divider", () => {
  const tree = split("a", "row", 0.5, leaf("side"), leaf("p1"))

  const geometry = paneGeometry(tree, (pane) => pane === "side")

  expect(geometry.panes).toEqual([{ id: "side", box: { x: 0, y: 0, w: 1, h: 1 } }])
  expect(geometry.dividers).toEqual([])
  expect(paneGeometry(tree, (pane) => pane === "p1").panes).toEqual([{ id: "p1", box: { x: 0, y: 0, w: 1, h: 1 } }])
})

test("a whole empty branch collapses while the rest keeps its share", () => {
  const tree = split("a", "row", 0.5, leaf("side"), split("b", "column", 0.5, leaf("p1"), leaf("p2")))

  const geometry = paneGeometry(tree, (pane) => pane !== "p2")

  expect(geometry.panes).toEqual([
    { id: "side", box: { x: 0, y: 0, w: 0.5, h: 1 } },
    { id: "p1", box: { x: 0.5, y: 0, w: 0.5, h: 1 } },
  ])
  expect(geometry.dividers.map((divider) => divider.id)).toEqual(["a"])
})

test("a tree with no drawn pane draws every pane, so an empty region still shows its new tab view", () => {
  const tree = split("a", "row", 0.5, leaf("side"), leaf("p1"))

  expect(paneGeometry(tree, () => false).panes.map((pane) => pane.id)).toEqual(["side", "p1"])
  expect(paneGeometry(leaf("side"), () => false).panes.map((pane) => pane.id)).toEqual(["side"])
})

test("panes keep their id and order when the tree around them changes shape", () => {
  const before = paneGeometry(leaf("p1"), all)
  const after = paneGeometry(split("a", "row", 0.5, leaf("p1"), leaf("p2")), all)

  expect(before.panes.map((pane) => pane.id)).toEqual(["p1"])
  expect(after.panes.map((pane) => pane.id)).toEqual(["p1", "p2"])
})
