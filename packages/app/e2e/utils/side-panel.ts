import type { Locator, Page } from "@playwright/test"
import { base64Encode } from "@opencode/util/encode"

/** Opens the side panel's "Open file" launcher tab from the new tab view the strip's + opens. */
export async function openFileLauncher(panel: Locator) {
  await panel.getByRole("button", { name: "Add tab", exact: true }).click()
  await panel.getByRole("button", { name: /^Open file/ }).click()
}

/** Opens the file browser with its shortcut: it reuses the selected launcher, else opens another. */
export async function browseFiles(page: Page) {
  await page.keyboard.press("Control+Alt+P")
}

/** Opens the Review tab from the launcher an empty side panel lists. */
export async function openReviewLauncher(panel: Locator) {
  await panel.getByRole("button", { name: /^Review/ }).click()
}

export type PaneTreeSeed =
  | { type: "leaf"; id: string }
  | { type: "split"; id: string; direction: "row" | "column"; ratio: number; children: [PaneTreeSeed, PaneTreeSeed] }

export const leaf = (id: string): PaneTreeSeed => ({ type: "leaf", id })

export const split = (
  id: string,
  direction: "row" | "column",
  ratio: number,
  first: PaneTreeSeed,
  second: PaneTreeSeed,
): PaneTreeSeed => ({ type: "split", id, direction, ratio, children: [first, second] })

/** Storage that restores a session's side strip with its tabs placed in panes of a stored pane tree. */
export function paneTabs(
  directory: string,
  session: string,
  strip: {
    all: string[]
    active?: string
    panes?: Record<string, string>
    selected?: Record<string, string>
    layout?: PaneTreeSeed
    serial?: number
  },
) {
  return {
    "opencode.global.dat:layout": {
      sessionTabs: { [`local\u0000${base64Encode(directory)}/${session}`]: strip },
    },
  }
}

/** The stored strip of a session, as the app persisted it. */
export async function storedStrip(page: Page, directory: string, session: string) {
  return page.evaluate(
    ({ key }) => {
      const raw = localStorage.getItem("opencode.global.dat:layout")
      const layout = raw ? JSON.parse(raw) : undefined

      return layout?.sessionTabs?.[key] as
        | { all: string[]; active?: string; panes?: Record<string, string>; layout?: unknown; serial?: number }
        | undefined
    },
    { key: `local\u0000${base64Encode(directory)}/${session}` },
  )
}

/** Drags a tab with the mouse onto a point of `target`, given as fractions of its box, and releases there. */
export async function dragTab(page: Page, tab: Locator, target: Locator, at: { x: number; y: number }) {
  const from = await tab.boundingBox()
  const to = await target.boundingBox()

  if (!from || !to) throw new Error("Drag source or target is not visible")
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 4 })
  await page.mouse.move(to.x + to.width * at.x, to.y + to.height * at.y, { steps: 12 })
}

/** Releases a drag `dragTab` started. */
export async function dropTab(page: Page) {
  await page.mouse.up()
}

/** Storage that restores the Review tab, selected, in each session's side strip, as the app writes it. */
export function reviewTabs(directory: string, ...sessions: string[]) {
  return {
    "opencode.global.dat:layout": {
      sessionTabs: Object.fromEntries(
        sessions.map((id) => [
          `local\u0000${base64Encode(directory)}/${id}`,
          { all: ["review:changes"], active: "review:changes" },
        ]),
      ),
    },
  }
}
