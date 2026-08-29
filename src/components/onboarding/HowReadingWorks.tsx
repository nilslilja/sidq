/*
 * The one thing about Sidq that surprises people, shown instead of explained.
 *
 * The setup screen for this used to be about two hundred and fifty words: two
 * bordered cards, a three-row list and two closing paragraphs, all of it correct
 * and none of it read. People at a demo said the same thing twice — too
 * technical, and stop telling me what happens, show me — and they were right.
 * Everything here is a fact that prose stated; the prose is now a caption.
 *
 * Two lanes, because the entire confusion is that people assume there is one.
 * The editors on this Mac are already done. The browsers are read while you
 * read them, and the second lane animates the part nobody believes until they
 * see it: the further up you scroll, the further back it reaches.
 *
 * Motion is transform and opacity only, and stops completely under
 * prefers-reduced-motion, where the reach lane simply renders at full extent.
 *
 * It takes a surface because it is used twice: on the dark setup panel, and on
 * the light marketing page, where the same confusion costs a download rather
 * than a support message.
 */
import { cn } from "@/lib/cn";

export type Surface = "dark" | "light";

/** Rows in the conversation mock. The tail is what you get for doing nothing. */
const MESSAGE_ROWS = 7;
/** How many of those are lit before the reach animation runs. */
const ROWS_ALREADY_READ = 2;

/*
 * The two palettes, named once.
 *
 * Threading `surface === "dark" ? … : …` through a dozen className calls is how
 * a component ends up with one of its variants quietly half-styled.
 */
const TONE = {
  dark: {
    card: "border-white/[0.10] bg-white/[0.03]",
    eyebrow: "text-white/40",
    caption: "text-white/55",
    strong: "text-white",
    chip: "border-[#B8A6FF]/30 bg-[#B8A6FF]/[0.10] text-white/80",
    tick: "text-[#B8A6FF]",
    stage: "border-white/[0.08] bg-black/20",
    said: "bg-[#B8A6FF]/45",
    reply: "bg-white/25",
    frame: "border-[#B8A6FF]/55 bg-[#B8A6FF]/[0.07]",
    note: "text-white/45",
  },
  light: {
    card: "border-ink/10 bg-ink/[0.02]",
    eyebrow: "ink-muted",
    caption: "ink-muted",
    strong: "text-ink",
    chip: "border-accent/25 bg-accent/[0.07] text-ink/75",
    tick: "text-accent",
    stage: "border-ink/10 bg-ink/[0.03]",
    said: "bg-accent/50",
    reply: "bg-ink/20",
    frame: "border-accent/50 bg-accent/[0.06]",
    note: "ink-muted",
  },
} as const;

function Lane({
  eyebrow,
  caption,
  surface,
  children,
}: {
  eyebrow: string;
  caption: React.ReactNode;
  surface: Surface;
  children: React.ReactNode;
}) {
  const t = TONE[surface];
  return (
    <div className={cn("rounded-[12px] border p-4", t.card)}>
      <p
        className={cn(
          "text-[0.6875rem] uppercase tracking-[0.18em]",
          t.eyebrow,
        )}
      >
        {eyebrow}
      </p>
      <div className="mt-3">{children}</div>
      <p
        className={cn(
          "mt-3 max-w-[42ch] text-[0.8125rem] leading-relaxed",
          t.caption,
        )}
      >
        {caption}
      </p>
    </div>
  );
}

/** The editors, already on disk. A settled row: no motion, nothing pending. */
function AlreadyHere({ read, surface }: { read: number; surface: Surface }) {
  const t = TONE[surface];
  return (
    <Lane
      surface={surface}
      eyebrow="Already here"
      caption={
        read > 0 ? (
          <>
            Claude Code, Cursor and Cowork keep their conversations on this Mac.
            Sidq has read <span className={t.strong}>all {read}</span> of them
            already.
          </>
        ) : (
          <>
            Claude Code, Cursor and Cowork keep their conversations on this Mac.
            Sidq reads them with nothing to set up, going back long before you
            installed it.
          </>
        )
      }
    >
      <div className="flex items-center gap-2">
        {["Claude Code", "Cursor", "Cowork"].map((label) => (
          <span
            key={label}
            className={cn(
              "rounded-[7px] border px-2 py-1 text-[0.6875rem]",
              t.chip,
            )}
          >
            {label}
          </span>
        ))}
        <span
          aria-hidden="true"
          className={cn("ml-0.5 text-[0.75rem]", t.tick)}
        >
          &#10003;
        </span>
      </div>
    </Lane>
  );
}

/*
 * The browsers, and how far back one read reaches.
 *
 * The frame is what the page has actually loaded. It starts over the tail —
 * which is all a site gives you before you touch anything — and travels up the
 * column, lighting rows as it passes. That is the whole scroll rule, and it is
 * a sentence nobody finishes reading and a picture nobody needs explained.
 */
function AsYouOpenThem({ surface }: { surface: Surface }) {
  const t = TONE[surface];
  return (
    <Lane
      surface={surface}
      eyebrow="As you open them"
      caption={
        <>
          ChatGPT, Gemini, Claude.ai, Grok and DeepSeek keep nothing on your
          Mac, so Sidq reads the one you have open. Scroll up and it reaches
          further back.
        </>
      }
    >
      <div
        className={cn(
          "relative flex h-[96px] items-end overflow-hidden rounded-[9px] border px-3 py-2.5",
          t.stage,
        )}
      >
        {/* The conversation. Oldest at the top, which is where scrolling goes. */}
        <div className="flex flex-1 flex-col-reverse justify-start gap-[4px]">
          {Array.from({ length: MESSAGE_ROWS }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={cn(
                "h-[7px] rounded-full",
                i % 2 ? cn("w-[58%] self-end", t.said) : cn("w-[76%]", t.reply),
                // Rows above the tail brighten in turn as the frame climbs past.
                i >= ROWS_ALREADY_READ && "reach-row",
              )}
              style={
                i >= ROWS_ALREADY_READ
                  ? { animationDelay: `${(i - ROWS_ALREADY_READ) * 260}ms` }
                  : undefined
              }
            />
          ))}
        </div>

        {/* What the page has loaded, climbing. */}
        <span
          aria-hidden="true"
          className={cn(
            "reach-frame pointer-events-none absolute inset-x-[7px] bottom-[8px] h-[26px]",
            "rounded-[6px] border",
            t.frame,
          )}
        />
      </div>
    </Lane>
  );
}

export function HowReadingWorks({
  read,
  surface = "dark",
  className,
}: {
  read: number;
  surface?: Surface;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <AlreadyHere read={read} surface={surface} />
      <AsYouOpenThem surface={surface} />
      <p
        className={cn(
          "max-w-[44ch] text-[0.8125rem] leading-relaxed",
          TONE[surface].note,
        )}
      >
        So the browser chats you had before today are not in Sidq yet. They
        arrive as you go back to them.
      </p>
    </div>
  );
}
