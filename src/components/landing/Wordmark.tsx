import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { HandwritingText } from "./HandwritingText";

/*
 * The name, written by hand, in the corner of every page.
 *
 * The same pen as the hero's "page.": Caveat, converted to strokes ahead of
 * time, drawn left to right and then inked in. The mark that sat beside the
 * name is gone; the handwriting is the mark now, and one blue signature in the
 * corner says more than a logo and a word next to each other.
 *
 * It writes itself once per page load, quickly, before the headline's pen
 * starts, so the two read as one hand rather than competing. Under reduced
 * motion it is simply there. The link's name comes from the drawing's own
 * label, so a screen reader hears "Sidq".
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        "inline-flex min-h-11 items-center text-[#2448E8] transition-opacity duration-150 hover:opacity-75 sm:min-h-0",
        className,
      )}
    >
      <HandwritingText word="Sidq" delay={0.05} duration={0.9} strokeWidth={1.8} className="[font-size:2rem]" />
    </Link>
  );
}
