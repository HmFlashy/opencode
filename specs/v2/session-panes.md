# Session panes: side-by-side splits

Status: implementation in progress.

## Problem

The session side region is a single column: the `side` pane with the `split` pane stacked below it, and the
`bottom` pane under the timeline. Three tabs can be on screen, but never side by side. A plugin cannot choose
the pane a tab opens in, and cannot ask for a new pane.

## Model

The side region holds a **pane tree**; the `bottom` pane stays a sibling of the region, under the session.

```ts
type PaneNode =
  | { type: "leaf"; id: SessionPane }
  | { type: "split"; id: string; direction: "row" | "column"; ratio: number; children: [PaneNode, PaneNode] }
```

- `SessionPane` is a string. `side`, `split` and `bottom` keep their meaning, so stored tabs and built-in panels
  need no migration. New leaves get `p1`, `p2`, … from `SessionTabs.serial`.
- `ratio` is the share of the split's first child, 0–1.
- The tree lives in `SessionTabs.layout`. No stored tree means the legacy layout: `column(side, split)` when a tab
  sits in `split`, else `leaf(side)`. The stored `split.ratio` seeds that first split; once the tree is stored, it
  owns every ratio.
- A leaf with no tab collapses into its sibling; the tree always keeps at least one leaf, and collapses to
  `leaf(side)` when it would hold one leaf without a tab of its own.
- Tabs keep their global strip order; a pane draws the members of that order, as it does today.

## Placement

- `Layout.open(key, session, { pane })`: the tab lands in that leaf; an unknown id falls back to the host default.
- `Layout.open(key, session, { split: "row" | "column", pane? })`: the target leaf (or the pane the tab would
  land in) splits in that direction at 0.5, and the tab lands in the new leaf, selected.
- Host default, unchanged in spirit: the pane of the last tab of the same plugin, else the pane of the tab a
  preview replaces, else `side`.
- `Layout.place(key, session, { pane, before? })` moves an open tab between leaves.
- `Layout.panes(session)` lists the leaves in visual order with their tabs and shown tab, so a plugin can decide
  where to open. Reactive, like `Layout.state`.

## Gestures

- Dragging a tab over a pane's centre moves it there; over the left, right, top or bottom quarter it splits that
  pane in that direction. Dragging below the timeline keeps placing tabs in the `bottom` pane.
- Each split draws a resize handle; the ratio is stored in the tree.

## Non-goals

- The `bottom` pane does not move into the tree.
- Narrow screens keep today's single mobile view.
- No automatic wrapping: the user splits, resizes, and closes panes.

## Tests

- `session-tabs.test.ts`: split, move, close-to-collapse, legacy migration, ratio storage.
- `layout.test.ts`: placement through `open`/`place`, persistence and copy.
- e2e `side-panels.spec.ts`: two panes side by side, drag-to-split, resize, reload restore.
