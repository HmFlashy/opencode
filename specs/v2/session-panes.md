# Session panes: side-by-side splits

Status: implemented on the fork (`web-plugin-gui`).

## Problem

The session side region was a single column: the `side` pane with the `split` pane stacked below it, and the `bottom`
pane under the timeline. Three tabs could be on screen, never side by side. A plugin could not choose the pane a tab
opens in, and could not ask for a new pane.

## Model

The side region holds a **pane tree**; the `bottom` pane stays a sibling of the region, under the session.

```ts
type PaneNode =
  | { type: "leaf"; id: SessionPane }
  | { type: "split"; id: string; direction: "row" | "column"; ratio: number; children: [PaneNode, PaneNode] }
```

- `SessionPane` is a string. `side`, `split` and `bottom` keep their meaning, so stored tabs and built-in panels need
  no migration. New leaves get `p1`, `p2`, … from `SessionTabs.serial`, which only grows, so an id is never reused.
- `ratio` is the share of the split's first child. The app keeps it between 5 and 95 percent.
- The tree lives in `SessionTabs.layout`. With no stored tree the layout is the legacy one: `column(side, split)` while a
  tab sits in `split`, else `leaf(side)`. That layout is not stored until the user splits differently.
- A stored tree is cleaned on read: `bottom` leaves and repeated leaf ids are dropped, and ratios are clamped.
- A leaf that loses its last tab closes and its sibling takes the room. A leaf the user just split stays until a tab
  closes in it. The tree always keeps one leaf.
- A tab with no stored pane shows in the **first leaf**, not necessarily `side`: once `side` closes, pinned tabs, the
  fallback selection and the new tab view use whichever leaf comes first.
- A pane id a stored tab names but the tree lacks falls back to the first leaf. Only the legacy `split` pane is brought
  back into a tree that lacks it.
- Tabs keep their global strip order; a pane draws the members of that order.

## Rendering

Panes are listed by id and placed by percentage boxes computed from the tree (`pane-geometry.ts`), not nested. A pane
keeps its DOM, and the terminals and editors mounted in it, when a split or a close reshapes the tree around it. A pane
with no tab and no new tab view takes no room; a region with none draws them all, so it still shows its new tab view.

Each split with two drawn sides has a divider: a focusable `separator` that a drag or the arrow keys move (Shift for
larger steps). Panes are kept at 200 px wide and 120 px high while a divider is dragged.

## Placement

- `Layout.open(key, session, { pane })`: the tab lands in that pane. A pane `Layout.panes` does not list is ignored, and
  the host's own placement stands (the pane of the last tab of the same plugin, else the pane a preview replaces, else
  the first pane).
- `Layout.open(key, session, { split: "row" | "column", pane? })`: the target pane (or the pane the tab would land in)
  splits at 0.5 and the tab lands in the new pane, selected.
- **Opens beside by default.** A tab new to the strip opens in a new pane to the right when a tab already shows outside
  the bottom pane, unless: it is a `file:` tab; its plugin already has a tab (it joins that pane); the open is a
  `preview` or an `append`; the caller gave `pane` or `split`; a pane's `+` menu is waiting to place it; or the screen
  is narrow.
- `Layout.place(key, session, pane, { before? })` moves an open tab and selects it. A key that is not open, or a pane
  `Layout.panes` does not list, does nothing.
- `Layout.split(key, session, { direction, pane? })` splits `pane` (or the pane of `key`) and moves `key` into the new
  pane. It does nothing when `key` is the only tab of that pane, since the pane would close and leave the same
  arrangement, and it never splits `bottom`.
- `Layout.panes(session)` lists the leaves in visual order with their tabs and shown tab. Reactive; empty while the
  session's location is unknown.
- An `append` adds a tab quietly: it never selects it, even with `pane` or `split`.

## Gestures

- Dragging a tab over a pane's centre moves it there. Over the left or top quarter it splits the pane and puts the new
  pane first; over the right or bottom quarter, after. A pane's only tab offers no split zone. Below the timeline the
  bottom pane keeps working as before, and it never splits.
- Dropping on a strip places the tab between its neighbours.
- A pane's `+` menu adds a tab to that pane.
- `Escape` cancels a drag.

## Non-goals

- The `bottom` pane does not move into the tree.
- Narrow screens keep today's single mobile view.
- No automatic wrapping: the user splits, resizes and closes panes.
- The legacy `split` ratio stored before the tree existed is not carried over; the first split starts at 0.5.

## Tests

- `session-tabs.test.ts`: split, move, close-to-collapse, legacy migration, ratios, the opens-beside rule, stale ids,
  stored-tree cleaning.
- `pane-geometry.test.ts`: boxes, dividers, empty panes, identity across reshapes.
- `component-tests/layout-panes.spec.ts`: `panes`, `place`, `split` and `open` through the real host APIs.
- `e2e/regression/side-panels.spec.ts`: panes side by side and nested, divider resize and reload, drag to each edge,
  centre moves and merge, close merges, cancel.
