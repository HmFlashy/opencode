import { describe, expect, test } from "bun:test"
import type { DesktopTheme } from "./types"
import { resolveThemeVariant } from "./resolve"
import { resolveThemeV2 } from "./v2/resolve"

const theme: DesktopTheme = await Bun.file(new URL("./themes/operon.json", import.meta.url)).json()

describe("Operon theme", () => {
  test("loads valid schema and metadata", () => {
    expect(theme.id).toBe("operon")
    expect(theme.name).toBe("Operon")
  })

  test("resolves v1 tokens in light and dark mode", () => {
    const darkV1 = resolveThemeVariant(theme.dark, true)
    const lightV1 = resolveThemeVariant(theme.light, false)

    expect(darkV1["surface-base"]).toBe("#080a0f")
    expect(darkV1["surface-raised-base"]).toBe("#0d1017")
    expect(darkV1["border-weak-base"]).toBe("#1e2533")

    expect(lightV1["surface-base"]).toBe("#ffffff")
    expect(lightV1["surface-raised-base"]).toBe("#f8fafc")
  })

  test("resolves v2 tokens with obsidian surfaces and electric accents", () => {
    const { dark, light } = resolveThemeV2(theme)

    expect(dark["v2-background-bg-base"]).toBe("#080a0f")
    expect(dark["v2-background-bg-deep"]).toBe("#040508")
    expect(dark["v2-background-bg-layer-01"]).toBe("#0d1017")
    expect(dark["v2-border-border-base"]).toBe("#1e2533")
    expect(dark["v2-text-text-accent"]).toBe("#38bdf8")
    expect(dark["v2-state-fg-success"]).toBe("#10b981")

    expect(light["v2-background-bg-base"]).toBe("#ffffff")
    expect(light["v2-background-bg-deep"]).toBe("#f4f6fa")
    expect(light["v2-text-text-accent"]).toBe("#0284c7")
  })
})
