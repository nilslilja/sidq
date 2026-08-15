import { OnboardingDialog } from '@/components/ui/onboarding-dialog';
import { GooeyLoader } from '@/components/ui/loader-10';
import { Timeline, type TimelineItem } from '@/components/ui/timeline';
import { Skiper19 } from '@/components/ui/svg-follow-scroll';
import { useState } from 'react';

/*
 * Dev-only gallery for the four upstream reference components, mounted at
 * /gallery and excluded from the production build.
 *
 * These are the unmodified 21st.dev sources the blueprint adapted from, kept so
 * the original and the shipped version can be compared side by side. They are NOT
 * what Sidq renders, each one carries something the design system explicitly
 * bans (gradient placeholder art, shadow-2xl elevation, a cream canvas, the
 * two-tone goo). The adapted production components are:
 *
 *   onboarding-dialog  ->  components/intake/IntakeStepper
 *   timeline           ->  components/day/DayTimeline
 *   loader-10          ->  components/ui/loader (ring variant)
 *   svg-follow-scroll  ->  components/landing/ScrollStroke
 */

const items: TimelineItem[] = [
  {
    id: '1',
    title: 'Project Started',
    description: 'Initial project setup and planning phase',
    timestamp: new Date('2024-01-15T09:00:00'),
    status: 'completed',
  },
  {
    id: '2',
    title: 'Development Phase',
    description: 'Core features implementation in progress',
    timestamp: new Date('2024-02-01T10:30:00'),
    status: 'active',
  },
  {
    id: '3',
    title: 'Testing & QA',
    description: 'Quality assurance and testing phase',
    timestamp: new Date('2024-02-15T14:00:00'),
    status: 'pending',
  },
  {
    id: '4',
    title: 'Launch',
    description: 'Production deployment and launch',
    timestamp: new Date('2024-03-01T16:00:00'),
    status: 'pending',
  },
];

export function ComponentGallery() {
  const [showDialog, setShowDialog] = useState(false);
  const [showHero, setShowHero] = useState(false);

  if (showHero) {
    return (
      <div>
        <button
          onClick={() => setShowHero(false)}
          className="fixed left-4 top-4 z-50 rounded-md border border-line bg-bg px-3 py-1.5 text-sm text-text"
        >
          Close
        </button>
        <Skiper19 />
      </div>
    );
  }

  return (
    <div className="column py-16">
      <h1 className="font-display text-[2.5rem] leading-tight">Reference components</h1>
      <p className="mt-3 max-w-[46ch] text-sm leading-relaxed text-muted">
        The unmodified upstream sources, for comparison against the adapted versions the
        app actually ships. Dev only.
      </p>

      <section className="mt-14">
        <h2 className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
          timeline.tsx · 21st.dev
        </h2>
        <div className="mt-5">
          <Timeline items={items} />
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
          loader-10.tsx · GooeyLoader
        </h2>
        <div className="mt-5 flex min-h-[160px] items-center justify-center">
          <GooeyLoader />
        </div>
      </section>

      <section className="mt-14 flex flex-wrap gap-3">
        <button
          onClick={() => setShowDialog(true)}
          className="rounded-md border border-line px-4 py-2 text-sm text-text hover:border-line-strong"
        >
          Open onboarding-dialog.tsx
        </button>
        <button
          onClick={() => setShowHero(true)}
          className="rounded-md border border-line px-4 py-2 text-sm text-text hover:border-line-strong"
        >
          Open svg-follow-scroll.tsx
        </button>
      </section>

      {showDialog && (
        <div onClick={() => setShowDialog(false)}>
          <OnboardingDialog defaultOpen />
        </div>
      )}
    </div>
  );
}

export default ComponentGallery;
