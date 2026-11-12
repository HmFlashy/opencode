import { expect, test, type Locator, type Page } from "@playwright/test"
import { fileDiff, openSession } from "../utils/workspace"
import { dragTab, dropTab, leaf, openReviewLauncher, paneTabs, split, storedStrip, type PaneTreeSeed } from "../utils/side-panel"
import { base64Encode } from "@opencode/util/encode"

test("review content stays aligned with the side region in both directions", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })

  // A large nested branch diff; its first file is the sentinel that proves the virtualized tree stays mounted.
  const diffs = [
    fileDiff(".github/actions/setup-bun/action.yml", { additions: 7 }),
    ...Array.from({ length: 2_739 }, (_, index) =>
      fileDiff(
        `src/branch/d${String(Math.floor(index / 100)).padStart(5, "0")}/generated-${String(index).padStart(4, "0")}.ts`,
        { additions: 100, loaded: false },
      ),
    ),
  ]

  await openSession(page, { name: "SideStack", vcsDiff: diffs })
  const toggle = page.getByRole("button", { name: "Toggle review" })
  await toggle.click()
  await openReviewLauncher(page.locator("#review-panel"))
  await expectTreeSentinel(page)

  for (const direction of ["ltr", "rtl"] as const) {
    await page.evaluate((direction) => (document.documentElement.dir = direction), direction)
    await expect.poll(() => sideContentOffset(page, direction)).toBeLessThanOrEqual(1)
  }

  await page.reload()
  await expect(page.locator("#review-panel")).toBeVisible()
  await expectTreeSentinel(page)
})

test("new tab selection and closing stay in the focused pane", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const directory = "C:/OpenCode/PaneNewTabs"
  const key = `local\u0000${base64Encode(directory)}/ses_panenewtabs`

  await openSession(page, {
    name: "PaneNewTabs",
    fileList: () => [],
    fileContent: (path) => ({ type: "text", content: `contents:${path}` }),
    seed: {
      panes: { ses_panenewtabs: { review: true } },
      storage: {
        "opencode.global.dat:layout": {
          sessionTabs: {
            [key]: {
              all: ["file://README.md", "file://notes.md"],
              active: "file://README.md",
              panes: { "file://notes.md": "split" },
              selected: { side: "file://README.md", split: "file://notes.md" },
            },
          },
        },
      },
    },
  })

  const side = page.locator('[data-pane-content="side"]')
  const split = page.locator('[data-pane-content="split"]')
  const mod = (await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform))) ? "Meta" : "Control"
  const sideTabs = side.getByRole("tab", { name: "New tab", exact: true })
  const splitTabs = split.getByRole("tab", { name: "New tab", exact: true })
  await expect(side.getByRole("tab", { name: "README.md", exact: true })).toHaveAttribute("aria-selected", "true")
  await expect(split.getByRole("tab", { name: "notes.md", exact: true })).toHaveAttribute("aria-selected", "true")

  await side.getByRole("button", { name: "Add tab", exact: true }).click()
  await expect(sideTabs).toHaveCount(1)
  await side.getByRole("button", { name: "Add tab", exact: true }).click()
  await expect(sideTabs).toHaveCount(2)
  // Pick the older New tab, so a fallback to the newest one cannot pass unnoticed.
  await sideTabs.nth(0).click()
  await expect(sideTabs.nth(0)).toHaveAttribute("aria-selected", "true")

  await split.getByRole("button", { name: "Add tab", exact: true }).click()
  await expect(splitTabs).toHaveAttribute("aria-selected", "true")
  await expect(sideTabs.nth(0)).toHaveAttribute("aria-selected", "true")
  await expect(sideTabs.nth(1)).toHaveAttribute("aria-selected", "false")

  await splitTabs.click()
  await splitTabs.press(`${mod}+w`)
  await expect(splitTabs).toHaveCount(0)
  await expect(split.getByRole("tab", { name: "notes.md", exact: true })).toHaveAttribute("aria-selected", "true")
  await expect(sideTabs).toHaveCount(2)
  await expect(sideTabs.nth(0)).toHaveAttribute("aria-selected", "true")

  // With focus on the region itself, close falls back to the active pane, not another pane's New tab.
  await split.getByRole("tab", { name: "notes.md", exact: true }).click()
  await page.locator("#review-panel").focus()
  await page.keyboard.press(`${mod}+w`)
  await expect(split).toHaveCount(0)
  await expect(sideTabs).toHaveCount(2)
  await expect(sideTabs.nth(0)).toHaveAttribute("aria-selected", "true")
})

test("closing the last New tab closes the side region, and only a New tab lists the launchers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openSession(page, { name: "LastNewTab", seed: { panes: { ses_lastnewtab: { review: true } } } })

  const panel = page.locator("#review-panel")
  const toggle = page.getByRole("button", { name: "Toggle review", exact: true })
  const newTab = panel.getByRole("tab", { name: "New tab", exact: true })
  const review = panel.getByRole("button", { name: /^Review/ })

  // An empty side region opens on a New tab listing the launchers.
  await expect(newTab).toHaveAttribute("aria-selected", "true")
  await expect(review).toBeVisible()

  // Closing it leaves no tab, so the region closes rather than listing the launchers without one.
  await newTab.locator("..").getByRole("button", { name: "Close tab" }).click()
  await expect(toggle).toHaveAttribute("aria-expanded", "false")

  await toggle.click()
  await expect(newTab).toHaveAttribute("aria-selected", "true")
  await expect(review).toBeVisible()
})

test("tabs in a narrow side strip shrink to keep their close buttons, and a tab's menu closes the others", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 700 })
  const directory = "C:/OpenCode/NarrowStrip"
  const key = `local\u0000${base64Encode(directory)}/ses_narrowstrip`
  const files = ["a.md", "a-file-name-long-enough-to-overflow-the-side-strip-by-itself.md", "b.md"]

  await openSession(page, {
    name: "NarrowStrip",
    fileList: () => [],
    fileContent: (path) => ({ type: "text", content: `contents:${path}` }),
    seed: {
      panes: { ses_narrowstrip: { review: true, sessionWidth: 640 } },
      storage: {
        "opencode.global.dat:layout": {
          sessionTabs: { [key]: { all: files.map((file) => `file://${file}`), active: `file://${files[1]}` } },
        },
      },
    },
  })

  const side = page.locator('[data-pane-content="side"]')
  const add = side.getByRole("button", { name: "Add tab", exact: true })
  await expect(side.getByRole("tab", { name: files[1], exact: true })).toHaveAttribute("aria-selected", "true")

  // Every tab's close button stays left of "+", instead of the strip scrolling it away under its edge fade.
  const end = (await add.boundingBox())!.x
  const closes = side.locator('[data-pane-strip="side"] [data-slot="tabs-trigger-close-button"]')
  await expect(closes).toHaveCount(files.length)

  for (const close of await closes.all()) {
    const box = (await close.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(end)
  }

  await side.getByRole("tab", { name: "b.md", exact: true }).click({ button: "right" })
  await page.getByRole("menuitem", { name: "Close other tabs", exact: true }).click()
  await expect(side.getByRole("tab")).toHaveCount(1)
  await expect(side.getByRole("tab", { name: "b.md", exact: true })).toHaveAttribute("aria-selected", "true")

  // With nothing else to close, the menu offers only the tab itself.
  await side.getByRole("tab", { name: "b.md", exact: true }).click({ button: "right" })
  await expect(page.getByRole("menuitem", { name: "Close other tabs", exact: true })).toBeDisabled()
  await page.getByRole("menuitem", { name: "Close tab", exact: true }).click()
  await expect(side.getByRole("tab", { name: "b.md", exact: true })).toHaveCount(0)
})

async function expectTreeSentinel(page: Page) {
  const tree = page.locator('#review-panel [data-component="file-tree-v2"]')
  await expect(tree.getByRole("treeitem", { name: "action.yml" })).toBeVisible()
  const rows = await tree.locator('[data-type="item"]').count()
  expect(rows).toBeGreaterThan(0)
  expect(rows).toBeLessThanOrEqual(60)
}

function sideContentOffset(page: Page, direction: "ltr" | "rtl") {
  return page.evaluate((direction) => {
    const frame = document.querySelector('[data-slot="session-side-panel-presence"]')!.getBoundingClientRect()
    const content = document.querySelector('[data-slot="session-side-panel-content"]')!.getBoundingClientRect()

    return direction === "rtl" ? Math.abs(frame.right - content.right) : Math.abs(frame.left - content.left)
  }, direction)
}

test("the new tab view lists recently closed tabs, expands to the rest, and keeps them across a reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const directory = "C:/OpenCode/RecentlyClosed"
  const key = `local\u0000${base64Encode(directory)}/ses_recentlyclosed`

  // Twelve files closed earlier, newest first, as the app stores them beside the strip.
  const closed = Array.from({ length: 12 }, (_, index) => ({
    key: `file://src/closed-${String(index).padStart(2, "0")}.ts`,
    title: `closed-${String(index).padStart(2, "0")}.ts`,
    file: `src/closed-${String(index).padStart(2, "0")}.ts`,
    closed: 1_000 - index,
  }))

  await openSession(page, {
    name: "RecentlyClosed",
    fileContent: (path) => ({ type: "text", content: `contents:${path}` }),
    seed: {
      panes: { ses_recentlyclosed: { review: true } },
      storage: {
        "opencode.global.dat:layout": {
          sessionTabs: { [key]: { all: ["file://README.md"], active: "file://README.md" } },
          sessionView: { [key]: { scroll: {}, closed } },
        },
      },
    },
  })

  const panel = page.locator("#review-panel")
  const recent = panel.getByRole("region", { name: "Recently closed", exact: true })
  const rows = recent.locator('[data-slot="side-recently-closed-row"]')
  const toggle = page.getByRole("button", { name: "Toggle review", exact: true })

  // The latest five, then all of them once expanded.
  await panel.getByRole("button", { name: "Add tab", exact: true }).click()
  await expect(rows).toHaveCount(5)
  await expect(rows.first()).toContainText("closed-00.ts")
  const more = recent.getByRole("button", { name: "Show more", exact: true })
  await more.focus()
  await more.press("Enter")
  await expect(rows).toHaveCount(12)
  await expect(rows.filter({ hasText: "closed-05.ts" })).toBeFocused()
  await expect(recent.getByRole("button", { name: "Show more", exact: true })).toHaveCount(0)
  await expect(recent.getByRole("button", { name: "Show less", exact: true })).toHaveCount(0)

  // Closing the last tab closes the region; it opens on its launchers with that tab listed first.
  const readme = panel.getByRole("tab", { name: "README.md" })
  await readme.click()
  await readme.locator("..").getByRole("button", { name: "Close tab" }).click()
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await toggle.click()
  await expect(panel.getByRole("tab", { name: "New tab", exact: true })).toHaveAttribute("aria-selected", "true")
  await expect(rows.first()).toContainText("README.md")

  // The list survives a reload, and reopening a row brings its tab back and takes it off the list.
  await page.reload()
  await expect(rows.first()).toContainText("README.md")
  await rows.first().click()
  await expect(panel.getByRole("tab", { name: "README.md" })).toHaveAttribute("aria-selected", "true")
  await panel.getByRole("button", { name: "Add tab", exact: true }).click()
  await expect(rows.first()).toContainText("closed-00.ts")
  await expect(recent).not.toContainText("README.md")
})


type Strip = {
  all: string[]
  active?: string
  panes?: Record<string, string>
  selected?: Record<string, string>
  layout?: PaneTreeSeed
  serial?: number
}

async function openPanes(page: Page, name: string, strip: Strip) {
  await page.setViewportSize({ width: 1600, height: 900 })
  const directory = `C:/OpenCode/${name}`
  const session = `ses_${name.toLowerCase()}`

  await openSession(page, {
    name,
    fileList: () => [],
    fileContent: (path) => ({ type: "text", content: `contents:${path}` }),
    seed: { panes: { [session]: { review: true } }, storage: paneTabs(directory, session, strip) },
  })

  return { directory, session }
}

const paneBox = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error("Pane is not visible")

  return box
}

const pane = (page: Page, id: string) => page.locator(`[data-pane-content="${id}"]`)

const tabIn = (page: Page, id: string, name: string) => pane(page, id).getByRole("tab", { name, exact: true })

test("a stored row split shows two panes side by side at its ratio", async ({ page }) => {
  await openPanes(page, "PaneRow", {
    all: ["file://a.md", "file://b.md"],
    active: "file://a.md",
    panes: { "file://b.md": "p1" },
    selected: { side: "file://a.md", p1: "file://b.md" },
    layout: split("split:p1", "row", 0.3, leaf("side"), leaf("p1")),
    serial: 1,
  })

  await expect(tabIn(page, "side", "a.md")).toHaveAttribute("aria-selected", "true")
  await expect(tabIn(page, "p1", "b.md")).toHaveAttribute("aria-selected", "true")

  await expect
    .poll(async () => {
      const side = await paneBox(pane(page, "side"))
      const right = await paneBox(pane(page, "p1"))

      return {
        beside: right.x >= side.x + side.width - 1,
        aligned: Math.abs(right.y - side.y) <= 1 && Math.abs(right.height - side.height) <= 1,
        share: Math.round((side.width / (side.width + right.width)) * 10) / 10,
      }
    })
    .toEqual({ beside: true, aligned: true, share: 0.3 })
})

test("a legacy side and split strip still stacks the split pane below the side pane", async ({ page }) => {
  await openPanes(page, "PaneLegacy", {
    all: ["file://a.md", "file://b.md"],
    active: "file://a.md",
    panes: { "file://b.md": "split" },
    selected: { side: "file://a.md", split: "file://b.md" },
  })

  await expect(tabIn(page, "split", "b.md")).toBeVisible()

  await expect
    .poll(async () => {
      const top = await paneBox(pane(page, "side"))
      const bottom = await paneBox(pane(page, "split"))

      return { below: bottom.y >= top.y + top.height - 1, sameWidth: Math.abs(top.width - bottom.width) <= 1 }
    })
    .toEqual({ below: true, sameWidth: true })
})

test("nested splits give each pane its own cell", async ({ page }) => {
  await openPanes(page, "PaneNested", {
    all: ["file://a.md", "file://b.md", "file://c.md"],
    active: "file://a.md",
    panes: { "file://b.md": "p1", "file://c.md": "p2" },
    selected: { side: "file://a.md", p1: "file://b.md", p2: "file://c.md" },
    layout: split("split:p1", "row", 0.5, leaf("side"), split("split:p2", "column", 0.5, leaf("p1"), leaf("p2"))),
    serial: 2,
  })

  await expect(tabIn(page, "p2", "c.md")).toBeVisible()

  await expect
    .poll(async () => {
      const side = await paneBox(pane(page, "side"))
      const top = await paneBox(pane(page, "p1"))
      const bottom = await paneBox(pane(page, "p2"))

      return {
        rightOfSide: top.x >= side.x + side.width - 1 && bottom.x >= side.x + side.width - 1,
        stacked: bottom.y >= top.y + top.height - 1,
        sameColumn: Math.abs(top.x - bottom.x) <= 1 && Math.abs(top.width - bottom.width) <= 1,
        fullHeight: Math.abs(top.height + bottom.height - side.height) <= 2,
      }
    })
    .toEqual({ rightOfSide: true, stacked: true, sameColumn: true, fullHeight: true })
})

test("dragging a split's divider resizes its panes and the ratio survives a reload", async ({ page }) => {
  const { directory, session } = await openPanes(page, "PaneResize", {
    all: ["file://a.md", "file://b.md"],
    active: "file://a.md",
    panes: { "file://b.md": "p1" },
    selected: { side: "file://a.md", p1: "file://b.md" },
    layout: split("split:p1", "row", 0.5, leaf("side"), leaf("p1")),
    serial: 1,
  })

  const handle = page.locator('#review-panel [data-slot="pane-divider"] [data-component="resize-handle"]')
  await expect(handle).toHaveCount(1)
  const before = await paneBox(pane(page, "side"))
  const grip = await paneBox(handle)

  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2 + 120, grip.y + grip.height / 2, { steps: 8 })
  await page.mouse.up()

  await expect.poll(async () => Math.round((await paneBox(pane(page, "side"))).width - before.width)).toBeGreaterThan(100)
  const resized = await paneBox(pane(page, "side"))
  const stored = await storedStrip(page, directory, session)
  expect((stored?.layout as { ratio?: number } | undefined)?.ratio).toBeGreaterThan(0.5)

  await page.reload()
  await expect(tabIn(page, "p1", "b.md")).toBeVisible()
  await expect.poll(async () => Math.abs((await paneBox(pane(page, "side"))).width - resized.width)).toBeLessThanOrEqual(2)
})

test("a divider stops at the minimum pane size", async ({ page }) => {
  await openPanes(page, "PaneMinimum", {
    all: ["file://a.md", "file://b.md"],
    active: "file://a.md",
    panes: { "file://b.md": "p1" },
    selected: { side: "file://a.md", p1: "file://b.md" },
    layout: split("split:p1", "row", 0.5, leaf("side"), leaf("p1")),
    serial: 1,
  })

  const handle = page.locator('#review-panel [data-slot="pane-divider"] [data-component="resize-handle"]')
  const grip = await paneBox(handle)

  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x - 2_000, grip.y + grip.height / 2, { steps: 10 })
  await page.mouse.up()

  await expect.poll(async () => (await paneBox(pane(page, "side"))).width).toBeGreaterThanOrEqual(199)
  expect((await paneBox(pane(page, "side"))).width).toBeLessThan(260)
})

test("dragging a tab onto a pane's right edge splits it into a new pane beside it", async ({ page }) => {
  const { directory, session } = await openPanes(page, "PaneDragRight", {
    all: ["file://a.md", "file://b.md"],
    active: "file://a.md",
    selected: { side: "file://a.md" },
  })

  await expect(tabIn(page, "side", "b.md")).toBeVisible()
  await dragTab(page, tabIn(page, "side", "b.md"), pane(page, "side"), { x: 0.92, y: 0.5 })

  const zone = page.locator('[data-slot="pane-drop-zone"]')
  await expect(zone).toHaveAttribute("data-split", "row")
  const side = await paneBox(pane(page, "side"))
  const preview = await paneBox(zone)
  expect(preview.x).toBeGreaterThanOrEqual(side.x + side.width / 2 - 2)
  expect(Math.abs(preview.width - side.width / 2)).toBeLessThanOrEqual(2)

  await dropTab(page)
  await expect(zone).toHaveCount(0)
  await expect(tabIn(page, "p1", "b.md")).toHaveAttribute("aria-selected", "true")
  await expect(tabIn(page, "side", "a.md")).toBeVisible()
  await expect(tabIn(page, "side", "b.md")).toHaveCount(0)

  const left = await paneBox(pane(page, "side"))
  const right = await paneBox(pane(page, "p1"))
  expect(right.x).toBeGreaterThanOrEqual(left.x + left.width - 1)

  const stored = await storedStrip(page, directory, session)
  expect(stored?.panes).toEqual({ "file://b.md": "p1" })
  expect(stored?.serial).toBe(1)

  await page.reload()
  await expect(tabIn(page, "p1", "b.md")).toBeVisible()
  await expect(tabIn(page, "side", "a.md")).toBeVisible()
})

test("dragging a tab onto the left edge puts the new pane before the pane it splits", async ({ page }) => {
  await openPanes(page, "PaneDragLeft", {
    all: ["file://a.md", "file://b.md"],
    active: "file://a.md",
    selected: { side: "file://a.md" },
  })

  await dragTab(page, tabIn(page, "side", "b.md"), pane(page, "side"), { x: 0.08, y: 0.5 })
  await expect(page.locator('[data-slot="pane-drop-zone"]')).toHaveAttribute("data-split", "row")
  await dropTab(page)

  await expect(tabIn(page, "p1", "b.md")).toBeVisible()
  await expect.poll(async () => (await paneBox(pane(page, "p1"))).x).toBeLessThan((await paneBox(pane(page, "side"))).x)
})

test("dragging a tab onto the bottom edge stacks a new pane below, and the top edge above", async ({ page }) => {
  await openPanes(page, "PaneDragColumn", {
    all: ["file://a.md", "file://b.md", "file://c.md"],
    active: "file://a.md",
    selected: { side: "file://a.md" },
  })

  await dragTab(page, tabIn(page, "side", "b.md"), pane(page, "side"), { x: 0.5, y: 0.92 })
  await expect(page.locator('[data-slot="pane-drop-zone"]')).toHaveAttribute("data-split", "column")
  await dropTab(page)
  await expect(tabIn(page, "p1", "b.md")).toBeVisible()
  await expect.poll(async () => (await paneBox(pane(page, "p1"))).y).toBeGreaterThan((await paneBox(pane(page, "side"))).y)

  await dragTab(page, tabIn(page, "side", "c.md"), pane(page, "side"), { x: 0.5, y: 0.2 })
  await expect(page.locator('[data-slot="pane-drop-zone"]')).toHaveAttribute("data-split", "column")
  await dropTab(page)
  await expect(tabIn(page, "p2", "c.md")).toBeVisible()
  await expect.poll(async () => (await paneBox(pane(page, "p2"))).y).toBeLessThan((await paneBox(pane(page, "side"))).y)
})

test("dropping on a pane's centre moves the tab there and the emptied pane gives its room back", async ({ page }) => {
  const { directory, session } = await openPanes(page, "PaneMerge", {
    all: ["file://a.md", "file://b.md"],
    active: "file://a.md",
    panes: { "file://b.md": "p1" },
    selected: { side: "file://a.md", p1: "file://b.md" },
    layout: split("split:p1", "row", 0.5, leaf("side"), leaf("p1")),
    serial: 1,
  })

  await dragTab(page, tabIn(page, "p1", "b.md"), pane(page, "side"), { x: 0.5, y: 0.55 })
  const zone = page.locator('[data-slot="pane-drop-zone"]')
  await expect(zone).not.toHaveAttribute("data-split", /.+/)
  await dropTab(page)

  await expect(pane(page, "p1")).toHaveCount(0)
  await expect(tabIn(page, "side", "b.md")).toHaveAttribute("aria-selected", "true")
  await expect(tabIn(page, "side", "a.md")).toBeVisible()

  const panel = await paneBox(page.locator("#review-panel"))
  const side = await paneBox(pane(page, "side"))
  expect(Math.abs(side.width - panel.width)).toBeLessThanOrEqual(2)

  const stored = await storedStrip(page, directory, session)
  expect(stored?.panes ?? {}).toEqual({})
})

test("closing the last tab of a pane removes it and the sibling takes the whole region", async ({ page }) => {
  await openPanes(page, "PaneClose", {
    all: ["file://a.md", "file://b.md"],
    active: "file://a.md",
    panes: { "file://b.md": "p1" },
    selected: { side: "file://a.md", p1: "file://b.md" },
    layout: split("split:p1", "row", 0.5, leaf("side"), leaf("p1")),
    serial: 1,
  })

  await tabIn(page, "p1", "b.md").locator("..").getByRole("button", { name: "Close tab" }).click()
  await expect(pane(page, "p1")).toHaveCount(0)

  const panel = await paneBox(page.locator("#review-panel"))
  const side = await paneBox(pane(page, "side"))
  expect(Math.abs(side.width - panel.width)).toBeLessThanOrEqual(2)
  await expect(tabIn(page, "side", "a.md")).toHaveAttribute("aria-selected", "true")
})

test("pressing Escape during a drag cancels it and leaves the layout alone", async ({ page }) => {
  const { directory, session } = await openPanes(page, "PaneCancel", {
    all: ["file://a.md", "file://b.md"],
    active: "file://a.md",
    selected: { side: "file://a.md" },
  })

  await dragTab(page, tabIn(page, "side", "b.md"), pane(page, "side"), { x: 0.92, y: 0.5 })
  await expect(page.locator('[data-slot="pane-drop-zone"]')).toHaveCount(1)
  await page.keyboard.press("Escape")
  await expect(page.locator('[data-slot="pane-drop-zone"]')).toHaveCount(0)
  await dropTab(page)

  await expect(pane(page, "p1")).toHaveCount(0)
  await expect(tabIn(page, "side", "b.md")).toBeVisible()
  expect((await storedStrip(page, directory, session))?.layout).toBeUndefined()
})

test("a pane with no stored tab is not drawn, and a stored layout naming an unknown pane does not break the region", async ({ page }) => {
  await openPanes(page, "PaneStale", {
    all: ["file://a.md"],
    active: "file://a.md",
    selected: { side: "file://a.md" },
    layout: split("split:p9", "row", 0.5, leaf("side"), leaf("p9")),
    serial: 9,
  })

  await expect(tabIn(page, "side", "a.md")).toHaveAttribute("aria-selected", "true")
  await expect(pane(page, "p9")).toHaveCount(0)
  const panel = await paneBox(page.locator("#review-panel"))
  const side = await paneBox(pane(page, "side"))
  expect(Math.abs(side.width - panel.width)).toBeLessThanOrEqual(2)
})

test("a tab dragged between two existing panes lands before the tab it is dropped on", async ({ page }) => {
  await openPanes(page, "PaneReorder", {
    all: ["file://a.md", "file://b.md", "file://c.md"],
    active: "file://a.md",
    panes: { "file://c.md": "p1" },
    selected: { side: "file://a.md", p1: "file://c.md" },
    layout: split("split:p1", "row", 0.5, leaf("side"), leaf("p1")),
    serial: 1,
  })

  await dragTab(page, tabIn(page, "side", "b.md"), tabIn(page, "p1", "c.md"), { x: 0.2, y: 0.5 })
  await expect(page.locator('[data-slot="pane-drop-indicator"]')).toBeVisible()
  await dropTab(page)

  await expect(tabIn(page, "p1", "b.md")).toHaveAttribute("aria-selected", "true")
  await expect(pane(page, "p1").getByRole("tab")).toHaveText(["b.md", "c.md"])
  await expect(pane(page, "side").getByRole("tab")).toHaveText(["a.md"])
})
