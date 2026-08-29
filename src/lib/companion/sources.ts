/*
 * The AIs Sidq reads, named once.
 *
 * This list existed three times: a ten-row array on the Sources panel, a
 * four-entry lookup a few hundred lines below it that the handover list used,
 * and nothing at all in the picker. So a Perplexity conversation was "Perplexity"
 * on one screen and the raw id `perplexity` on another, and adding a source
 * meant remembering all three.
 *
 * The ids are what the readers write into the index. Changing one is a data
 * migration, not a rename.
 */

export interface Source {
  id: string;
  label: string;
  /**
   * Whether it writes conversations to this Mac on its own.
   *
   * Local ones are read with nothing to set up. The rest run in a browser and
   * keep nothing readable here, so they arrive through the extension or an
   * export — which is the difference the Sources panel has to explain.
   */
  local: boolean;
}

export const SOURCES: readonly Source[] = [
  { id: 'claude-code', label: 'Claude Code', local: true },
  { id: 'cowork', label: 'Claude Cowork', local: true },
  { id: 'cursor', label: 'Cursor, Windsurf, VS Code', local: true },
  { id: 'chatgpt', label: 'ChatGPT', local: false },
  { id: 'claude.ai', label: 'Claude.ai', local: false },
  { id: 'gemini', label: 'Gemini', local: false },
  { id: 'grok', label: 'Grok', local: false },
  { id: 'deepseek', label: 'DeepSeek', local: false },
];

/**
 * Short enough to sit in a 560 point picker.
 *
 * `Cursor, Windsurf, VS Code` is honest on a settings panel with room to
 * explain and far too long for a filter chip. The short form used to be
 * `Editors`, which was tidy and cost us a user: someone looked down the picker
 * for Cursor, found a category name instead of the product they use, and told
 * us to our face that Sidq had dropped Cursor support. Name the chip after the
 * thing people go looking for. Windsurf and VS Code sessions still land here,
 * and the Sources panel still spells all three out.
 */
const SHORT: Record<string, string> = {
  cursor: 'Cursor',
  'claude.ai': 'Claude',
};

/**
 * The name to show for a source id.
 *
 * Falls back to the id itself. An unknown source is a reader that shipped ahead
 * of this list, and showing `windsurf` is worse than showing `Windsurf` but far
 * better than showing nothing where a name should be.
 */
export function sourceLabel(id: string, short = false): string {
  if (short && SHORT[id]) return SHORT[id];
  return SOURCES.find((s) => s.id === id)?.label ?? id;
}
