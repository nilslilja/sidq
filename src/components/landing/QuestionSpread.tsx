import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState } from "react";

/*
 * The questions, as a stack that spreads.
 *
 * Adapted from Hyperiux Vault's StackSpread (vault.hyperiux.com). The film's
 * opening beat is a feed of questions every AI keeps asking you; here they
 * start as one tidy pile and scatter across the screen as you scroll, until
 * the page is covered in them and the line in the middle can say what they
 * are. The pile is the illusion that it is one question. The spread is the
 * truth: it is the same question, asked by every one of them, forever.
 *
 * The mechanism is the original's: a sticky stage inside a tall section, each
 * card interpolating from a fanned cluster to its own spot on scroll progress,
 * and a little pointer parallax once they have landed, deeper cards moving
 * more. Cards are chat bubbles instead of photographs. On touch screens they
 * land in two tidy columns instead of a scatter, because a scatter sized for a
 * pointer is unreadable on a phone.
 */

type Q = {
  app: string;
  logo?: string;
  text: string;
  stack: { x: number; y: number; r: number };
  target: { x: number; y: number };
  sm: { x: number; y: number };
  z: number;
};

const Q_CARDS: Q[] = [
  { app: "Grok", logo: "/grok-logo.svg", text: "What's your company called again?", stack: { x: -8, y: -10, r: -16 }, target: { x: -30, y: -32 }, sm: { x: -23, y: -38 }, z: 2 },
  { app: "Gemini", logo: "/gemini-logo.svg", text: "When are you traveling?", stack: { x: 14, y: -10, r: 18 }, target: { x: 31, y: -30 }, sm: { x: 23, y: -38 }, z: 3 },
  { app: "Claude Code", logo: "/claude-logo.svg", text: "What did we try last time?", stack: { x: -16, y: 0, r: -5 }, target: { x: -36, y: 0 }, sm: { x: -23, y: -19 }, z: 4 },
  { app: "ChatGPT", logo: "/openai-logo.svg", text: "What's your thesis about?", stack: { x: 1, y: -10, r: -2 }, target: { x: 2, y: -33 }, sm: { x: 23, y: -19 }, z: 5 },
  { app: "Cursor", text: "Which framework are you using?", stack: { x: 18, y: 1, r: 6 }, target: { x: 36, y: 4 }, sm: { x: -23, y: 20 }, z: 6 },
  { app: "Claude", logo: "/claude-logo.svg", text: "Can you remind me what we decided?", stack: { x: -6, y: 10, r: 6 }, target: { x: -27, y: 33 }, sm: { x: 23, y: 20 }, z: 7 },
  { app: "ChatGPT", logo: "/openai-logo.svg", text: "Who is this email for?", stack: { x: 8, y: 7, r: 3 }, target: { x: 3, y: 35 }, sm: { x: -23, y: 40 }, z: 8 },
  { app: "Claude", logo: "/claude-logo.svg", text: "I don't have access to that conversation.", stack: { x: 20, y: 12, r: -7 }, target: { x: 31, y: 32 }, sm: { x: 23, y: 40 }, z: 9 },
];

const SCATTER_START = 0.12;
const SCATTER_END = 0.9;
const PARALLAX = { x: 2.6, y: 2.2 };
const SPRING = { stiffness: 90, damping: 22, mass: 0.6 };

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const read = () => setCoarse(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return coarse;
}

function usePointer(active: boolean) {
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, SPRING);
  const y = useSpring(rawY, SPRING);
  useEffect(() => {
    if (!active) {
      rawX.set(0);
      rawY.set(0);
      return;
    }
    const onMove = (e: PointerEvent) => {
      rawX.set((e.clientX / window.innerWidth) * 2 - 1);
      rawY.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [active, rawX, rawY]);
  return { x, y };
}

function Card({
  q,
  progress,
  pointer,
  depth,
  coarse,
  flat,
}: {
  q: Q;
  progress: MotionValue<number>;
  pointer: { x: MotionValue<number>; y: MotionValue<number> };
  depth: number;
  coarse: boolean;
  flat: boolean;
}) {
  const end = coarse ? q.sm : q.target;
  const translate = useTransform([progress, pointer.x, pointer.y], ([p, px, py]: number[]) => {
    const tx = q.stack.x + (end.x - q.stack.x) * p - px * PARALLAX.x * depth * p;
    const ty = q.stack.y + (end.y - q.stack.y) * p - py * PARALLAX.y * depth * p;
    return `calc(-50% + ${tx}vw) calc(-50% + ${ty}vh)`;
  });
  const rotate = useTransform(progress, [0, 1], [flat ? 0 : q.stack.r, 0]);
  const scale = useTransform(progress, [0, 1], [0.86, coarse ? 0.78 : 1]);

  return (
    <motion.div
      className="absolute left-1/2 top-1/2 w-[min(22rem,40vw)] will-change-transform"
      style={{ zIndex: q.z, translate, rotate, scale }}
    >
      <div className="rounded-[14px] border border-ink/10 bg-white px-5 py-4">
        <div className="flex items-center gap-2 text-[0.8125rem] font-medium text-ink/60">
          {q.logo ? (
            <img src={q.logo} alt="" width={18} height={18} className="size-[18px]" />
          ) : (
            <span aria-hidden="true" className="grid size-[18px] place-items-center rounded-[5px] bg-ink text-[0.625rem] font-semibold text-paper">
              {q.app[0]}
            </span>
          )}
          {q.app}
        </div>
        <p className="mt-2 text-[clamp(1rem,1.35vw,1.3125rem)] font-medium leading-snug tracking-[-0.015em] text-ink">
          {q.text}
        </p>
      </div>
    </motion.div>
  );
}

export function QuestionSpread() {
  const wrap = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const coarse = useCoarsePointer();
  const { scrollYProgress } = useScroll({ target: wrap, offset: ["start start", "end end"] });
  const progress = useTransform(scrollYProgress, [0, SCATTER_START, SCATTER_END, 1], [0, 0, 1, 1]);

  const [landed, setLanded] = useState(false);
  useMotionValueEvent(progress, "change", (p) => setLanded((was) => (was ? p > 0.985 : p >= 0.999)));
  const parallax = reduce !== true && !coarse;
  const pointer = usePointer(landed && parallax);

  const copyOpacity = useTransform(progress, [0.3, 0.65], [0, 1]);
  const copyScale = useTransform(progress, [0.3, 0.9], [0.88, 1]);

  return (
    <section ref={wrap} aria-labelledby="questions" className="relative h-[320vh] w-full bg-paper">
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
        <motion.div
          className="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center px-8 text-center"
          style={{ opacity: copyOpacity, scale: reduce === true ? 1 : copyScale }}
        >
          <h2
            id="questions"
            className="font-display text-[clamp(2.25rem,5vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-ink"
          >
            Every AI asks you
            <br />
            <span className="text-ink/45">the same questions.</span>
          </h2>
          <p className="mt-5 max-w-[34ch] text-[clamp(1rem,1.25vw,1.1875rem)] leading-relaxed text-ink/65">
            And you answer them again, in every app, every day. Sidq answers
            them once, for all of them.
          </p>
        </motion.div>

        <div className="absolute inset-0 z-10">
          {Q_CARDS.map((q, i) => (
            <Card
              key={`${q.app}-${i}`}
              q={q}
              progress={progress}
              pointer={pointer}
              depth={parallax ? 0.55 + (i / (Q_CARDS.length - 1)) * 0.75 : 0}
              coarse={coarse}
              flat={reduce === true}
            />
          ))}
        </div>

      </div>
    </section>
  );
}
