/** Where a tab shows: a leaf of the side region's pane tree, or the bottom pane under the session. */
export type SessionPane = "side" | "split" | "bottom" | (string & {})

/** The panes every session starts with; see `PaneNode` for the leaves a split adds. */
export const SESSION_PANES: readonly SessionPane[] = ["side", "split", "bottom"]

/** A leaf of the region: one tab strip, one shown tab. */
export type PaneLeaf = { readonly type: "leaf"; readonly id: SessionPane }

/** Two panes side by side (`row`) or stacked (`column`); `ratio` is the share of the first child. */
export type PaneSplit = {
  readonly type: "split"
  readonly id: string
  readonly direction: "row" | "column"
  readonly ratio: number
  readonly children: readonly [PaneNode, PaneNode]
}

export type PaneNode = PaneLeaf | PaneSplit

export type SessionTabs = {
  active?: string
  all: string[]
  /** The pane of each stored tab outside `side`, the pane every unplaced tab shows in. */
  panes?: Record<string, SessionPane>
  /** The tab each pane shows; the pane holding `active` shows `active`. */
  selected?: { [pane: string]: string }
  /** The side region's pane tree. Absent until the user splits a pane; see `sessionPaneLayout`. */
  layout?: PaneNode
  /** The last number handed to `nextSessionPaneId`. */
  serial?: number
}

export type SessionTabState = {
  tabs: SessionTabs
  preview?: string
}

export const sessionTabPane = (tabs: SessionTabs, tab: string): SessionPane => tabs.panes?.[tab] ?? "side"

/**
 * Whether opening `tab` should show it in a new pane beside the others: only a tab the strip does not hold yet, with a
 * tab already showing outside the bottom pane. Files and a plugin that already has a tab join the pane they open in
 * (the host's default), or opening several terminals or files would split the region once per tab.
 */
export function opensBeside(previous: SessionTabs, tab: string): boolean {
  if (previous.all.includes(tab) || tab.startsWith("file:")) return false
  const plugin = tab.slice(0, tab.indexOf(":") + 1)

  if (plugin && previous.all.some((item) => item.startsWith(plugin))) return false

  return previous.all.some((item) => sessionTabPane(previous, item) !== "bottom")
}

const DEFAULT_PANE: SessionPane = "side"

export const isPaneLeaf = (node: PaneNode): node is PaneLeaf => node.type === "leaf"

/** The leaves of a tree, in visual order. */
export function paneLeaves(node: PaneNode): SessionPane[] {
  if (isPaneLeaf(node)) return [node.id]

  return node.children.flatMap(paneLeaves)
}

const MIN_RATIO = 0.05

const clampRatio = (ratio: number) => Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, ratio))

/**
 * Drops what a stored tree cannot be trusted for: `bottom` leaves, a leaf id seen twice, and ratios that would collapse
 * a pane. Returns the same tree when it holds none of them, so memos over it keep their identity.
 */
function sanitizeLayout(node: PaneNode): PaneNode {
  const seen = new Set<string>()

  const walk = (current: PaneNode): PaneNode | undefined => {
    if (isPaneLeaf(current)) {
      if (current.id === "bottom" || seen.has(current.id)) return undefined
      seen.add(current.id)

      return current
    }

    const first = walk(current.children[0])
    const second = walk(current.children[1])

    if (!first || !second) return first ?? second
    const ratio = clampRatio(current.ratio)

    if (first === current.children[0] && second === current.children[1] && ratio === current.ratio) return current

    return { ...current, ratio, children: [first, second] }
  }

  return walk(node) ?? { type: "leaf", id: DEFAULT_PANE }
}

/**
 * The stored tree, or the layout a session without one had before panes could split: the `split` pane below `side`
 * while it holds a tab, else `side` alone.
 */
export function sessionPaneLayout(tabs: SessionTabs): PaneNode {
  if (tabs.layout) return sanitizeLayout(tabs.layout)

  const split = tabs.all.some((tab) => sessionTabPane(tabs, tab) === "split")

  if (!split) return { type: "leaf", id: DEFAULT_PANE }

  return {
    type: "split",
    id: "split:0",
    direction: "column",
    ratio: 0.5,
    children: [
      { type: "leaf", id: "side" },
      { type: "leaf", id: "split" },
    ],
  }
}

/** Every pane of a session, the tree's leaves then `bottom`. */
export function sessionPaneIds(tabs: SessionTabs): SessionPane[] {
  return [...paneLeaves(sessionPaneLayout(tabs)), "bottom"]
}

/** The id of the pane a split adds. */
export function nextSessionPaneId(tabs: SessionTabs): SessionPane {
  return `p${(tabs.serial ?? 0) + 1}`
}

const paneTabs = (tabs: SessionTabs, pane: SessionPane) =>
  tabs.all.filter((tab) => sessionTabPane(tabs, tab) === pane)

/** Replaces the leaf `target` with a split of it and a new leaf, in `direction`. */
function splitLeaf(node: PaneNode, target: SessionPane, split: PaneSplit): PaneNode {
  if (isPaneLeaf(node)) return node.id === target ? split : node

  const first = splitLeaf(node.children[0], target, split)

  if (first !== node.children[0]) return { ...node, children: [first, node.children[1]] }

  return { ...node, children: [node.children[0], splitLeaf(node.children[1], target, split)] }
}

/**
 * Drops the leaves that lost their last tab, giving their room to the sibling. A leaf that never held a tab stays, so
 * a pane the user just split shows its new tab view. `previous` tells which leaves held tabs before this write.
 */
function pruneLeaves(node: PaneNode, previous: SessionTabs, tabs: SessionTabs): PaneNode | undefined {
  if (isPaneLeaf(node)) {
    if (paneTabs(tabs, node.id).length > 0) return node
    if (paneTabs(previous, node.id).length === 0) return node

    return undefined
  }

  const first = pruneLeaves(node.children[0], previous, tabs)
  const second = pruneLeaves(node.children[1], previous, tabs)

  if (first && second) return { ...node, children: [first, second] }

  return first ?? second
}

/** Adds a leaf beside `pane`, or beside the first leaf when `pane` is `bottom` or unknown. */
export function splitSessionPane(
  tabs: SessionTabs,
  options: { pane?: SessionPane; direction: "row" | "column"; ratio?: number; first?: boolean },
): { tabs: SessionTabs; pane: SessionPane } {
  const layout = sessionPaneLayout(tabs)
  const leaves = paneLeaves(layout)
  const target = options.pane && leaves.includes(options.pane) ? options.pane : leaves[0]
  const pane = nextSessionPaneId(tabs)
  const ratio = options.ratio ?? 0.5

  const children: readonly [PaneNode, PaneNode] = options.first
    ? [
        { type: "leaf", id: pane },
        { type: "leaf", id: target },
      ]
    : [
        { type: "leaf", id: target },
        { type: "leaf", id: pane },
      ]

  const split: PaneSplit = { type: "split", id: `split:${pane}`, direction: options.direction, ratio, children }

  return { tabs: { ...tabs, layout: splitLeaf(layout, target, split), serial: (tabs.serial ?? 0) + 1 }, pane }
}

/** Stores a split's ratio, e.g. from a drag on its handle. */
export function resizeSessionPane(tabs: SessionTabs, split: string, ratio: number, previous?: SessionTabs): SessionTabs {
  const layout = previous ? sessionPaneLayout(previous) : sessionPaneLayout(tabs)

  const resize = (node: PaneNode): PaneNode => {
    if (isPaneLeaf(node)) return node
    if (node.id === split) return { ...node, ratio: clampRatio(ratio) }

    return { ...node, children: [resize(node.children[0]), resize(node.children[1])] }
  }

  return { ...tabs, layout: resize(layout) }
}

const defaultLegacyLayout = (node: PaneNode): boolean =>
  isPaneLeaf(node)
    ? node.id === DEFAULT_PANE
    : node.direction === "column" &&
      node.ratio === 0.5 &&
      isPaneLeaf(node.children[0]) &&
      node.children[0].id === DEFAULT_PANE &&
      isPaneLeaf(node.children[1]) &&
      node.children[1].id === "split"

/**
 * Carries pane placement from `previous` into `next`, the strip and selection a tab operation just wrote. Kept tabs
 * keep their pane unless `next` places them. A new tab goes to `target` when given, else to the pane of the tab it
 * replaced in place (a preview), else to the pane of the last tab of its plugin, else the first pane. A pane whose
 * shown tab left shows that tab's nearest neighbour, and a pane that lost its last tab closes.
 */
export function placeSessionTabs(previous: SessionTabs, next: SessionTabs, target?: SessionPane): SessionTabs {
  const kept = new Set(previous.all)
  let layout = next.layout ? sanitizeLayout(next.layout) : sessionPaneLayout(previous)

  // A session stored before the tree existed keeps tabs in the legacy `split` pane. It joins below the first leaf, where
  // that pane sat. Any other pane the tree lacks (a closed pane, a stale target, a partial store) is not recreated: its
  // tabs fall back to the first pane, or a closed `side` would come back as an empty pane.
  const attach = (pane: SessionPane | undefined) => {
    if (pane !== "split" || paneLeaves(layout).includes(pane)) return
    const first = paneLeaves(layout)[0]

    layout = splitLeaf(layout, first, {
      type: "split",
      id: `split:${pane}`,
      direction: "column",
      ratio: 0.5,
      children: [
        { type: "leaf", id: first },
        { type: "leaf", id: pane },
      ],
    })
  }

  const stored = next.panes ? next : previous

  next.all.forEach((tab) => attach(stored.panes?.[tab]))

  // A target names the pane the next new tab opens in. Only a write that adds a tab may bring back the legacy pane, or a
  // stale target would leave it empty.
  if (next.all.some((tab) => !kept.has(tab))) attach(target)

  const leaves = paneLeaves(layout)
  const valid = new Set<SessionPane>([...leaves, "bottom"])

  const placed = (tab: string, index: number): SessionPane => {
    const explicit = next.panes?.[tab]

    if (explicit && valid.has(explicit)) return explicit
    if (kept.has(tab)) {
      const pane = sessionTabPane(next.panes ? next : previous, tab)

      return valid.has(pane) ? pane : leaves[0]
    }

    if (target && valid.has(target)) return target
    const replaced = previous.all[index]

    if (replaced !== undefined && !next.all.includes(replaced)) return sessionTabPane(previous, replaced)
    const plugin = tab.slice(0, tab.indexOf(":") + 1)
    const sibling = plugin ? previous.all.findLast((item) => item.startsWith(plugin)) : undefined

    return sibling ? sessionTabPane(previous, sibling) : leaves[0]
  }

  const panes: Record<string, SessionPane> = Object.fromEntries(
    next.all.flatMap((tab, index) => {
      const pane = placed(tab, index)

      return pane === DEFAULT_PANE ? [] : [[tab, pane]]
    }),
  )

  const tabs: SessionTabs = { all: next.all, panes }
  const activePane = next.active === undefined ? undefined : sessionTabPane(tabs, next.active)

  const selections = [...leaves, "bottom"].flatMap((pane) => {
      if (pane === activePane) return [[pane, next.active]]
      const shown = sessionPaneTab(previous, pane)
      const members = paneTabs(tabs, pane)

      if (shown === undefined) return members.length > 0 && pane !== DEFAULT_PANE ? [[pane, members[0]]] : []

      // A tab the strip never stored, e.g. a pinned one, shows in the first pane.
      if (members.includes(shown) || (pane === DEFAULT_PANE && !kept.has(shown) && !next.all.includes(shown)))
        return [[pane, shown]]

      const before = paneTabs(previous, pane)
      const index = before.indexOf(shown)

      const neighbour = [...before.slice(0, Math.max(0, index)).toReversed(), ...before.slice(index + 1)].find((tab) =>
        members.includes(tab),
      )

      const fallback = neighbour ?? members[0]

      return fallback === undefined ? [] : [[pane, fallback]]
    })

  const pruned = pruneLeaves(layout, previous, tabs) ?? { type: "leaf", id: DEFAULT_PANE }
  const surviving = paneLeaves(pruned)
  const single = surviving.length === 1 && surviving[0] === DEFAULT_PANE && !next.layout
  const lost = new Set(leaves.filter((pane) => !surviving.includes(pane)))
  const remapped =
    lost.size === 0
      ? panes
      : Object.fromEntries(Object.entries(panes).map(([tab, pane]) => [tab, lost.has(pane) ? surviving[0] : pane]))
  const visible = Object.fromEntries(
    selections.filter(([pane]) => pane === "bottom" || surviving.includes(pane as SessionPane)),
  ) as { [pane: string]: string }

  return {
    all: next.all,
    ...(next.active === undefined ? {} : { active: next.active }),
    // An empty `panes` still says nothing is placed outside the first pane. Dropped, the next placement would read it as
    // "unchanged" and bring the old placement back, so the last tab of a pane could never move out of it.
    ...(Object.keys(remapped).length > 0 || next.panes !== undefined || previous.panes !== undefined
      ? { panes: remapped }
      : {}),
    ...(Object.keys(visible).length > 0 ? { selected: visible } : {}),
    ...(single || defaultLegacyLayout(pruned) ? {} : { layout: pruned }),
    ...(next.serial ?? previous.serial ? { serial: next.serial ?? previous.serial } : {}),
  }
}

/**
 * Moves `tab` into `pane` and selects it: before `before`, at the pane's start when `before` is a tab the strip does
 * not store (a pinned one), or at the pane's end without `before`.
 */
export function moveSessionTab(current: SessionTabs, tab: string, pane: SessionPane, before?: string): SessionTabs {
  const known = current.layout ? sessionPaneIds(current) : [...sessionPaneIds(current), "split"]

  if (!known.includes(pane)) return current
  const target = pane
  const rest = current.all.filter((item) => item !== tab)
  const members = rest.filter((item) => sessionTabPane(current, item) === target)
  const anchor = before === undefined ? undefined : members.includes(before) ? before : members[0]
  const last = members.at(-1)

  const position =
    anchor !== undefined ? rest.indexOf(anchor) : last !== undefined ? rest.indexOf(last) + 1 : rest.length

  const placements = Object.fromEntries(Object.entries(current.panes ?? {}).filter(([key]) => key !== tab))

  return placeSessionTabs(current, {
    ...current,
    all: [...rest.slice(0, position), tab, ...rest.slice(position)],
    active: tab,
    panes: target === DEFAULT_PANE ? placements : { ...placements, [tab]: target },
    layout: current.layout,
  })
}

/** Splits `pane` (or the pane `tab` is in) in `direction`, moving `tab` into the new leaf. */
export function splitSessionTab(
  current: SessionTabs,
  tab: string,
  options: { pane?: SessionPane; direction: "row" | "column"; before?: string; first?: boolean },
): SessionTabs {
  const pane = options.pane ?? sessionTabPane(current, tab)
  const leaves = paneLeaves(sessionPaneLayout(current))
  const target = leaves.includes(pane) ? pane : leaves[0]

  // The bottom pane sits outside the tree. And splitting off a pane's only tab would empty it, so the pane would close
  // and leave the same arrangement under a new id.
  if (pane === "bottom") return current
  if (sessionTabPane(current, tab) === target && paneTabs(current, target).every((item) => item === tab)) return current

  const split = splitSessionPane(current, {
    pane,
    direction: options.direction,
    first: options.first,
  })

  return moveSessionTab(split.tabs, tab, split.pane, options.before)
}

/** The tab a pane shows: the active tab in its pane, else the pane's own selection. */
export function sessionPaneTab(tabs: SessionTabs, pane: SessionPane) {
  if (tabs.active !== undefined && sessionTabPane(tabs, tabs.active) === pane) return tabs.active

  return tabs.selected?.[pane]
}

/**
 * A launcher tab (e.g. the file browser) stays replaceable by the next preview even after reload. With several
 * launchers open, the selected one is the one its pick replaces.
 */
const sessionTabPreview = (current: SessionTabState, launchers: ReadonlySet<string>) => {
  const active = current.tabs.active

  if (active && launchers.has(active)) return active

  return current.preview ?? current.tabs.all.find((tab) => launchers.has(tab))
}

export function previewSessionTab(
  current: SessionTabState,
  tab: string,
  launchers: ReadonlySet<string> = new Set(),
): SessionTabState {
  const preview = sessionTabPreview(current, launchers)
  const previewIndex = preview ? current.tabs.all.indexOf(preview) : -1
  const existingIndex = current.tabs.all.indexOf(tab)

  if (existingIndex !== -1) {
    if (previewIndex === -1 || preview === tab) {
      return { tabs: { all: current.tabs.all, active: tab }, preview: preview === tab ? tab : undefined }
    }

    return {
      tabs: { all: current.tabs.all.filter((item) => item !== preview), active: tab },
    }
  }

  if (previewIndex === -1) {
    return { tabs: { all: [...current.tabs.all, tab], active: tab }, preview: tab }
  }

  return {
    tabs: {
      all: current.tabs.all.map((item, index) => (index === previewIndex ? tab : item)),
      active: tab,
    },
    preview: tab,
  }
}

/** A `first` tab is stored first and keeps the preview tab, so closing it selects the first remaining tab. */
export function openSessionTab(
  current: SessionTabState,
  tab: string,
  launchers: ReadonlySet<string> = new Set(),
  first = false,
): SessionTabState {
  const preview = sessionTabPreview(current, launchers)

  if (first) {
    return {
      tabs: { all: [tab, ...current.tabs.all.filter((item) => item !== tab)], active: tab },
      preview,
    }
  }

  const previewIndex = preview ? current.tabs.all.indexOf(preview) : -1
  const existingIndex = current.tabs.all.indexOf(tab)

  if (existingIndex !== -1) {
    if (previewIndex === -1 || preview === tab) {
      return { tabs: { all: current.tabs.all, active: tab } }
    }

    return {
      tabs: { all: current.tabs.all.filter((item) => item !== preview), active: tab },
    }
  }

  if (previewIndex === -1) {
    return { tabs: { all: [...current.tabs.all, tab], active: tab } }
  }

  return {
    tabs: {
      all: current.tabs.all.map((item, index) => (index === previewIndex ? tab : item)),
      active: tab,
    },
  }
}

export function closeSessionTab(current: SessionTabState, tab: string): SessionTabState {
  const all = current.tabs.all.filter((item) => item !== tab)
  const preview = current.preview === tab ? undefined : current.preview

  if (current.tabs.active !== tab) return { tabs: { ...current.tabs, all }, preview }

  // The next tab of the same pane takes the selection, else the tab another pane shows.
  const pane = sessionTabPane(current.tabs, tab)
  const members = paneTabs(current.tabs, pane)
  const index = members.indexOf(tab)
  const other = sessionPaneIds(current.tabs).flatMap((item) =>
    item === pane ? [] : (sessionPaneTab(current.tabs, item) ?? []),
  )

  return {
    tabs: {
      ...current.tabs,
      all,
      active: members[index - 1] ?? members[index + 1] ?? other.find((item) => all.includes(item)) ?? all[0],
    },
    preview,
  }
}
