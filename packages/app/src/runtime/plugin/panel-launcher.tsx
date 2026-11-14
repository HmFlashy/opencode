import { For, Show, createMemo, type JSX } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Keybind } from "@opencode/ui/keybind"
import { Menu } from "@opencode/ui/menu"
import { Tooltip } from "@opencode/ui/tooltip"
import type { SessionPanelMenuItem } from "@opencode/plugin/gui"
import { useCommand } from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import { createSessionPanelMenuEntries } from "./panel-menu"

const VISIBLE = 3

/** The first panels as icon buttons in the session header, and the rest behind a menu. */
export function PanelLauncher(props: { compact?: boolean }): JSX.Element {
  const language = useLanguage()
  const command = useCommand()
  const menu = createSessionPanelMenuEntries()
  const shown = createMemo(() => (props.compact ? [] : menu().slice(0, VISIBLE)))
  const rest = createMemo(() => menu().slice(shown().length))

  let chosen: SessionPanelMenuItem | undefined

  return (
    <Show when={menu().length > 0}>
      <div data-slot="session-panel-launcher" class="flex items-center gap-0.5">
        <For each={shown()}>
          {(entry) => (
            <Tooltip
              placement="bottom"
              class="shrink-0"
              value={
                <>
                  {entry.item.title}
                  <Show when={entry.item.keybind}>
                    {(bind) => <Keybind keys={command.keybindParts(bind())} variant="neutral" />}
                  </Show>
                </>
              }
            >
              <IconButton
                type="button"
                variant="ghost-muted"
                size="large"
                class="shrink-0"
                icon={<Icon name={entry.item.icon ?? "plus"} />}
                aria-label={entry.item.title}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => entry.item.run()}
              />
            </Tooltip>
          )}
        </For>
        <Show when={rest().length > 0}>
          <Menu appearance="standard" modal={false} placement="bottom-end" gutter={4}>
            <Tooltip value={language.t("session.panel.launcher.more")} placement="bottom" class="flex items-center">
              <Menu.Trigger
                as={IconButton}
                icon={<Icon name="chevron-down" />}
                variant="ghost-muted"
                size="large"
                aria-label={language.t("session.panel.launcher.more")}
              />
            </Tooltip>
            <Menu.Portal>
              <Menu.Content
                onCloseAutoFocus={() => {
                  const item = chosen

                  if (!item) return
                  chosen = undefined
                  setTimeout(() => item.run())
                }}
              >
                <For each={rest()}>
                  {(entry) => (
                    <Menu.Item class="!gap-6" onSelect={() => (chosen = entry.item)}>
                      <div class="flex items-center gap-2">
                        <Show when={entry.item.icon}>{(icon) => <Icon name={icon()} size="small" />}</Show>
                        <span>{entry.item.title}</span>
                      </div>
                    </Menu.Item>
                  )}
                </For>
              </Menu.Content>
            </Menu.Portal>
          </Menu>
        </Show>
      </div>
    </Show>
  )
}
