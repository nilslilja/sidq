import { useEffect, useState } from "react";
import type { desktopBridge } from "@/lib/onboarding/bridge";
import { Keys, PanelHead, SectionHead } from "./ui";

/*
 * Every key Sidq answers to, in one place.
 *
 * They were taught once, in setup, and never shown again, so anybody who
 * skipped a screen or forgot a gesture had no way back to it. The two that are
 * settings, the picker shortcut and the tap keys, are read from Rust rather
 * than written here, because a hard-coded key starts lying the moment it is
 * changed. The rest are fixed in the code that handles them: the picker's keys
 * in Pill.tsx, and ⌘Z because a brief arrives as a paste the chat can undo.
 */

type Bridge = ReturnType<typeof desktopBridge>;

type Line = { what: string; keys: string; note?: string };

const IN_THE_PICKER: Line[] = [
  { what: "Move between conversations", keys: "↑ ↓" },
  { what: "Save the conversation to Downloads, as a file", keys: "↵" },
  { what: "Copy it instead", keys: "⌘↵" },
  { what: "Open this window", keys: "⌘O" },
  { what: "Move the picker on screen", keys: "⌘ ← → ↑ ↓" },
  { what: "Close it", keys: "esc" },
];

export function Shortcuts({ bridge }: { bridge: Bridge }) {
  const [picker, setPicker] = useState<string | null | undefined>(undefined);
  const [taps, setTaps] = useState<[string, string] | null>(null);

  useEffect(() => {
    if (!bridge) return;
    void bridge.pickerShortcut().then(setPicker, () => setPicker(null));
    void bridge.tapKeys().then(setTaps, () => setTaps(null));
  }, [bridge]);

  const anywhere: Line[] = [
    picker === null
      ? {
          what: "Open the picker",
          keys: "none",
          note: "Another app owns every shortcut Sidq tried. The dot at the top of the screen opens it too.",
        }
      : { what: "Open the picker, from any app", keys: picker ?? "⌘⇧K" },
    ...(taps
      ? [
          { what: "Grab the conversation you are in", keys: `${taps[0]} ×2` },
          { what: "Put the last grab back on the clipboard", keys: `${taps[1]} ×2` },
        ]
      : []),
    { what: "Take a brief or a carried chat back out", keys: "⌘Z", note: "In the chat it landed in." },
  ];

  return (
    <>
      <PanelHead title="Shortcuts" lead="Everything Sidq does from the keyboard." />
      <Group id="anywhere" title="Anywhere" lines={anywhere} />
      <Group id="picker" title="In the picker" lines={IN_THE_PICKER} />
    </>
  );
}

function Group({ id, title, lines }: { id: string; title: string; lines: Line[] }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <SectionHead id={id} title={title} />
      <ul className="mt-4 divide-y divide-[var(--w-line)] border-y border-[var(--w-line)]">
        {lines.map((line) => (
          <li key={line.what} className="flex items-center gap-6 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[0.875rem] text-[var(--w-text)]">{line.what}</span>
              {line.note && (
                <span className="mt-0.5 block text-[0.75rem] text-[var(--w-text-3)]">{line.note}</span>
              )}
            </span>
            <Keys>{line.keys}</Keys>
          </li>
        ))}
      </ul>
    </section>
  );
}
