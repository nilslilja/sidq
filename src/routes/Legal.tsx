import { Link } from 'react-router-dom';
import { SiteFooter } from '@/components/landing/SiteFooter';

/*
 * Privacy and Terms.
 *
 * These were linked from the footer of every page while no route rendered them,
 * so both fell through to the catch-all and redirected to the homepage. A dead
 * privacy link is worse than no link: it is the one page a cautious person opens
 * before installing something that reads their files.
 *
 * Written to be read rather than to be defensible. Almost every clause here is
 * short because almost nothing happens: the product's whole architecture is that
 * your conversations are read on your machine and go to your clipboard, so there
 * is very little to disclose. Padding that out with the usual boilerplate would
 * obscure the only fact that matters.
 *
 * Deliberately not a template. Everything below describes something this code
 * actually does, and if the code changes these have to change with it.
 */

const UPDATED = 'August 2026';

/** The address on both pages. Changing it here changes it in both. */
const CONTACT = 'nilsliljan@gmail.com';

export function Privacy() {
  return (
    <Page title="Privacy" updated={UPDATED}>
      <P lead>
        Sidq reads your AI conversations from your own Mac and puts them on your own
        clipboard. That is the entire product, and it is why this page is short.
      </P>

      <H>What never leaves your machine</H>
      <P>
        Your conversations. All of them. Sidq reads the transcript files that Claude Code
        and other assistants already write to your disk, and the text goes to your
        clipboard so you can paste it. It is never sent to us, never sent to a third
        party, and never stored anywhere but where it already was. This is not a policy
        choice that could quietly change; it is how the feature is built, and it is why it
        works with no internet connection.
      </P>

      <H>What Sidq reads, and when</H>
      <P>
        Two different things happen, and the difference matters:
      </P>
      <List
        items={[
          'To list your recent sessions, Sidq reads only enough to label and rank them: the title, the project folder, the git branch, how many messages there were and roughly how long you worked. Never the contents.',
          'To hand a conversation over, Sidq reads that one transcript in full. This happens only when you pick that conversation yourself. Nothing reads a transcript on a timer or in the background.',
        ]}
      />

      <H>The companion, and your screen</H>
      <P>
        If you turn the companion on, Sidq reads the name of the application in front of
        you and the title of its window, so it can notice when you have drifted off what
        you picked. There are no screenshots, no screen recording, no vision model, no
        camera and no microphone. That reading happens on your machine and is never
        uploaded. Turning the companion off stops it entirely.
      </P>

      <H>What we do collect</H>
      <P>
        If you create an account, we store your email address and your subscription
        status, because there is no way to sell you a subscription without knowing who
        you are and what you bought. Payments are handled by Stripe and we never see or
        store your card details. During setup we ask how you found Sidq and what you want
        it for; those two answers are kept on your own machine.
      </P>

      <H>What we do not do</H>
      <List
        items={[
          'We do not sell your data, because we sell software.',
          'We do not train any model on your conversations.',
          'We do not use advertising or analytics trackers on the desktop app.',
          'We do not put your conversations in your account. Signing in stores an email address and a subscription status, nothing else; what Sidq reads stays on your Mac.',
        ]}
      />

      <H>Deleting your data</H>
      <P>
        Deleting the app removes everything it kept locally. To delete an account and the
        email and subscription record attached to it, write to{' '}
        <A href={`mailto:${CONTACT}`}>{CONTACT}</A> and it will be done.
      </P>

      <H>Changes</H>
      <P>
        If this page changes in a way that affects what is read or where it goes, the date
        at the top changes and the app will say so before the change takes effect.
      </P>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms" updated={UPDATED}>
      <P lead>
        Plain terms for a small product. Using Sidq means agreeing to these.
      </P>

      <H>What you get</H>
      <P>
        Sidq is a macOS application. The free plan is metered rather than crippled: every
        capability is present, and two of them run out. Paid plans remove those meters.
        What each plan includes is listed on the pricing page, and what is listed there is
        what the software enforces.
      </P>

      <H>Payment and cancelling</H>
      <List
        items={[
          'Subscriptions are billed through Stripe, monthly or yearly, and renew until you cancel.',
          'You can cancel at any time and keep access until the end of the period you have already paid for.',
          'If Sidq is not what you expected, write within 14 days of paying and you will be refunded. No reason required.',
        ]}
      />

      <H>What you may do with it</H>
      <P>
        Use it for your own work, personal or commercial. A Duo subscription covers two
        people. Do not resell it, redistribute it, or take it apart and ship the pieces as
        your own.
      </P>

      <H>What it does not promise</H>
      <P>
        Sidq reads files that other applications write, and those applications can change
        their formats without warning. When that happens Sidq may stop reading a source
        until it is updated. It is a tool for moving your own work between assistants; it
        does not guarantee any particular result from whichever assistant you paste into,
        and it is provided as it is, without warranty.
      </P>

      <H>Liability</H>
      <P>
        To the extent the law allows, liability is limited to what you have paid in the
        previous twelve months. Nothing here removes rights you have as a consumer that
        cannot be signed away.
      </P>

      <H>Ending it</H>
      <P>
        You can stop using Sidq whenever you like by deleting it. We may end an account
        that is being used to abuse the service or break these terms, and if that happens
        with a paid account the unused part is refunded.
      </P>

      <H>Getting in touch</H>
      <P>
        Questions about any of this go to <A href={`mailto:${CONTACT}`}>{CONTACT}</A>.
      </P>
    </Page>
  );
}

/* ── Shared shell ──────────────────────────────────────────────────────────── */

function Page({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-paper">
      <header className="mx-auto max-w-[46rem] px-6 pt-10">
        <Link
          to="/"
          className="font-display text-[1.5rem] leading-none tracking-[-0.05em] transition-opacity duration-150 hover:opacity-70"
        >
          Sidq
        </Link>
      </header>

      <main className="mx-auto max-w-[46rem] px-6 py-16">
        <h1 className="font-display text-[clamp(2.5rem,6vw,4rem)] leading-[0.95] tracking-[-0.04em]">
          {title}
        </h1>
        <p className="mt-4 text-[0.8125rem] ink-muted">Last updated {updated}</p>

        <div className="mt-14">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-12 font-display text-[1.375rem] leading-snug tracking-[-0.02em] first:mt-0">
      {children}
    </h2>
  );
}

function P({ children, lead }: { children: React.ReactNode; lead?: boolean }) {
  return (
    <p
      className={
        lead
          ? 'max-w-[64ch] text-[1.0625rem] leading-relaxed'
          : 'mt-4 max-w-[64ch] text-[0.9375rem] leading-relaxed ink-muted'
      }
    >
      {children}
    </p>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 max-w-[64ch] space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-[0.9375rem] leading-relaxed ink-muted">
          <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-accent/50" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-ink underline underline-offset-4 transition-colors duration-150 hover:text-accent"
    >
      {children}
    </a>
  );
}
