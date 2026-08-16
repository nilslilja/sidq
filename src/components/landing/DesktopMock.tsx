import { PillPreview } from './PillPreview';
import { cn } from '@/lib/cn';

/*
 * The product shot, standing in for the video.
 *
 * Every site at this level puts a screen recording here, and one should go here
 * eventually. Until then a still screenshot would be the worst option: it reads
 * as a placeholder and it cannot show the one thing worth showing, which is the
 * card sitting on top of somebody else's application.
 *
 * So this is the real card component, composited over a mock desktop, with the
 * status line cycling. It is a few kB, it is sharp at any resolution, it is
 * theme-correct, and when the real capture exists it drops into the same slot.
 */

export function DesktopMock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative aspect-[16/10] w-full overflow-hidden rounded-[18px]',
        // The desktop wallpaper. A dawn gradient rather than a stock macOS
        // photo, so it belongs to Sidq and there is nothing to license.
        'bg-[linear-gradient(165deg,#2A2A5C_0%,#4C4A8A_28%,#8E7BB0_52%,#D8A08C_74%,#F0C9A0_100%)]',
        'shadow-[0_40px_100px_-30px_rgba(30,27,75,0.55)]',
        className,
      )}
    >
      {/* The window being worked in. Blurred and dimmed, because it is context,
          and a legible fake editor invites people to read the fake code. */}
      <div className="absolute inset-x-[8%] bottom-0 top-[14%] overflow-hidden rounded-t-[12px] bg-[#15151C] shadow-[0_-10px_60px_-10px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-3">
          <span className="size-2.5 rounded-full bg-[#FF5F57]" />
          <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="size-2.5 rounded-full bg-[#28C840]" />
          <span className="ml-3 text-[0.6875rem] text-white/30">pricing.tsx</span>
        </div>

        <div className="space-y-2.5 p-5 opacity-[0.35] blur-[0.4px]">
          {[62, 88, 45, 74, 30, 80, 55, 68, 40].map((width, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-4 shrink-0 text-right text-[0.5625rem] text-white/25">
                {i + 1}
              </span>
              <span
                className={cn(
                  'h-2 rounded-full',
                  i % 3 === 0 ? 'bg-[#B8A6FF]/40' : i % 3 === 1 ? 'bg-white/15' : 'bg-white/10',
                )}
                style={{ width: `${width}%` }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* The card. The whole point of the image, so it sits above and in front. */}
      {/*
       * Two nested elements on purpose. The animation sets `transform`, which
       * replaces the whole property, so centring and floating cannot live on the
       * same node: the outer one centres, the inner one moves.
       *
       * float-soft rather than drift-a, because the drift keyframes tilt. Right
       * for a loose keycap, and it makes a UI card look like a rendering fault.
       */}
      <div className="absolute left-1/2 top-[7%] w-[min(34rem,82%)] -translate-x-1/2">
        <PillPreview
          className="float-soft w-full"
          rows={[
            { title: 'Pricing page copy', meta: '5h session · Sidq' },
            { title: 'Onboarding email sequence', meta: '95 exchanges · Verdict' },
            { title: 'Refund policy wording', meta: '40m · Sidq' },
          ]}
        />
      </div>
    </div>
  );
}
