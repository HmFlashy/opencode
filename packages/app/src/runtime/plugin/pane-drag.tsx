import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Portal } from "solid-js/web"
import { type SessionPane } from "@/shell/state/session-tabs"

type Rect = { left: number; top: number; width: number; height: number }

/** Where a dragged tab lands: before a tab in a pane's strip (its end without `before`), or in a pane. */
export type PaneDropTarget = {
  pane: SessionPane
  before?: string
  strip: boolean
  rect: Rect
  /** When set, dropping splits `pane` in this direction and puts the tab in the new leaf. */
  split?: "row" | "column"
  /** With `split`, the new pane goes before `pane` (left or above) instead of after it. */
  first?: boolean
}

/**
 * Drags side and bottom panel tabs between panes. The strips and pane bodies mark themselves with `data-pane-strip`,
 * `data-pane-tab` and `data-pane-content`; the session row with `data-pane-row`. Dropping on a strip places the tab
 * between its neighbours, on a pane body moves it there, on the lower half of the side pane splits it, and on the
 * bottom edge of the session opens the bottom pane.
 */
export function createPaneDrag(input: {
  /** Panes that hold tabs; a pane without them is created by dropping on its zone. */
  shown: (pane: SessionPane) => boolean
  /** Whether `key` is the only tab of `pane`: splitting it off would close the pane, so no split zone is offered. */
  solo: (key: string, pane: SessionPane) => boolean
  drop: (key: string, target: PaneDropTarget) => void
}) {
  const [state, setState] = createStore<{
    key?: string
    title: string
    x: number
    y: number
    target?: PaneDropTarget
  }>({ title: "", x: 0, y: 0 })

  const inside = (rect: DOMRect, x: number, y: number) =>
    rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom

  const hit = (x: number, y: number, key: string): PaneDropTarget | undefined => {
    // A scrolled strip, or one wider than its animating pane, extends past what is on screen.
    const strip = Array.from(document.querySelectorAll<HTMLElement>("[data-pane-strip]")).find((element) =>
      inside(visibleRect(element), x, y),
    )

    const stripPane = paneOf(strip?.dataset.paneStrip)

    if (strip && stripPane) {
      const allTabs = Array.from(strip.querySelectorAll<HTMLElement>("[data-pane-tab]"))
      const unpinned = allTabs.filter((element) => !element.hasAttribute("data-pane-pinned"))
      const draggedIndex = unpinned.findIndex((element) => element.dataset.paneTab === key)
      const bounds = visibleRect(strip)
      const addWidth = strip.lastElementChild instanceof HTMLElement ? strip.lastElementChild.offsetWidth : 0
      const maxRight = Math.max(bounds.left + 2, bounds.right - addWidth - 2)

      let before: string | undefined
      let indicatorLeft: number | undefined
      let anchorHeight = 40
      let anchorTop = bounds.top + 2

      if (draggedIndex === -1) {
        const next = unpinned.find((element) => {
          const rect = element.getBoundingClientRect()

          return x < rect.left + rect.width / 2
        })

        const last = (unpinned.at(-1) ?? allTabs.at(-1))?.getBoundingClientRect()
        before = next?.dataset.paneTab
        const targetRect = next?.getBoundingClientRect() ?? last

        if (targetRect) {
          anchorHeight = targetRect.height
          anchorTop = targetRect.top
          indicatorLeft = next ? targetRect.left - 1 : targetRect.right - 1
        }
      } else {
        const leftTarget = unpinned.slice(0, draggedIndex).find((element) => {
          const rect = element.getBoundingClientRect()

          return x < rect.left + rect.width / 2
        })

        if (leftTarget) {
          before = leftTarget.dataset.paneTab
          const rect = leftTarget.getBoundingClientRect()
          anchorHeight = rect.height
          anchorTop = rect.top
          indicatorLeft = rect.left - 1
        } else {
          const rightTargetIndex = unpinned.findLastIndex((element, index) => {
            if (index <= draggedIndex) return false
            const rect = element.getBoundingClientRect()

            return x > rect.left + rect.width / 2
          })

          if (rightTargetIndex !== -1) {
            before = unpinned[rightTargetIndex + 1]?.dataset.paneTab
            const rect = unpinned[rightTargetIndex].getBoundingClientRect()
            anchorHeight = rect.height
            anchorTop = rect.top
            indicatorLeft = rect.right - 1
          } else {
            before = unpinned[draggedIndex + 1]?.dataset.paneTab
            const rect = unpinned[draggedIndex].getBoundingClientRect()
            anchorHeight = rect.height
            anchorTop = rect.top
            indicatorLeft = rect.left - 1
          }
        }
      }

      const rect =
        indicatorLeft !== undefined
          ? {
              left: Math.min(Math.max(indicatorLeft, bounds.left), maxRight),
              top: anchorTop + 2,
              width: 2,
              height: Math.max(16, anchorHeight - 4),
            }
          : { left: bounds.left + 12, top: bounds.top + 12, width: 2, height: bounds.height - 24 }

      return {
        pane: stripPane,
        before,
        strip: true,
        rect,
      }
    }

    const content = Array.from(document.querySelectorAll<HTMLElement>("[data-pane-content]")).find((element) =>
      inside(element.getBoundingClientRect(), x, y),
    )

    const contentPane = paneOf(content?.dataset.paneContent)

    if (content && contentPane) {
      const rect = content.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      if (w <= 0 || h <= 0) return

      const normX = (x - rect.left) / w
      const normY = (y - rect.top) / h
      const dLeft = normX
      const dRight = 1 - normX
      const dTop = normY
      const dBottom = 1 - normY
      const minEdge = Math.min(dLeft, dRight, dTop, dBottom)

      // Dropping near an edge splits the pane; the centre moves the tab into it.
      // The bottom pane sits outside the pane tree, so only the tree's panes split.
      if (contentPane !== "bottom" && !input.solo(key, contentPane) && minEdge < 0.25) {
        const isColumn = minEdge === dTop || minEdge === dBottom
        const onSecond = minEdge === dBottom || minEdge === dRight
        const split = isColumn ? "column" : "row"
        const half = isColumn
          ? { left: rect.left, top: onSecond ? rect.top + h / 2 : rect.top, width: w, height: h / 2 }
          : { left: onSecond ? rect.left + w / 2 : rect.left, top: rect.top, width: w / 2, height: h }

        return { pane: contentPane, strip: false, split, first: !onSecond, rect: half }
      }

      return { pane: contentPane, strip: false, rect: toRect(rect) }
    }

    const chat = document.querySelector<HTMLElement>('[data-slot="session-chat-panel"]')?.getBoundingClientRect()
    const row = document.querySelector<HTMLElement>("[data-pane-row]")?.getBoundingClientRect()

    if (!chat || !row || input.shown("bottom") || !inside(chat, x, y) || y < chat.bottom - chat.height / 4) return
    const height = Math.min(280, row.height / 3)

    return {
      pane: "bottom",
      strip: false,
      rect: { left: row.left, top: row.bottom - height, width: row.width, height },
    }
  }

  const start = (event: PointerEvent, key: string, title: string) => {
    if (event.button !== 0) return
    const origin = { x: event.clientX, y: event.clientY }
    const drag = { active: false }
    const swallow = (click: MouseEvent) => click.stopPropagation()

    let scrollRaf: number | undefined
    let lastX = origin.x
    let lastY = origin.y

    const stopAutoScroll = () => {
      if (scrollRaf !== undefined) {
        cancelAnimationFrame(scrollRaf)
        scrollRaf = undefined
      }
    }

    const stepAutoScroll = () => {
      if (!drag.active) {
        scrollRaf = undefined
        return
      }

      const strip = Array.from(document.querySelectorAll<HTMLElement>("[data-pane-strip]")).find((element) =>
        inside(visibleRect(element), lastX, lastY),
      )
      if (!strip) {
        scrollRaf = undefined
        return
      }

      const bounds = visibleRect(strip)
      const addWidth = strip.lastElementChild instanceof HTMLElement ? strip.lastElementChild.offsetWidth : 0
      const rightEdge = bounds.right - addWidth
      const SCROLL_ZONE = 36
      const MAX_SPEED = 10

      let delta = 0
      if (lastX < bounds.left + SCROLL_ZONE && strip.scrollLeft > 0) {
        const factor = Math.max(0, Math.min(1, (bounds.left + SCROLL_ZONE - lastX) / SCROLL_ZONE))
        delta = -Math.round(2 + factor * (MAX_SPEED - 2))
      } else if (lastX > rightEdge - SCROLL_ZONE && strip.scrollLeft < strip.scrollWidth - strip.clientWidth - 1) {
        const factor = Math.max(0, Math.min(1, (lastX - (rightEdge - SCROLL_ZONE)) / SCROLL_ZONE))
        delta = Math.round(2 + factor * (MAX_SPEED - 2))
      }

      if (delta !== 0) {
        strip.scrollLeft += delta
        const target = hit(lastX, lastY, key)
        document.body.style.cursor = target ? "grabbing" : ""
        setState({ key, title, x: lastX, y: lastY, target })
        scrollRaf = requestAnimationFrame(stepAutoScroll)
      } else {
        scrollRaf = undefined
      }
    }

    const move = (moved: PointerEvent) => {
      if (!drag.active && Math.hypot(moved.clientX - origin.x, moved.clientY - origin.y) < 4) return

      if (!drag.active) {
        drag.active = true
        document.body.style.userSelect = "none"
      }

      lastX = moved.clientX
      lastY = moved.clientY
      const target = hit(moved.clientX, moved.clientY, key)
      // Away from any drop target the release cancels, so the cursor stays normal.
      document.body.style.cursor = target ? "grabbing" : ""
      setState({ key, title, x: moved.clientX, y: moved.clientY, target })

      if (scrollRaf === undefined) {
        scrollRaf = requestAnimationFrame(stepAutoScroll)
      }
    }

    const finish = (commit: boolean) => {
      stopAutoScroll()
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
      window.removeEventListener("keydown", escape, true)

      if (!drag.active) return
      const target = state.target
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
      setState({ key: undefined, target: undefined })
      // The release over the strip would click whatever tab is under it.
      window.addEventListener("click", swallow, true)
      setTimeout(() => window.removeEventListener("click", swallow, true))

      if (commit && target) input.drop(key, target)
    }

    const up = () => finish(true)
    const cancel = () => finish(false)

    const escape = (keyboard: KeyboardEvent) => {
      if (keyboard.key !== "Escape") return
      keyboard.preventDefault()
      keyboard.stopPropagation()
      finish(false)
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    window.addEventListener("keydown", escape, true)
  }

  return {
    /** The dragged tab's key while a drag runs. */
    dragging: () => state.key,
    start,
    Layer: () => (
      <Show when={state.key}>
        <Portal>
          <div class="fixed inset-0 z-[100] pointer-events-none" data-component="pane-drag-layer">
            <Show when={state.target}>
              {(target) => (
                <div
                  data-slot={target().strip ? "pane-drop-indicator" : "pane-drop-zone"}
                  data-pane={target().pane}
                  data-split={target().split}
                  class="absolute"
                  classList={{
                    "bg-v2-icon-icon-accent rounded-full": target().strip,
                    "rounded-[10px] border border-v2-icon-icon-accent bg-[color-mix(in_srgb,var(--v2-icon-icon-accent)_12%,transparent)]":
                      !target().strip,
                  }}
                  style={{
                    left: `${target().rect.left}px`,
                    top: `${target().rect.top}px`,
                    width: `${target().rect.width}px`,
                    height: `${target().rect.height}px`,
                  }}
                />
              )}
            </Show>
            <div
              class="absolute max-w-60 h-7 px-2.5 flex items-center rounded-md bg-v2-background-bg-base text-13-regular text-v2-text-text-base truncate shadow-[var(--v2-elevation-raised)] opacity-90"
              style={{ left: `${state.x + 12}px`, top: `${state.y + 12}px` }}
            >
              {state.title}
            </div>
          </div>
        </Portal>
      </Show>
    ),
  }
}

export type PaneDrag = ReturnType<typeof createPaneDrag>

function paneOf(value: string | undefined): SessionPane | undefined {
  return value ? (value as SessionPane) : undefined
}

/** The element's on-screen rect: its bounding rect clipped by every ancestor that clips overflow. */
function visibleRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  const bounds = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }

  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent)

    if (style.overflowX === "visible" && style.overflowY === "visible") continue
    const clip = parent.getBoundingClientRect()
    bounds.left = Math.max(bounds.left, clip.left)
    bounds.top = Math.max(bounds.top, clip.top)
    bounds.right = Math.min(bounds.right, clip.right)
    bounds.bottom = Math.min(bounds.bottom, clip.bottom)
  }

  return new DOMRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top)
}

function toRect(rect: DOMRect): Rect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}
