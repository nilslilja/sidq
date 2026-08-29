/*
 * The one thing about Sidq that surprises people, shown instead of explained.
 *
 * This screen used to be about two hundred and fifty words: two bordered cards,
 * a three-row list and two closing paragraphs, all of it correct and none of it
 * read. People at a demo said the same thing twice — too technical, and stop
 * telling me what happens, show me — and they were right. Everything here is a
 * fact the old prose stated; the prose is now a caption under a picture of it.
 *
 * Two lanes, because the entire confusion is that people assume there is one.
 * The editors on this Mac are already done. The browsers are read while you
 * read them, and the second lane animates the part nobody believes until they
 * see it: the further up you scroll, the further back it reaches.
 *
 * Motion is transform and opacity only, and stops completely under
 * prefers-reduced-motion, where the scroll lane simply renders at full reach.
 */
import { cn } from "@/lib/cn";

/** Rows in the conversation mock. The tail is what you get for doing nothing. */
const MESSAGE_ROWS = 7;
/** How many of those are lit before the reach animation runs. */
const ROWS_ALREADY_READ = 2;

function Lane({
  eyebrow,
  caption,
  children,
}: {
  eyebrow: string;
  caption: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-white/[0.10] bg-white/[0.03] p-4">
      <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-white/40">
        {eyebrow}
      </p>
      <div className="mt-3">{children}</div>
      <p className="mt-3 max-w-[42ch] text-[0.8125rem] leading-relaxed text-white/55">
        {caption}
      </p>
    </div>
  );
}

/** The editors, already on disk. A settled row: no motion, nothing pending. */
function AlreadyHere({ read }: { read: number }) {
  return (
    <Lane
      eyebrow="Already here"
      caption={
        read > 0 ? (
          <>
            Claude Code, Cursor and Cowork keep their conversations on this Mac.
            Sidq has read <span className="text-white">all {read}</span> of them
            already.
          </>
        ) : (
          <>
            Claude Code, Cursor and Cowork keep their conversations on this Mac.
            Sidq reads them with nothing to set up.
          </>
        )
      }
    >
      <div className="flex items-center gap-2">
        {["Claude Code", "Cursor", "Cowork"].map((label) => (
          <span
            key={label}
            className={cn(
              "rounded-[7px] border border-[#B8A6FF]/30 bg-[#B8A6FF]/[0.10] px-2 py-1",
              "text-[0.6875rem] text-white/80",
            )}
          >
            {label}
          </span>
        ))}
        <span
          aria-hidden="true"
          className="ml-0.5 text-[0.75rem] text-[#B8A6FF]"
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
function AsYouOpenThem() {
  return (
    <Lane
      eyebrow="As you open them"
      caption={
        <>
          ChatGPT, Gemini, Claude.ai, Grok and DeepSeek keep nothing on your
          Mac, so Sidq reads the one you have open. Scroll up and it reaches
          further back.
        </>
      }
    >
      <div className="relative flex h-[96px] items-end overflow-hidden rounded-[9px] border border-white/[0.08] bg-black/20 px-3 py-2.5">
        {/* The conversation. Oldest at the top, which is where scrolling goes. */}
        <div className="flex flex-1 flex-col-reverse justify-start gap-[4px]">
          {Array.from({ length: MESSAGE_ROWS }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={cn(
                "h-[7px] rounded-full",
                i % 2
                  ? "w-[58%] self-end bg-[#B8A6FF]/45"
                  : "w-[76%] bg-white/25",
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
          className="reach-frame pointer-events-none absolute inset-x-[7px] bottom-[8px] h-[26px] rounded-[6px] border border-[#B8A6FF]/55 bg-[#B8A6FF]/[0.07]"
        />
      </div>
    </Lane>
  );
}

export function HowReadingWorks({ read }: { read: number }) {
  return (
    <div className="space-y-3">
      <AlreadyHere read={read} />
      <AsYouOpenThem />
      <p className="max-w-[44ch] text-[0.8125rem] leading-relaxed text-white/45">
        So the browser chats you had before today are not in Sidq yet. They
        arrive as you go back to them.
      </p>
    </div>
  );
}
