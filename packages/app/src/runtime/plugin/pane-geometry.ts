import { isPaneLeaf, paneLeaves, type PaneNode, type SessionPane } from "@/shell/state/session-tabs"

/** A rectangle in fractions of the side region: 0 to 1 across, 0 to 1 down. */
export type Box = { x: number; y: number; w: number; h: number }

export type PaneDivider = {
  /** The split it resizes. */
  id: string
  direction: "row" | "column"
  ratio: number
  /** The whole split, whose extent along `direction` the ratio shares. */
  split: Box
  /** The line between the two panes, at the ratio. */
  line: Box
}

export type PaneGeometry = {
  /** The panes to draw, in visual order, each with its box. */
  panes: { id: SessionPane; box: Box }[]
  dividers: PaneDivider[]
}

const WHOLE: Box = { x: 0, y: 0, w: 1, h: 1 }

/**
 * Lays a pane tree out in the region. A pane that `drawn` rejects gives its room to its sibling and has no divider, so
 * an empty pane takes no space. A tree with no drawn pane at all draws every pane, so a region with no tab still shows
 * its new tab view.
 *
 * Panes are placed by box rather than nested, so a pane keeps its place in the DOM, and its mounted panels, when the
 * tree around it changes shape.
 */
export function paneGeometry(root: PaneNode, drawn: (pane: SessionPane) => boolean): PaneGeometry {
  const everything = !paneLeaves(root).some(drawn)
  const live = (node: PaneNode) => everything || paneLeaves(node).some(drawn)
  const geometry: PaneGeometry = { panes: [], dividers: [] }

  const place = (node: PaneNode, box: Box) => {
    if (isPaneLeaf(node)) {
      geometry.panes.push({ id: node.id, box })

      return
    }

    const [first, second] = node.children

    if (!live(first)) return place(second, box)
    if (!live(second)) return place(first, box)

    if (node.direction === "row") {
      const width = box.w * node.ratio

      place(first, { ...box, w: width })
      place(second, { ...box, x: box.x + width, w: box.w - width })
      geometry.dividers.push({
        id: node.id,
        direction: "row",
        ratio: node.ratio,
        split: box,
        line: { x: box.x + width, y: box.y, w: 0, h: box.h },
      })

      return
    }

    const height = box.h * node.ratio

    place(first, { ...box, h: height })
    place(second, { ...box, y: box.y + height, h: box.h - height })
    geometry.dividers.push({
      id: node.id,
      direction: "column",
      ratio: node.ratio,
      split: box,
      line: { x: box.x, y: box.y + height, w: box.w, h: 0 },
    })
  }

  place(root, WHOLE)

  return geometry
}
