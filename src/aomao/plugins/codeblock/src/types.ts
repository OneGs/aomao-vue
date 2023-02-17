import {
  CardToolbarItemOptions,
  EditorInterface,
  PluginOptions,
  ToolbarItemOptions,
} from "@/aomao/engine/src";

export interface CodeBlockOptions extends PluginOptions {
  hotkey?: string | Array<string>;
  markdown?: boolean;
  alias?: Record<string, string>;
  styleMap?: Record<string, string>;
  cardToolbars?: (
    items: (ToolbarItemOptions | CardToolbarItemOptions)[],
    editor: EditorInterface
  ) => (ToolbarItemOptions | CardToolbarItemOptions)[];
}
