import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  desktopBridge,
  type PlanStatus,
  type InviteSummary,
  type ProfileFact,
  type ProjectRow,
  type ProjectMemory,
  type SharedProject,
  type SearchHit,
  type FoundTeam,
  type SharedHandover,
  type TeamSettings,
} from "@/lib/onboarding/bridge";
import { projectLabel, titleOf, type WorkSession } from "@/lib/companion/work-history";
import { adoptSession, shareSessionWithDesktop } from "@/lib/supabase";
import { ConnectExtension } from "@/components/companion/ConnectExtension";
import { GrantAccess } from "@/components/companion/GrantAccess";
import { TrialNotice } from "@/components/companion/TrialNotice";
import { FEATURES } from "@/lib/features";
import { SOURCES, sourceLabel, type Source } from "@/lib/companion/sources";
import { cn } from "@/lib/cn";
import { SidqMark } from "@/components/SidqMark";
import {
  AutoRow,
  Chip,
  Keys,
  PanelHead,
  SectionHead,
  SourceGlyph,
  Toggle,
  whenLabel,
} from "@/routes/home/ui";
import { Conversations } from "@/routes/home/Conversations";
import { Handovers } from "@/routes/home/Handovers";
import { Connections } from "@/routes/home/Connections";
import { Shortcuts } from "@/routes/home/Shortcuts";
import { Settings } from "@/routes/home/Settings";

/*
 * The window behind the pill.
 *
 * Wispr's shape, and for the reason that shape works: the thing you use is a
 * small overlay you never lose, and behind it sits a real application you open
 * when you want to look at something rather than do something.
 *
 * ── What belongs here, and what does not ─────────────────────────────────────
 * This is an account screen: your numbers, your data, your plan, your invites.
 * It is not a place to be told what Sidq is for.
 *
 * It used to open on an essay — a percentage the size of a fist, and four
 * paragraphs arguing that your assistant hides its reasoning from you. That
 * argument belongs on the site, where somebody is deciding whether to install
 * this. Somebody who already has it is here to look at their own things, and
 * making them scroll past the pitch every time is the app talking about itself.
 *
 * Every number is computed from data that exists. No placeholder cards, no
 * "coming soon" tiles, no stat with a plausible shape and nothing behind it. A
 * section with nothing to show says so in one line and takes up no more room
 * than that. Every row in the sidebar leads somewhere that works.
 */

type Tab =
  | "overview"
  | "search"
  | "conversations"
  | "handovers"
  | "sources"
  | "projects"
  | "profile"
  | "connections"
  | "shortcuts"
  | "team"
  | "plan"
  | "invite"
  | "settings";

type IconName = Tab;

/**
 * The sidebar, in three groups.
 *
 * Your things first: the overview, search, every conversation, every handover,
 * and what Sidq knows about your work and how you work. Then how Sidq is wired
 * in: which tools ask it directly, the keys, what it reads, the team. At the
 * bottom, the account and the settings. The rule for every row is the same as
 * it always was: each opens a panel that renders something real, read from
 * this Mac, and none is a placeholder for something coming.
 */
const ALL_TABS: {
  id: Tab;
  label: string;
  icon: IconName;
  group?: "wiring" | "account";
  secondary?: true;
}[] = [
    { id: "overview", label: "Overview", icon: "overview" },
    { id: "search", label: "Search", icon: "search" },
    { id: "conversations", label: "Conversations", icon: "conversations" },
    { id: "handovers", label: "Handovers", icon: "handovers" },
    /*
     * Beside "How you work", and the pair is the point.
     *
     * That one is what you keep telling every assistant, across everything. This
     * is what you are telling them about one thing. Same evidence, same quoted
     * lines with a count beside them, different question.
     */
    { id: "projects", label: "What you're on", icon: "projects" },
    { id: "profile", label: "How you work", icon: "profile" },
    { id: "connections", label: "Connections", icon: "connections", group: "wiring" },
    { id: "shortcuts", label: "Shortcuts", icon: "shortcuts", group: "wiring" },
    { id: "sources", label: "Sources", icon: "sources", group: "wiring" },
    { id: "team", label: "Your team", icon: "team", group: "wiring" },
    { id: "plan", label: "Plan", icon: "plan", secondary: true },
    { id: "invite", label: "Invite a friend", icon: "invite", secondary: true },
    { id: "settings", label: "Settings", icon: "settings", secondary: true },
  ];

/**
 * The rows actually in the sidebar this week.
 *
 * Filtered rather than edited, so what is switched off is visible in one place
 * next to what is on. See `FEATURES` for why each of these is dark and why it
 * is a flag rather than a deletion.
 */
const TABS = ALL_TABS.filter((t) => {
  if (t.id === "team") return FEATURES.team;
  if (t.id === "invite") return FEATURES.invites;
  if (t.id === "projects") return FEATURES.projectMemory;
  return true;
});

const DAY_MS = 86_400_000;

/** Long enough to read "Copied", short enough that it never feels stuck. */
const COPIED_FOR_MS = 1600;

/** Light or dark, for this window only. */
type Theme = "light" | "dark";

/*
 * Remembered, and it starts as whatever the Mac is set to.
 *
 * A window that opens light on a machine in dark mode is the thing people
 * notice, so the first run follows the system. After that the choice is the
 * person's: they picked it on purpose and it should not be overridden the next
 * time macOS changes at sunset.
 */
function firstTheme(): Theme {
  try {
    const saved = localStorage.getItem("sidq.theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* private mode; fall through to the system */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function Home() {
  const bridge = useMemo(() => desktopBridge(), []);
  const [theme, setTheme] = useState<Theme>(firstTheme);

  /*
   * On the window's own root rather than <html>. The pill and the setup window
   * share this document in the packaged app, and neither of them has a theme.
   */
  useEffect(() => {
    try {
      localStorage.setItem("sidq.theme", theme);
    } catch {
      /* a remembered preference is not worth failing a render over */
    }
  }, [theme]);

  /*
   * ── Nothing animates while the palette changes ───────────────────────────
   *
   * Every themed surface here takes its colour from a custom property, and
   * several of them also have a transition, which is the normal way to make a
   * hover feel attached to the cursor. Those two features do not compose:
   * Chromium does not reliably re-trigger a running transition when the value
   * behind it came from a custom property that changed on an ancestor, so on a
   * theme switch the property stays at the previous palette's value and stays
   * there.
   *
   * Measured, before this existed. Switching to light left the inactive
   * sidebar labels at #aeb7ce on #f1eff7 — 1.76:1. Switching back to dark left
   * the active item's background at #fbfafe under #eef1f8 text — 1.09:1, which
   * is white on white. Both were stable seconds later, so neither was a
   * transition still in flight.
   *
   * Killing transitions for the frame in which the palette changes fixes every
   * one of them at once, rather than removing `color` from one rule and
   * `background-color` from the next until they are all found. A theme switch
   * should be instant anyway; it is the hover states that want easing, and
   * those keep it.
   *
   * The flag comes off on the next frame via a double rAF: one to let the new
   * values paint, one to be certain the paint has happened before transitions
   * are allowed to matter again.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme-switching", "");

    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        root.removeAttribute("data-theme-switching"),
      );
    });

    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      root.removeAttribute("data-theme-switching");
    };
  }, [theme]);
  const [tab, setTab] = useState<Tab>("overview");
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [stats, setStats] = useState<[number, number]>([0, 0]);

  /*
   * Bumped when a sign-in lands, and passed to the panels that need an account.
   * They key off it to reload, which is cheaper than lifting their state up
   * here and means each one decides for itself what a new session changes.
   */
  const [signedInAt, setSignedInAt] = useState(0);

  /*
   * The plan as Rust understands it.
   *
   * Asked rather than assumed, and only ever used for wording. Rust confirms
   * the tier against the billing database and applies every limit inside the
   * command that would breach it, so this being wrong changes what somebody is
   * told and not what they are given.
   */
  const [plan, setPlan] = useState<PlanStatus | null>(null);

  /**
   * Everything on this screen that Rust owns, asked for again.
   *
   * Cheap: three local reads, no network. Called on mount, whenever Rust says
   * something changed, and whenever the window comes back to the front.
   */
  const refresh = useCallback(() => {
    if (!bridge) return;
    void bridge
      .recentWork(200)
      .then((rows) => setSessions(rows as WorkSession[]));
    void bridge.indexStats().then(setStats);
    void bridge.planStatus().then(setPlan);
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    refresh();
    /*
     * Refresh the token, then ask what the plan is.
     *
     * Access tokens expire after an hour and Rust's stored copy goes stale with
     * them, so opening this window is the moment to hand over a live one. It
     * also means somebody who has just paid sees it here rather than waiting
     * for a cache to lapse.
     */
    void shareSessionWithDesktop()
      .catch(() => {})
      .then(() => bridge.planStatus())
      .then(setPlan);
  }, [bridge, refresh]);

  /*
   * ── Keep Rust's copy of the token alive ──────────────────────────────────
   *
   * `entitlement::current` calls Supabase with whatever token was last handed
   * to it, and an access token lasts about an hour. Rust cannot renew one — it
   * holds no refresh token, deliberately — so the only thing that keeps it
   * valid is this window calling `getSession`, which renews it in passing.
   *
   * That happened on mount, on focus, and whenever something changed, which
   * covers somebody using the product. It does not cover somebody who has paid
   * and then left Sidq running untouched: the token lapses, every check fails,
   * and `current` falls back to the last confirmed tier — correctly, but only
   * for the grace period. After that a paying customer is quietly on Free.
   *
   * Measured while testing: the stored token was twelve minutes past expiry
   * with the app running, and the server refused it.
   *
   * A timer costs one call every half hour against a token that lasts an hour.
   */
  useEffect(() => {
    if (!bridge) return;
    const timer = setInterval(
      () => void shareSessionWithDesktop().catch(() => {}),
      SESSION_REFRESH_MS,
    );
    return () => clearInterval(timer);
  }, [bridge]);

  /*
   * ── Why this window listens, and also does not rely on listening ──────────
   *
   * It asked for the plan on mount and never again, so the allowance it printed
   * was the one from the moment it opened: you handed a conversation over, the
   * count stayed where it was, and it stayed there until the app was quit.
   * Nothing was miscounted — Rust records every handover — the window just
   * never looked a second time.
   *
   * So Rust announces, and this listens. But an event that fails to arrive
   * fails silently, and events in this app have done exactly that twice. The
   * focus listener is the belt to that braces: you hand a conversation over,
   * you come back to the window, and it is right, whatever the plumbing did.
   */
  useEffect(() => {
    if (!bridge) return;

    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void bridge.onChanged(refresh).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener("focus", onFocus);
    };
  }, [bridge, refresh]);

  /*
   * Signing in has to change this window without being closed and reopened.
   *
   * The browser hands the tokens back through a `sidq://auth` deep link, and
   * until this listener existed nothing in here was watching for it: you signed
   * in, came back, and the panel still said to sign in. Onboarding had the same
   * listener and this window had none, because sign-in only ever happened
   * during setup — which is also why there was no way to start one from here.
   */
  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void bridge
      .onSignedIn((urls) => {
        void adoptSession(urls)
          .then(() => bridge.planStatus())
          .then(setPlan)
          .then(() => setSignedInAt(Date.now()));
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [bridge]);

  // Real working time, summed from what the readers measured. Not an estimate.
  const hoursRead = useMemo(
    () =>
      Math.round(
        sessions.reduce((sum, s) => sum + (s.activeMinutes ?? 0), 0) / 60,
      ),
    [sessions],
  );

  return (
    /*
     * ── The surface ──────────────────────────────────────────────────────
     *
     * A tinted ground with the work floating on it as one white card, which is
     * the shape every good Mac companion app has settled on. The sidebar is not
     * a panel with a border down its side; it sits directly on the ground, and
     * the card's edge is what separates them.
     *
     * ── Why it is light ──────────────────────────────────────────────────
     * It was near-black, and near-black is what an app reaches for when it
     * wants to look serious without deciding anything. Everything on it had to
     * be a percentage of white, so eleven shades of grey ended up standing in
     * for four levels of hierarchy, and the result read as one dim sheet.
     *
     * The lavender is the product's colour and it cannot carry a dark screen —
     * at var(--w-accent-soft) it is either invisible or shouting. On a light ground it has
     * somewhere to go: a tint for surfaces, a darker sibling for text, and ink
     * for the one button that matters.
     */
    <div
      data-app-theme={theme}
      className={cn(
        "grid h-[100dvh] grid-cols-[15.5rem_1fr] overflow-hidden text-[var(--w-text)]",
        /*
         * The website's paper, flat.
         *
         * There were washes of peach and lavender painted into the ground here,
         * to stop a white card on grey reading as sterile. They also made this
         * window a different product from the page it was downloaded from. The
         * site gets its warmth from the paper itself and so does this now: one
         * fill, a white surface on it, hairlines between things.
         */
        "bg-[var(--w-bg)]",
      )}
    >
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="flex min-h-0 flex-col px-3 pb-4 pt-3">
        {/*
         * Room for the traffic lights, which float on the surface now.
         *
         * Also the drag handle: with the titlebar gone there is nothing else
         * to move the window by, and a window you cannot move is worse than
         * a titlebar that clashes.
         */}
        <div data-tauri-drag-region className="h-8 shrink-0" />

        <div className="flex items-center gap-2 px-3 pb-1 pt-2">
          <Mark />
          <span className="font-display text-[1.125rem] font-semibold leading-none tracking-[-0.05em]">
            Sidq
          </span>

          {/*
           * Beside the wordmark, at the top of the sidebar.
           *
           * It shows the theme it would switch to rather than the one you are
           * in, which is the convention every Mac app follows: the control is
           * the destination, not a status light.
           */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
            title={theme === "dark" ? "Light" : "Dark"}
            className={cn(
              "ml-auto grid size-7 place-items-center rounded-lg",
              "text-[var(--w-text-5)] transition-colors duration-150",
              "cursor-pointer hover:bg-[var(--w-raised)] hover:text-[var(--w-text-3)]",
            )}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>

        <nav className="mt-6 flex min-h-0 flex-col gap-0.5 overflow-y-auto">
          {TABS.filter((t) => !t.secondary && !t.group).map((t) => (
            <NavRow
              key={t.id}
              tab={t}
              active={tab === t.id}
              onClick={() => setTab(t.id)}
            />
          ))}
          {/* How Sidq is wired in, a step apart from your own things. */}
          <div className="mx-3 my-2.5 h-px bg-[var(--w-line)]" aria-hidden="true" />
          {TABS.filter((t) => t.group === "wiring").map((t) => (
            <NavRow
              key={t.id}
              tab={t}
              active={tab === t.id}
              onClick={() => setTab(t.id)}
            />
          ))}
        </nav>

        {/*
         * The allowance, in the one place it belongs.
         *
         * It was three separate readings of the same number: a card down here,
         * a figure in the header strip and a bar on the overview. A limit is
         * something you glance at, and glancing at it in three places is how
         * you stop reading any of them.
         */}
        <div className="mt-auto pt-6">
          {plan && (
            <div className="border-t border-[var(--w-line)] px-3 pt-4">
              {plan.handoversCap == null ? (
                <>
                  <p className="text-[0.875rem] font-medium capitalize text-[var(--w-text)]">
                    {plan.plan}
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]">
                    Unlimited handovers, and search across everything.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[0.875rem] font-medium text-[var(--w-text)]">
                    <span className="text-[var(--w-accent)]">
                      {Math.max(0, plan.handoversCap - plan.handoversUsed)}
                    </span>{" "}
                    handovers left
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]">
                    You get {plan.handoversCap} a week on {plan.plan}. Invite a
                    friend, or upgrade to stop counting.
                  </p>
                  <button
                    onClick={() => void bridge?.openUpgrade()}
                    className={cn(
                      "mt-3 w-full rounded-[10px] px-3 py-2",
                      "bg-[var(--w-invert)] text-[0.8125rem] font-medium text-[var(--w-on-invert)]",
                      "cursor-pointer transition-[opacity,transform,translate,scale] duration-150 hover:opacity-85 active:scale-[0.98]",
                    )}
                  >
                    Upgrade to Pro
                  </button>
                </>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-0.5">
            {TABS.filter((t) => t.secondary).map((t) => (
              <NavRow
                key={t.id}
                tab={t}
                active={tab === t.id}
                onClick={() => setTab(t.id)}
              />
            ))}
          </div>
        </div>
      </aside>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {/*
       * `min-h-0` is load-bearing, and its absence is a real bug rather than a
       * tidiness one.
       *
       * A grid row is `auto`, which means it grows to its content and will not
       * shrink below it — even inside a container with a fixed height. So the
       * card stretched to the full height of whatever was inside it, its
       * `overflow-y-auto` never had anything to scroll, and everything past
       * the window was simply cut off with no way to reach it. Measured on the
       * Sources panel: viewport 900, this element 1256.
       *
       * `min-h-0` lets the row shrink to the viewport, which is what hands the
       * overflow to the card.
       */}
      <main className="min-h-0 min-w-0 py-3 pl-0 pr-3">
        <div
          className={cn(
            /*
             * `overscroll-contain` stops the rubber band.
             *
             * Scrolling past either end of this card bounced it and showed the
             * window behind, which on a dark theme is a flash of whatever is
             * under the app rather than a soft edge. Contained, the bounce ends
             * at the card and no chain reaches the window.
             */
            "h-full min-h-0 overflow-y-auto overscroll-contain rounded-[16px]",
            // White on the paper, a hairline round it and one neutral shadow:
            // the site's own card, rather than a gradient with a violet glow.
            "bg-[var(--w-surface)] ring-1 ring-[var(--w-line)] shadow-[var(--w-lift)]",
          )}
        >
          <div data-tauri-drag-region className="h-3" />
          {/* Keyed on the tab so switching panels replays the entrance. */}
          <div key={tab} className="animate-rise mx-auto max-w-[54rem] px-10 pb-14 pt-6">
            {tab === "overview" && (
              <Overview
                bridge={bridge}
                plan={plan}
                stats={stats}
                hoursRead={hoursRead}
              />
            )}
            {tab === "search" && (
              <Search bridge={bridge} historyDays={plan?.historyDays ?? null} />
            )}
            {tab === "conversations" && <Conversations bridge={bridge} />}
            {tab === "handovers" && <Handovers bridge={bridge} plan={plan} />}
            {tab === "connections" && <Connections bridge={bridge} />}
            {tab === "shortcuts" && <Shortcuts bridge={bridge} />}
            {tab === "settings" && (
              <Settings bridge={bridge} theme={theme} onTheme={setTheme} />
            )}
            {tab === "sources" && (
              <Sources sessions={sessions} bridge={bridge} />
            )}
            {tab === "projects" && <Projects bridge={bridge} />}
            {tab === "profile" && <Profile bridge={bridge} />}
            {tab === "team" && <Team bridge={bridge} />}
            {tab === "plan" && <Plan bridge={bridge} plan={plan} />}
            {tab === "invite" && (
              <Invite bridge={bridge} signedInAt={signedInAt} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── The sidebar's parts ──────────────────────────────────────────────────── */

/**
 * One row of the sidebar.
 *
 * The active one is a white pill on the tinted ground rather than a bar on its
 * edge. On a dark screen the bar was the only mark that survived; here the row
 * can simply be the same colour as the card it opens, which says "this is the
 * thing on screen" without a second symbol to decode.
 */
function NavRow({
  tab,
  active,
  onClick,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-[10px] px-3 py-[0.5625rem] text-left",
        /*
         * Background and shadow only. `color` is deliberately not in here.
         *
         * These labels take their colour from `--w-text-3`, and that variable
         * changes when the theme does. Chromium does not reliably re-trigger a
         * running transition when the value behind it came from a custom
         * property that changed on an ancestor, so the text stayed at the old
         * palette's colour indefinitely: measured after a switch to light, the
         * inactive labels were still #aeb7ce on #f1eff7, which is 1.76:1 and
         * effectively unreadable. Not a transition mid-flight — stable three
         * seconds later.
         *
         * Untransitioned, the colour snaps to the right value, which is what a
         * theme switch should do anyway. Hover still animates the parts that
         * do not depend on the palette.
         */
        "text-[0.875rem] transition-[background-color,box-shadow,transform,translate,scale] duration-150",
        active
          ? "bg-[var(--w-surface)] font-medium text-[var(--w-text)] shadow-[0_0_0_1px_var(--w-line)]"
          : "text-[var(--w-text-3)] hover:bg-[var(--w-raised)] hover:text-[var(--w-text)]",
        "cursor-pointer active:scale-[0.985]",
      )}
    >
      <Icon
        name={tab.icon}
        className={active ? "text-[var(--w-text)]" : "text-[var(--w-text-5)]"}
      />
      <span className="min-w-0 truncate">{tab.label}</span>
    </button>
  );
}

/**
 * The Sidq mark: the scatter resolving into one clear line.
 *
 * The paths are `public/icons/icon.svg`, which is the Dock icon, cropped to the
 * artwork. The whole 512 square shrunk to 22 points was a smudge — the drawing
 * lives in a wide, short band across the middle of it and the plate is a shade
 * off the sidebar's own ground, so there was nothing to see at that size.
 *
 * The first version of this was four bars, which is Wispr's dictation waveform
 * and says nothing about what Sidq does.
 *
 * The paths themselves live in `SidqMark`, shared with the overlay, and a test
 * reads that file against the icon so the two cannot drift apart.
 */
function Mark() {
  // The paths moved to `SidqMark` when the overlay needed them too. The colour
  // still comes from here, because `--w-mark` is this window's token and the
  // shared component inherits it.
  return <SidqMark className="shrink-0 text-[var(--w-mark)]" />;
}

/**
 * The nav icons.
 *
 * Drawn here rather than pulled from a set. Six 16px glyphs is not worth a
 * dependency, and every icon library ships hundreds of paths to get them.
 */
function Icon({ name, className }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    overview: (
      <>
        <rect x="2.5" y="2.5" width="5" height="5" rx="1.2" />
        <rect x="10.5" y="2.5" width="5" height="5" rx="1.2" />
        <rect x="2.5" y="10.5" width="5" height="5" rx="1.2" />
        <rect x="10.5" y="10.5" width="5" height="5" rx="1.2" />
      </>
    ),
    projects: (
      <>
        <path d="M2.5 5.5a1 1 0 0 1 1-1h3.2l1.4 1.6h6.4a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1Z" />
      </>
    ),
    search: (
      <>
        <circle cx="8" cy="8" r="5" />
        <path d="M11.8 11.8 15.5 15.5" />
      </>
    ),
    sources: (
      <>
        <ellipse cx="9" cy="4.5" rx="6" ry="2.4" />
        <path d="M3 4.5v9c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4v-9" />
        <path d="M3 9c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4" />
      </>
    ),
    profile: (
      <>
        <path d="M4 3h7l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M6 8.5h6M6 11.5h4" />
      </>
    ),
    team: (
      <>
        <circle cx="6.5" cy="6" r="2.6" />
        <path d="M2 15c0-2.5 2-4.2 4.5-4.2S11 12.5 11 15" />
        <path d="M12 4.2a2.6 2.6 0 0 1 0 5" />
        <path d="M13 10.9c1.9.4 3 1.9 3 4.1" />
      </>
    ),
    conversations: (
      <>
        <path d="M3 4.5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 13 4.5v4A1.5 1.5 0 0 1 11.5 10H7l-2.5 2V10h0A1.5 1.5 0 0 1 3 8.5Z" />
        <path d="M15 7v4.5a1.5 1.5 0 0 1-1.5 1.5H13v2l-2.5-2H8" />
      </>
    ),
    handovers: (
      <>
        <path d="M9.5 3H4.5A1.5 1.5 0 0 0 3 4.5v9A1.5 1.5 0 0 0 4.5 15h9a1.5 1.5 0 0 0 1.5-1.5V8.5" />
        <path d="M11 3h4v4M15 3 8.5 9.5" />
      </>
    ),
    connections: (
      <>
        <path d="M7 11 11 7" />
        <path d="M8.5 5.5 10 4a2.8 2.8 0 0 1 4 4l-1.5 1.5" />
        <path d="M9.5 12.5 8 14a2.8 2.8 0 0 1-4-4l1.5-1.5" />
      </>
    ),
    shortcuts: (
      <>
        <path d="M6.5 6.5h5v5h-5Z" />
        <path d="M6.5 6.5H5A1.5 1.5 0 1 1 6.5 5v1.5ZM11.5 6.5H13A1.5 1.5 0 1 0 11.5 5v1.5ZM6.5 11.5H5A1.5 1.5 0 1 0 6.5 13v-1.5ZM11.5 11.5H13a1.5 1.5 0 1 1-1.5 1.5v-1.5Z" />
      </>
    ),
    settings: (
      <>
        <circle cx="9" cy="9" r="2.2" />
        <path d="M9 2.5v1.8M9 13.7v1.8M2.5 9h1.8M13.7 9h1.8M4.4 4.4l1.3 1.3M12.3 12.3l1.3 1.3M4.4 13.6l1.3-1.3M12.3 5.7l1.3-1.3" />
      </>
    ),
    plan: (
      <>
        <rect x="2.5" y="4.5" width="13" height="9" rx="1.6" />
        <path d="M2.5 7.8h13" />
      </>
    ),
    invite: (
      <>
        <path d="M2.5 7h13v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V7Z" />
        <path d="M2.5 7 4 3.5h10L15.5 7M9 7v8.5" />
      </>
    ),
  };

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("shrink-0 transition-colors duration-150", className)}
    >
      {paths[name]}
    </svg>
  );
}

/**
 * Today, written the way a person would say it.
 *
 * The one fact on this screen nobody has to take on trust — it is either right
 * or the machine's clock is wrong.
 */
function today(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}


/**
 * How often this window renews the token Rust holds.
 *
 * Half of the roughly one-hour life of an access token, so a single missed
 * tick is not enough to let one lapse.
 */
/** Good morning, afternoon or evening, with the name somebody gave at setup. */
function salutation(): string {
  const hour = new Date().getHours();
  const part = hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const name = (() => {
    try {
      return localStorage.getItem("sidq.name")?.trim() ?? "";
    } catch {
      return "";
    }
  })();
  return name ? `Good ${part}, ${name}.` : `Good ${part}.`;
}

/*
 * ── The memory, as four numbers ──────────────────────────────────────────────
 *
 * The first thing on the screen that is not a sentence, and it is what Sidq
 * has actually done: every figure is read from the index, none is estimated.
 * Serif and large, between two hairlines and nothing else: no gradient card,
 * no watermark, no glow. The figures are the decoration.
 */
function MemoryCard({
  conversations,
  messages,
  hours,
  reading,
}: {
  conversations: number;
  messages: number;
  hours: number;
  reading: number;
}) {
  const figures: [string, string][] = [
    [conversations.toLocaleString(), "conversations remembered"],
    [reading.toLocaleString(), reading === 1 ? "AI on the same page" : "AIs on the same page"],
    [`${hours.toLocaleString()}h`, "of your work, kept"],
    [messages.toLocaleString(), "messages read"],
  ];
  return (
    <section
      aria-label="What Sidq remembers"
      className="mt-9 border-y border-[var(--w-line)] py-7"
    >
      <div className="grid grid-cols-2 gap-x-8 gap-y-5 lg:grid-cols-4">
        {figures.map(([value, label]) => (
          <div key={label}>
            <p className="font-display text-[2.25rem] font-semibold leading-none tabular-nums tracking-[-0.05em] text-[var(--w-text)]">
              {value}
            </p>
            <p className="mt-2 text-[0.8125rem] text-[var(--w-text-3)]">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Across({ sessions }: { sessions: WorkSession[] }) {
  if (sessions.length === 0) return null;
  return (
    <section aria-labelledby="across" className="mt-12">
      <SectionHead id="across" title="Lately, across your AIs" />
      <ul className="mt-4 divide-y divide-[var(--w-line)] border-y border-[var(--w-line)]">
        {sessions.map((s) => {
          const source = s.source ?? "claude-code";
          return (
            <li
              key={`${s.sessionId ?? s.title}-${s.endedAt}`}
              className="flex items-center gap-3 py-3"
            >
              <SourceGlyph source={source} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.875rem] text-[var(--w-text)]">
                  {titleOf(s)}
                </span>
                <span className="block truncate text-[0.75rem] text-[var(--w-text-3)]">
                  {sourceLabel(source)}
                  {projectLabel(s.projectName) && ` · ${projectLabel(s.projectName)}`}
                </span>
              </span>
              <span className="shrink-0 text-[0.75rem] tabular-nums text-[var(--w-text-3)]">
                {whenLabel(s.endedAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const SESSION_REFRESH_MS = 30 * 60 * 1000;

/**
 * Does this problem mean the sign-in lapsed, rather than anything being wrong?
 *
 * Rust already turns the server's developer-facing wording into a sentence, so
 * this matches on that sentence. Kept in step with `is_a_stale_session` in
 * `invites.rs`: if the two drift, the retry stops firing and the panel goes
 * back to telling somebody to try again at something that cannot work.
 */
function isAStaleSession(problem: string): boolean {
  return problem.includes("sign-in needs refreshing");
}

/* ── Panel headings ───────────────────────────────────────────────────────── */

/* ── Overview ─────────────────────────────────────────────────────────────── */

/**
 * What Sidq has of yours, and what you have done with it.
 *
 * Two columns, the way a dashboard wants to be: the record down the left, the
 * standing figures down the right where they can be glanced at without being
 * scrolled past. The figures used to be a strip across the top of every panel,
 * which meant reading them on the search screen and the sources screen too.
 *
 * Every one is measured. Nothing here is an estimate and nothing is rounded up
 * to look better.
 */
function Overview({
  bridge,
  plan,
  stats,
  hoursRead,
}: {
  bridge: ReturnType<typeof desktopBridge>;
  plan: PlanStatus | null;
  stats: [number, number];
  hoursRead: number;
}) {
  const [reach, setReach] = useState<[number, number] | null>(null);

  const [taps, setTaps] = useState<[string, string] | null>(null);
  /**
   * What stopped you this week, worst first.
   *
   * Empty is the normal state and the panel draws nothing for it. See `burn`
   * in the Rust for why an empty index reports nothing rather than zero.
   */
  const [burn, setBurn] = useState<
    { label: string; walls: number; medianMinutes: number }[]
  >([]);
  /** Days left in the reverse trial, and how long it was meant to be. */
  const [trial, setTrial] = useState<[number | null, number]>([null, 7]);

  /*
   * How many distinct AIs are actually in the index.
   *
   * Counted from the sessions rather than from the list of AIs Sidq supports,
   * because the useful number is how many of yours it has read — not how many
   * it could.
   */
  const [reading, setReading] = useState(0);
  const [recent, setRecent] = useState<WorkSession[]>([]);

  useEffect(() => {
    if (!bridge) return;
    void bridge.tapKeys().then(setTaps);
    /*
     * Wrapped, because a bridge method that is absent throws synchronously,
     * before any promise exists, so `.catch` never sees it and the throw takes
     * the whole window's render with it. Both of these are one line of panel;
     * neither may cost the screen.
     */
    try {
      void bridge.burnMeter().then(setBurn, () => setBurn([]));
      void bridge.trialState().then(setTrial, () => {});
    } catch {
      setBurn([]);
    }
    void bridge.recentWork(500).then((found) => {
      const sessions = found as WorkSession[];
      const ends = sessions
        .map((s) => s.endedAt)
        .filter((n): n is number => typeof n === "number");
      setReach(ends.length > 0 ? [Math.min(...ends), Math.max(...ends)] : null);
      setReading(new Set(sessions.map((s) => s.source ?? "claude-code")).size);
      setRecent(
        [...sessions]
          .filter((s) => typeof s.endedAt === "number")
          .sort((x, y) => y.endedAt - x.endedAt)
          .slice(0, 6),
      );
    });
  }, [bridge]);

  return (
    <>
      {/*
       * ── A greeting with something in it ──────────────────────────────────
       *
       * "Welcome back" alone is a label. The date and the time of day are the
       * two things a person can check against reality the moment the window
       * opens, which is what makes a greeting read as the app being awake
       * rather than as decoration.
       *
       * Set like the website's headlines: Geist, semibold, tracked in hard. It
       * was a serif here once, which made this the one screen of Sidq that did
       * not look like Sidq.
       */}
      <p className="text-[0.8125rem] text-[var(--w-text-3)]">{today()}</p>
      <h1 className="mt-2 font-display text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.05em] text-[var(--w-text)]">
        {salutation()}
      </h1>
      <p className="mt-3 max-w-[54ch] text-[1rem] leading-relaxed text-[var(--w-text-3)]">
        {reading > 0 ? (
          <>
            Your AIs are on the same page. Sidq is reading{" "}
            <span className="text-[var(--w-text)]">{reading}</span>{" "}
            of them on this Mac, and nothing here has left it.
          </>
        ) : (
          <>
            Open any AI you use and Sidq starts remembering. Nothing it reads
            leaves this Mac.
          </>
        )}
      </p>

      <MemoryCard
        conversations={stats[0]}
        messages={stats[1]}
        hours={hoursRead}
        reading={reading}
      />

      {/*
       * ── Working for you ──────────────────────────────────────────────────
       *
       * Second on the screen, above the history, because this is the product.
       * Every one of these happens without the window being open: a new chat
       * briefed, a conversation grabbed with two taps, Claude Code handed what
       * you said elsewhere. They used to be scattered across a sidebar card, a
       * footnote and two buttons at the bottom of the page, which is how a
       * person with Sidq running for a month could still not know it did them.
       */}
      <Autopilot bridge={bridge} taps={taps} />

      <Across sessions={recent} />

      {/*
       * The week, in one line and whatever stopped you. The handovers
       * themselves have a tab of their own now; this is the count and the
       * argument, not the list.
       */}
      <section aria-labelledby="week" className="mt-12">
        <SectionHead
          id="week"
          title="This week"
          note={`${(plan?.handoversUsed ?? 0).toLocaleString()} handovers in the last 7 days`}
        />

        {/*
         * ── What stopped you this week, and how far back it reads ─────────
         *
         * The one line on this screen that is about somebody else's product
         * rather than this one, and the only number here that is an argument.
         * Read out of this machine's own transcripts by `burn`, so it is
         * arithmetic rather than a claim, and simply absent on a week when
         * nothing stopped: an empty meter is not a zero, it is nothing to
         * report.
         */}
        {(burn.length > 0 || reach) && (
          <div className="mt-4 space-y-1.5">
            {burn.map((b) => (
              <p
                key={b.label}
                className="text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]"
              >
                <span className="font-medium text-[var(--w-text)]">
                  {b.label}
                </span>{" "}
                cut you off {b.walls === 1 ? "once" : `${b.walls} times`} this
                week. Longest run before it did:{" "}
                <span className="font-medium text-[var(--w-text)]">
                  {b.medianMinutes} minutes
                </span>
                .
              </p>
            ))}
            {reach && (
              <p className="text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]">
                Read back to {new Date(reach[0]).toLocaleDateString()}. Last
                read {whenLabel(reach[1])}.
              </p>
            )}
          </div>
        )}
      </section>

      {/*
       * ── The trial, where somebody is already looking at their plan ──────
       *
       * Below the record rather than over the window. What ends on day six is
       * real but narrow, so a blocking modal announcing it would be announcing
       * something most people cannot feel; see the note in TrialNotice. Draws
       * nothing for an account that pays.
       */}
      <div className="mt-10 empty:hidden">
        <TrialNotice
          daysLeft={trial[0]}
          totalDays={trial[1]}
          paid={(plan?.plan ?? "free") !== "free"}
          onUpgrade={() => void bridge?.openUpgrade()}
        />
      </div>

    </>
  );
}

/**
 * Everything Sidq does with nobody pressing anything, in one list.
 *
 * Three kinds of row, and each says which it is on the right: a switch for the
 * ones that change what happens in another program, the keys for the ones that
 * are a gesture, and "Always on" for the ones that simply are. The brief is on
 * by default (see `ambient::brief_wanted`); recall and relay are off until
 * switched on here, because both change what another program does.
 *
 * Each switch is absent until its state has been read, so none of them ever
 * shows the wrong position; a row whose state is still loading is left out
 * rather than drawn guessing.
 */
function Autopilot({
  bridge,
  taps,
}: {
  bridge: ReturnType<typeof desktopBridge>;
  taps: [string, string] | null;
}) {
  const [brief, setBrief] = useState<boolean | null>(null);
  const [recall, setRecall] = useState<boolean | null>(null);
  const [relay, setRelay] = useState<{ on: boolean; agent: string | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /*
   * The key the picker actually got. ⌘⇧K is only the first choice: when
   * another app owns it Sidq takes the next free one, and a row that still
   * said ⌘⇧K sent people to press a key that did nothing.
   */
  const [picker, setPicker] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!bridge) return;
    /*
     * Wrapped like the burn meter: a bridge from an older build has no
     * `brief`, and a synchronous throw here would take the whole screen.
     */
    try {
      void bridge.brief().then(setBrief, () => setBrief(null));
    } catch {
      setBrief(null);
    }
    void bridge.recall().then(setRecall);
    void bridge.relay().then(setRelay);
    void bridge.pickerShortcut().then(setPicker, () => setPicker(null));
  }, [bridge]);

  return (
    <section aria-labelledby="for-you" className="mt-12">
      <SectionHead
        id="for-you"
        title="Working for you"
        note="Runs on this Mac, with nothing to press"
      />
      <ul className="mt-4 divide-y divide-[var(--w-line)] border-y border-[var(--w-line)]">
        {brief !== null && (
          <AutoRow
            title="Every new chat starts briefed"
            body={
              brief
                ? "On. Open a blank chat in ChatGPT, Claude or Gemini and the project you were last in is already in the box, unsent. ⌘Z takes it out."
                : "Off. New chats start empty. Turn it on and the project you were last in is waiting in the box of every blank chat, unsent."
            }
          >
            <Toggle
              on={brief}
              onChange={(next) => {
                setProblem(null);
                void bridge?.setBrief(next).then((ok) => {
                  if (ok) setBrief(next);
                  else setProblem("Could not save that. Try again in a moment.");
                });
              }}
            />
          </AutoRow>
        )}

        {/*
         * The gesture, where somebody who already finished setup can find it.
         *
         * Read from Rust rather than written here: which key does what is a
         * setting, and a hard-coded one starts lying the moment it changes.
         */}
        {taps && (
          <AutoRow
            title="Grab the chat you are in"
            body={
              <>
                Double-tap <Chip>{taps[0]}</Chip> to grab the conversation you
                were just in, then open a new chat in any AI and it lands there,
                unsent. <Chip>{taps[1]}</Chip> twice puts the last one back.
              </>
            }
          >
            <span className="text-[0.75rem] text-[var(--w-text-3)]">Always on</span>
          </AutoRow>
        )}

        <AutoRow
          title="Carry any conversation anywhere"
          body={
            picker === null
              ? "Another app owns every shortcut Sidq tried, so this one has no key. Click the dot at the top of the screen to open the picker."
              : "Opens the picker over whatever you are in. Pick a conversation and the next AI gets it, with what you decided."
          }
        >
          {picker !== undefined && <Keys>{picker ?? "none"}</Keys>}
        </AutoRow>

        {recall !== null && (
          <AutoRow
            title="Claude Code knows what you said elsewhere"
            body={
              recall
                ? "On. Every time you send Claude Code a message, Sidq finds what you said about the same thing in Cursor, ChatGPT or an older session and hands Claude up to three of those turns, quoted. Found on this Mac; nothing is sent anywhere."
                : "Off. Turn it on and Claude Code reads the relevant parts of your other conversations before it answers, with nothing pressed or pasted."
            }
          >
            <Toggle
              on={recall}
              onChange={(next) => {
                setProblem(null);
                void bridge?.setRecall(next).then((ok) => {
                  if (ok) setRecall(next);
                  else
                    setProblem(
                      "Could not change Claude Code's settings. Either Sidq's helper is missing from this build, or ~/.claude/settings.json is not valid JSON.",
                    );
                });
              }}
            />
          </AutoRow>
        )}

        {relay !== null && (
          <AutoRow
            title="When Claude Code hits its limit, carry on in Codex"
            body={
              !relay.agent
                ? "Codex is not installed on this Mac, so there is nothing to carry on in."
                : relay.on
                  ? "On. When Claude Code stops for a limit, Sidq writes the conversation to a file and opens Codex in the same folder, in Terminal, told to read it and continue. Codex's own approval settings still apply."
                  : "Off. When Claude Code stops, Sidq offers the conversation to carry somewhere else, and you choose."
            }
          >
            <Toggle
              on={relay.on}
              disabled={!relay.agent}
              onChange={(next) => {
                setProblem(null);
                void bridge?.setRelay(next).then((ok) => {
                  if (ok) setRelay({ ...relay, on: next });
                  else setProblem("Could not save that. Try again in a moment.");
                });
              }}
            />
          </AutoRow>
        )}
      </ul>
      {problem && (
        <p role="alert" className="mt-3 text-[0.8125rem] text-[var(--w-danger)]">
          {problem}
        </p>
      )}
    </section>
  );
}


/* ── Plan ─────────────────────────────────────────────────────────────────── */

/**
 * What this account is on, and what that allows.
 *
 * Every figure comes from `plan_status`, which is Rust reporting the same
 * numbers it enforces. Nothing on this panel is written down twice: if the
 * limit changes in `entitlement.rs`, this changes with it.
 *
 * There is no "manage subscription" button because there is nothing behind one.
 * Sidq has no billing portal, and a button that opens a page that cannot cancel
 * anything is worse than saying where the receipt is.
 */
function Plan({
  bridge,
  plan,
}: {
  bridge: ReturnType<typeof desktopBridge>;
  plan: PlanStatus | null;
}) {
  if (!plan) {
    return (
      <>
        <PanelHead
          title="Plan"
          lead={
            bridge
              ? "Checking your plan…"
              : "Your plan lives in the Sidq app. Open it there."
          }
        />
      </>
    );
  }

  const free = plan.plan === "free";

  return (
    <>
      <PanelHead
        eyebrow={
          plan.handoversCap == null
            ? `${plan.handoversUsed} handovers this week`
            : `${Math.max(plan.handoversCap - plan.handoversUsed, 0)} of ${plan.handoversCap} left this week`
        }
        title={<span className="capitalize">{plan.plan}</span>}
      />

      <dl className="mt-8 max-w-[34rem] divide-y divide-black/[0.07] border-y border-[var(--w-line)]">
        <Row
          term="Handovers a week"
          detail={
            plan.handoversCap == null
              ? "Unlimited"
              : `${plan.handoversUsed} of ${plan.handoversCap} used`
          }
        />
        <Row
          term="Search reaches back"
          detail={
            plan.historyDays == null ? "Everything" : `${plan.historyDays} days`
          }
        />
        <Row
          term="Conversations kept"
          detail="On this Mac, always. Nothing is uploaded."
        />
      </dl>

      {free ? (
        <div className="mt-8">
          <button
            onClick={() => void bridge?.openUpgrade()}
            className={cn(
              "rounded-lg px-3.5 py-2 text-[0.8125rem] font-medium",
              "bg-[var(--w-invert)] text-[var(--w-on-invert)] transition-opacity duration-150",
              "cursor-pointer hover:opacity-90",
            )}
          >
            See the plans
          </button>
          {/*
           * This said "raise the free limit without paying: every friend who
           * joins with your code adds handovers to both of your weeks". There
           * is no free limit left to raise — every meter came out of
           * entitlement.rs — so it offered a reward for doing a favour that
           * buys nothing, to a person who is not being limited.
           *
           * What free is missing now is not capacity, it is the automatic
           * half, so that is what the line says.
           */}
          <p className="mt-3 max-w-[52ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-4)]">
            Everything here is yours already. What Pro adds is that you stop
            doing it: one conversation carried across every model, so whichever
            assistant you open next already knows where this got to.
          </p>
        </div>
      ) : (
        <p className="mt-8 max-w-[52ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-4)]">
          Billing is handled by Stripe. The receipt in your email has the link
          to change or cancel it.
        </p>
      )}
    </>
  );
}

/** One line of a plan. A definition list, because that is what this is. */
function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <dt className="text-[0.875rem] text-[var(--w-text-3)]">{term}</dt>
      <dd className="text-right text-[0.875rem] text-[var(--w-text)]">
        {detail}
      </dd>
    </div>
  );
}

/**
 * Whether a stated problem is "you have no account", as opposed to a network
 * that is down or a profile row that has not been written yet.
 *
 * Matched on the sentence rather than a code, because the sentence is the whole
 * contract between `invites.rs` and this panel — there is no code to match on.
 * Getting it wrong shows a sign-in button to somebody who is already signed in,
 * which is a wasted click, not a broken screen; the button is additive and Try
 * again is always there.
 */
function needsAccount(problem: string): boolean {
  return /sign in/i.test(problem);
}

/**
 * When the bonus next drops, said as a person would say it.
 *
 * An empty string means nothing is currently being paid for, which is not the
 * same as expiring now and must not read as a date.
 */
function lapses(expires: string): string {
  if (!expires) return "";

  const days = Math.ceil((new Date(expires).getTime() - Date.now()) / DAY_MS);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return ", lapsing today";
  if (days === 1) return ", until tomorrow";
  return `, for ${days} more days`;
}

/* ── Invite ───────────────────────────────────────────────────────────────── */

/**
 * Your code, and what it has actually earned.
 *
 * The offer is stated with numbers the server sent rather than numbers typed
 * into this file, because the database is what pays them out: `invite_bonus` in
 * 0007_invites.sql decides the amount, `entitlement.rs` adds it to the weekly
 * allowance, and this only reads. A referral page whose promise and payout are
 * maintained separately is a referral page that eventually lies.
 *
 * Both sides of the failure are visible. There is no code without an account,
 * and no way to fetch one offline, so those say so instead of showing a blank
 * box that looks like a bug.
 */
function Invite({
  bridge,
  signedInAt,
}: {
  bridge: ReturnType<typeof desktopBridge>;
  /** Changes when a sign-in lands, which is the cue to ask again. */
  signedInAt: number;
}) {
  const [summary, setSummary] = useState<InviteSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [entry, setEntry] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [failure, setFailure] = useState("");
  const [opening, setOpening] = useState(false);

  /*
   * A missing bridge is an answer, not a pause.
   *
   * `/home` is a public route on the site as well as the desktop window, and
   * outside the app there is no Rust to ask. Returning early left the panel on
   * "Reading your invites…" forever, which is the one thing this panel was
   * written not to do.
   */
  const load = useCallback(() => {
    if (!bridge) {
      setSummary({
        code: "",
        invited: 0,
        bonus: 0,
        redeemed: false,
        each: 0,
        most: 0,
        thisWeek: 0,
        perWeek: 0,
        expires: "",
        problem: "Invites live in the Sidq app. Open it there.",
      });
      return;
    }
    /*
     * ── Renew the session before asking, and again before giving up ──────────
     *
     * Rust calls Supabase with whatever token this window last handed it, and
     * holds no refresh token of its own, deliberately. So a lapsed token is not
     * something Rust can fix and not something the person did — but it surfaced
     * here as the panel printing "JWT expired" over a Try again button that
     * would fail in exactly the same way, because asking twice does not renew
     * anything.
     *
     * `shareSessionWithDesktop` renews it in passing, since `getSession` does.
     * Doing it before the call covers the common case; doing it again after an
     * auth failure and retrying once covers the token that lapsed between the
     * two. Anything still failing after that is a real problem and is shown.
     */
    void shareSessionWithDesktop()
      .catch(() => {})
      .then(() => bridge.inviteSummary())
      .then(async (first) => {
        if (!isAStaleSession(first.problem)) return first;
        await shareSessionWithDesktop().catch(() => {});
        return bridge.inviteSummary();
      })
      .then(setSummary);
  }, [bridge]);

  useEffect(load, [load, signedInAt]);

  if (summary === null) {
    return (
      <p className="text-[0.875rem] text-[var(--w-text-4)]">
        Reading your invites&hellip;
      </p>
    );
  }

  if (summary.problem) {
    return (
      <>
        <PanelHead title="Invite a friend" lead={summary.problem} />

        {/*
         * "Sign in to get your invite code", and then only a Try again button,
         * which asks the same question and gets the same answer. Sign-in used
         * to live entirely in setup, so an account that skipped it had nowhere
         * in the app to make one. Saying what is wrong without offering the
         * one action that fixes it is worse than not saying it.
         */}
        <div className="mt-5 flex items-center gap-2.5">
          {needsAccount(summary.problem) && (
            <button
              onClick={() => {
                setOpening(true);
                void bridge?.openSignIn().catch((err: unknown) => {
                  setOpening(false);
                  setSummary({
                    ...summary,
                    problem: err instanceof Error ? err.message : String(err),
                  });
                });
              }}
              className={cn(
                "rounded-lg bg-[var(--w-invert)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--w-on-invert)]",
                "cursor-pointer transition-opacity duration-150 hover:opacity-85",
                opening && "pointer-events-none opacity-60",
              )}
            >
              {opening ? "Waiting for the browser…" : "Sign in"}
            </button>
          )}
          <button
            onClick={load}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium",
              "bg-[var(--w-raised)] text-[var(--w-text)] ring-1 ring-inset ring-[var(--w-line)]",
              "cursor-pointer transition-colors duration-150 hover:bg-[var(--w-line)]",
            )}
          >
            Try again
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHead
        eyebrow={`${summary.thisWeek} of ${summary.perWeek} used this week`}
        title="Invite a friend"
      />
      {/*
       * The offer, and the fact that it runs out, in the same breath.
       *
       * It used to say "permanently", which paid once and kept paying: invite
       * five friends in your first week and you are on a better free plan for
       * the life of the account, with no reason to invite anybody again or to
       * ever pay. It is a rolling week now, so keeping the lift means bringing
       * somebody new — and the number of numbers here is the reason this is
       * one sentence rather than a table.
       */}
      <p className="mt-3 max-w-[54ch] text-[0.875rem] leading-relaxed text-[var(--w-text-3)]">
        Anyone who signs up with your code adds {summary.each} handovers a week
        to your account and {summary.each} to theirs, for the next seven days.
        Up to {summary.perWeek} friends a week.
      </p>

      {/* The code, at the size of the thing you are meant to read off a screen
          and say out loud. It has no O, I or L in it for the same reason. */}
      <div className="mt-8 flex max-w-[34rem] items-center gap-3">
        <span
          className={cn(
            "flex-1 rounded-[10px] border border-[var(--w-line)] px-4 py-3",
            "font-display text-[1.5rem] tracking-[0.18em] text-[var(--w-text)]",
          )}
        >
          {summary.code}
        </span>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(summary.code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), COPIED_FOR_MS);
            });
          }}
          className={cn(
            "shrink-0 rounded-lg px-3.5 py-2 text-[0.8125rem] font-medium",
            "bg-[var(--w-invert)] text-[var(--w-on-invert)] transition-opacity duration-150",
            "cursor-pointer hover:opacity-90",
          )}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <dl className="mt-8 max-w-[34rem] divide-y divide-black/[0.07] border-y border-[var(--w-line)]">
        <Row
          term="People who used it"
          detail={
            summary.invited === 0 ? "Nobody yet" : String(summary.invited)
          }
        />
        <Row
          term="This week"
          detail={
            summary.thisWeek >= summary.perWeek && summary.perWeek > 0
              ? `${summary.thisWeek} of ${summary.perWeek}, full until one lapses`
              : `${summary.thisWeek} of ${summary.perWeek}`
          }
        />
        <Row
          term="Extra handovers a week"
          detail={
            summary.bonus === 0
              ? "None right now"
              : `+${summary.bonus}${lapses(summary.expires)}`
          }
        />
      </dl>

      {/* Redeeming is offered once and then gone, because it can only happen
          once: the invitee is the primary key of the referrals table. */}
      {!summary.redeemed && (
        <div className="mt-10 max-w-[34rem]">
          <h2 className="text-[0.6875rem] tracking-[0.08em] text-[var(--w-text-3)]">
            SOMEBODY GAVE YOU A CODE?
          </h2>
          <form
            className="mt-3 flex items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!bridge || entry.trim().length === 0) return;
              setRedeeming(true);
              setFailure("");
              void bridge
                .redeemInvite(entry.trim().toUpperCase())
                .then(() => {
                  setEntry("");
                  load();
                })
                // Rust hands back the sentence the database wrote, which names
                // what is actually wrong with the code that was typed.
                .catch((err: unknown) =>
                  setFailure(err instanceof Error ? err.message : String(err)),
                )
                .finally(() => setRedeeming(false));
            }}
          >
            <input
              value={entry}
              onChange={(e) => setEntry(e.target.value.toUpperCase())}
              spellCheck={false}
              autoCapitalize="characters"
              placeholder="Their code"
              className={cn(
                "min-w-0 flex-1 rounded-[10px] border border-[var(--w-line)] bg-transparent",
                "px-4 py-2.5 text-[0.9375rem] tracking-[0.14em] text-[var(--w-text)]",
                "placeholder:tracking-normal placeholder:text-[var(--w-text-6)]",
                "outline-none transition-colors duration-150 focus:border-[var(--w-accent)]/60",
              )}
            />
            <button
              type="submit"
              disabled={redeeming || entry.trim().length === 0}
              className={cn(
                "shrink-0 rounded-lg px-3.5 py-2 text-[0.8125rem] font-medium",
                "bg-[var(--w-raised)] text-[var(--w-text)] ring-1 ring-inset ring-[var(--w-line)]",
                "transition-colors duration-150",
                redeeming || entry.trim().length === 0
                  ? "cursor-default opacity-40"
                  : "cursor-pointer hover:bg-[var(--w-line)] hover:text-[var(--w-text)]",
              )}
            >
              {redeeming ? "Checking\u2026" : "Use it"}
            </button>
          </form>
          {failure && (
            <p className="mt-2.5 text-[0.8125rem] text-[var(--w-danger)]">
              {failure}
            </p>
          )}
        </div>
      )}
    </>
  );
}

/* ── How you work ─────────────────────────────────────────────────────────── */

/**
 * The instructions you have given assistants, collected in one place.
 *
 * Every line is a sentence taken word for word out of one of your own turns.
 * Nothing here is generated or paraphrased, which is why each one is shown as a
 * quotation with a count next to it rather than as a claim about you: the count
 * is the evidence, and you can see for yourself whether it is right.
 */
/**
 * What you are working on, per project.
 *
 * The sibling of "How you work". That one answers what you tell every assistant
 * about everything; this answers what one thing has actually involved — and it
 * is assembled the same way, out of sentences already on this machine, with the
 * count beside each because the count is why the line is there.
 *
 * "Send to" is the difference from a handover. Nothing has to be picked: you are
 * working on a thing, and the assistant is told what the thing is.
 */
function Projects({ bridge }: { bridge: ReturnType<typeof desktopBridge> }) {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [memory, setMemory] = useState<ProjectMemory | null>(null);
  const [assistants, setAssistants] = useState<{ id: string; label: string }[]>(
    [],
  );
  /*
   * Whether there is a team folder at all, asked once rather than per project.
   * Rust refuses the call either way, so a wrong answer costs a button that
   * does nothing rather than a project somewhere it should not be.
   */
  const [sharedWith, setSharedWith] = useState<string | null>(null);
  const [team, setTeam] = useState<SharedProject[]>([]);
  /*
   * The public link for the chosen project, when it has one.
   *
   * `undefined` while unknown and `null` for "not published", because those are
   * different and rendering "Publish" at a project that is already public would
   * be the window lying about where somebody's work is.
   */
  const [link, setLink] = useState<string | null | undefined>(undefined);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    void bridge.teamProjects().then(setTeam);
    void bridge.projects().then((found) => {
      setRows(found);
      setChosen((was) => was ?? found[0]?.path ?? null);
    });
    void bridge.assistantList().then(setAssistants);
  }, [bridge]);

  useEffect(() => {
    if (!bridge || !chosen) return;
    setMemory(null);
    setLink(undefined);
    void bridge.projectMemory(chosen).then(setMemory);
    void bridge.memoryLink(chosen).then(setLink);
  }, [bridge, chosen]);

  const heading = <PanelHead title="What you're on" />;

  if (rows === null) {
    return (
      <>
        {heading}
        <p className="mt-4 text-[0.875rem] text-[var(--w-text-4)]">
          Reading your conversations&hellip;
        </p>
      </>
    );
  }

  /*
   * Empty says empty, and says why.
   *
   * A browser conversation has no project — it is filed under the assistant,
   * which is not a place — so this fills up from work done in an editor or a
   * terminal. Somebody who only uses ChatGPT should be told that rather than
   * left wondering what is broken.
   */
  if (rows.length === 0) {
    return (
      <>
        {heading}
        <p className="mt-4 max-w-[56ch] text-[0.875rem] leading-relaxed text-[var(--w-text-4)]">
          Nothing yet. This fills up from work done somewhere with a folder:
          Claude Code, Cursor, Codex. Conversations in a browser are filed under
          the assistant rather than a project, so they do not appear here.
        </p>
      </>
    );
  }

  return (
    <>
      {heading}

      <div className="mt-4 flex flex-wrap gap-2">
        {rows.map((row) => (
          <button
            key={row.path}
            onClick={() => setChosen(row.path)}
            title={row.path}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium",
              "cursor-pointer transition-colors duration-150",
              row.path === chosen
                ? "bg-[var(--w-invert)] text-[var(--w-on-invert)]"
                : "bg-[var(--w-raised)] text-[var(--w-text)] ring-1 ring-inset ring-[var(--w-line)] hover:bg-[var(--w-line)]",
            )}
          >
            {row.name}
            <span className="ml-2 tabular-nums opacity-60">
              {row.conversations}
            </span>
          </button>
        ))}
      </div>

      {memory && (
        <div className="mt-7">
          <p className="text-[0.875rem] text-[var(--w-text-3)]">
            {memory.conversations} conversations,{" "}
            {memory.turns.toLocaleString()} exchanges, about{" "}
            {Math.round(memory.minutes / 60)} hours
            {memory.assistants.length > 0 &&
              ` in ${memory.assistants.join(", ")}`}
            .
          </p>

          {memory.openedWith && (
            <Quoted label="It started with" text={memory.openedWith} />
          )}
          {memory.lastOn && (
            <Quoted label="Where it got to" text={memory.lastOn} />
          )}

          {memory.recentWork.length > 0 && (
            <>
              <p className="mt-6 text-[0.75rem] uppercase tracking-[0.16em] text-[var(--w-text-5)]">
                What has been worked on
              </p>
              <ul className="mt-2 space-y-px">
                {memory.recentWork.map((title) => (
                  <li
                    key={title}
                    className="truncate rounded-[10px] px-3 py-2 text-[0.875rem] text-[var(--w-text)]"
                  >
                    {title}
                  </li>
                ))}
              </ul>
            </>
          )}

          {memory.decisions.length > 0 && (
            <>
              <p className="mt-6 text-[0.75rem] uppercase tracking-[0.16em] text-[var(--w-text-5)]">
                Decided along the way
              </p>
              {/*
               * What the number beside each line means.
               *
               * It went unlabelled while every decision had to appear in two
               * conversations to be listed at all. Now that one is enough, a 1
               * sits next to a 4 with nothing saying they are the same kind of
               * thing measured — and an unexplained number next to somebody's
               * own sentence reads like a score being given to it.
               */}
              <p className="mt-1 max-w-[52ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]">
                Your sentences, newest first, never reworded. The number is how
                many separate conversations you said it in.
              </p>
              <ul className="mt-2 space-y-px">
                {memory.decisions.map((d) => (
                  <li
                    key={d.text}
                    className="flex items-baseline gap-4 rounded-[10px] px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1 text-[0.875rem] text-[var(--w-text)]">
                      {d.text}
                    </span>
                    <span className="shrink-0 text-[0.75rem] tabular-nums text-[var(--w-text-5)]">
                      {d.conversations}&times;
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {assistants.length > 0 && (
            <div className="mt-7 border-t border-[var(--w-line)] pt-5">
              <p className="text-[0.875rem] font-medium text-[var(--w-text)]">
                Put this in front of an AI
              </p>
              <p className="mt-1.5 max-w-[56ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]">
                It opens in Sidq with everything above already in the box.
                Nothing is sent until you press return.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {assistants.map((a) => (
                  <button
                    key={a.id}
                    onClick={() =>
                      chosen && void bridge?.memoryInto(chosen, a.id)
                    }
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium",
                      "bg-[var(--w-raised)] text-[var(--w-text)] ring-1 ring-inset ring-[var(--w-line)]",
                      "cursor-pointer transition-colors duration-150 hover:bg-[var(--w-line)]",
                    )}
                  >
                    {a.label}
                  </button>
                ))}

                {/*
                 * Sharing a project is a different act from putting it in front
                 * of an assistant, so it is a different button rather than one
                 * more entry in the same row of AIs. It also only ever happens
                 * because somebody pressed it — nothing publishes on a timer.
                 */}
                <button
                  onClick={() => {
                    if (!chosen) return;
                    void bridge?.shareProject(chosen).then((ok) => {
                      if (!ok) return;
                      setSharedWith(chosen);
                      void bridge?.teamProjects().then(setTeam);
                    });
                  }}
                  className={cn(
                    "ml-auto rounded-lg border border-[var(--w-line)] px-3 py-1.5",
                    "text-[0.8125rem] text-[var(--w-text-3)]",
                    "cursor-pointer transition-colors duration-150 hover:border-[var(--w-text)] hover:text-[var(--w-text)]",
                  )}
                >
                  {sharedWith === chosen
                    ? "Shared with team"
                    : "Share with team"}
                </button>
              </div>

              {/*
               * ── Publishing to a link, which is the one thing that leaves ───
               *
               * Kept apart from the row of assistants and from the team
               * button, both of which stay on this machine or inside a folder
               * the team already syncs. This one puts text on the internet, so
               * it says so in the sentence next to it rather than in a tooltip
               * or a policy nobody opens, and it never happens without a press.
               *
               * Hidden entirely while the link is unknown. Offering "Publish"
               * to a project that turns out to already be public is the one
               * mistake this control must not make.
               */}
              {link !== undefined && (
                <div className="mt-4 border-t border-[var(--w-line)] pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="max-w-[52ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-4)]">
                      {link
                        ? "This memory is on the internet. Anyone with the link can read it, and taking it down removes the page."
                        : "Put this memory on a link you can send. It leaves your Mac, so read it first. Nothing else here does."}
                    </p>
                    <button
                      disabled={publishing}
                      onClick={() => {
                        if (!chosen) return;
                        setPublishing(true);
                        const done = () => setPublishing(false);
                        if (link) {
                          void bridge
                            ?.unshareMemory(chosen)
                            .then(() => setLink(null))
                            .finally(done);
                        } else {
                          void bridge
                            ?.shareMemory(chosen)
                            .then((made) => {
                              setLink(made);
                              // Straight to the clipboard. The reason to make a
                              // link is to send it, and a link you then have to
                              // go and select is a second step for no reason.
                              if (made)
                                void navigator.clipboard?.writeText(made);
                            })
                            .finally(done);
                        }
                      }}
                      className={cn(
                        "shrink-0 rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium",
                        "cursor-pointer transition-colors duration-150 disabled:opacity-50",
                        link
                          ? "border border-[var(--w-line)] text-[var(--w-text-3)] hover:border-[var(--w-text)] hover:text-[var(--w-text)]"
                          : "bg-[var(--w-invert)] text-[var(--w-on-invert)] hover:opacity-90",
                      )}
                    >
                      {publishing
                        ? "Working\u2026"
                        : link
                          ? "Unpublish"
                          : "Publish to a link"}
                    </button>
                  </div>

                  {link && (
                    <p className="mt-2 truncate font-mono text-[0.75rem] text-[var(--w-text-5)]">
                      {link}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {team.length > 0 && (
            <div className="mt-7 border-t border-[var(--w-line)] pt-5">
              <p className="text-[0.875rem] font-medium text-[var(--w-text)]">
                From your team
              </p>
              <ul className="mt-3 space-y-px">
                {team.map((row) => (
                  <li
                    key={row.path}
                    className="flex items-baseline gap-4 rounded-[10px] px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1 text-[0.875rem] text-[var(--w-text)]">
                      {row.name}
                      <span className="ml-2 text-[var(--w-text-5)]">
                        {row.mine ? "you" : row.who}
                      </span>
                    </span>
                    <button
                      onClick={() =>
                        void bridge?.readTeamProject(row.path).then((text) => {
                          if (text) void navigator.clipboard.writeText(text);
                        })
                      }
                      className={cn(
                        "shrink-0 rounded-md px-2 py-1 text-[0.75rem]",
                        "cursor-pointer text-[var(--w-text-3)] transition-colors duration-150",
                        "hover:bg-[var(--w-invert)] hover:text-[var(--w-on-invert)]",
                      )}
                    >
                      Copy
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** One quoted line with what it is, for the two ends of a project's arc. */
function Quoted({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-4">
      <p className="text-[0.75rem] uppercase tracking-[0.16em] text-[var(--w-text-5)]">
        {label}
      </p>
      <p className="mt-1.5 max-w-[64ch] text-[0.875rem] leading-relaxed text-[var(--w-text)]">
        {text}
      </p>
    </div>
  );
}

function Profile({ bridge }: { bridge: ReturnType<typeof desktopBridge> }) {
  const [facts, setFacts] = useState<ProfileFact[] | null>(null);
  const [preamble, setPreamble] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    void bridge.memoryProfile().then(([found, text]) => {
      setFacts(found);
      setPreamble(text);
    });
  }, [bridge]);

  const heading = (
    <PanelHead
      eyebrow={
        facts && facts.length > 0
          ? `${facts.length} taken from your own messages`
          : undefined
      }
      title="How you work"
    />
  );

  if (facts === null) {
    return (
      <>
        {heading}
        <p className="mt-4 text-[0.875rem] text-[var(--w-text-4)]">
          Reading your conversations&hellip;
        </p>
      </>
    );
  }

  /*
   * Nothing found says nothing found.
   *
   * The alternative is a handful of vague lines dressed up as a profile, and
   * the first wrong one costs the whole feature its credibility.
   */
  if (facts.length === 0) {
    return (
      <>
        {heading}
        <p className="mt-4 max-w-[56ch] text-[0.875rem] leading-relaxed text-[var(--w-text-4)]">
          Empty, and it should be. This builds itself out of the rules you
          repeat and the stack you keep re-explaining, counting only sentences
          you actually typed. Have a few real conversations and it will have
          something to say.
        </p>
      </>
    );
  }

  return (
    <div>
      {heading}
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        {/*
         * That these already ride along was the best-kept secret in the app.
         *
         * This said "paste it at the top of a new conversation", which
         * describes a copy-paste tool and is the smaller half of what happens:
         * every handover already carries the repeated ones, under a heading
         * telling the receiving model to apply them. Somebody watching a demo
         * suggested building the thing it has done since it shipped, which is
         * what an invisible feature looks like from outside.
         *
         * The count on each row is what decides it, so the rule is stated
         * against the thing that shows it rather than in a tooltip.
         */}
        <p className="max-w-[56ch] text-[0.875rem] leading-relaxed text-[var(--w-text-3)]">
          Taken word for word from your own messages, across every AI. The ones
          you have repeated in more than one conversation ride along with every
          handover, up to eight, so the next AI has them before it reads a line.
          Copy them when you are starting somewhere by hand.
        </p>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(preamble).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), COPIED_FOR_MS);
            });
          }}
          className={cn(
            "shrink-0 rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium",
            "bg-[var(--w-invert)] text-[var(--w-on-invert)] transition-opacity duration-150",
            "cursor-pointer hover:opacity-90",
          )}
        >
          {copied ? "Copied" : "Copy as a preamble"}
        </button>
      </div>

      <ul className="mt-6 space-y-px">
        {facts.map((fact) => (
          <li
            key={fact.text}
            className={cn(
              "flex items-baseline gap-4 rounded-[10px] px-3 py-2.5",
              "transition-[transform,translate,scale,background-color] duration-150",
              "hover:-translate-y-px hover:bg-[var(--w-raised)]",
            )}
          >
            <span className="min-w-0 flex-1 text-[0.875rem] leading-relaxed text-[var(--w-text)]">
              {fact.text}
            </span>
            {/*
             * The count, not a badge saying "important".
             *
             * Said in six conversations is a fact about the transcripts and
             * can be checked. Any label we invented on top of it could not.
             */}
            <span className="shrink-0 text-[0.75rem] tabular-nums text-[var(--w-text-5)]">
              {fact.conversations === 1
                ? "once"
                : `${fact.conversations} conversations`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Switch to light. A disc with eight strokes, at the size the sidebar wants. */
function SunIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="3.4" />
      <path d="M9 1.6v1.6M9 14.8v1.6M1.6 9h1.6M14.8 9h1.6M3.8 3.8l1.1 1.1M13.1 13.1l1.1 1.1M14.2 3.8l-1.1 1.1M4.9 13.1l-1.1 1.1" />
    </svg>
  );
}

/** Switch to dark. One path: a disc with a bite out of it. */
function MoonIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 10.6A6.4 6.4 0 0 1 7.4 3a6.6 6.6 0 1 0 7.6 7.6Z" />
    </svg>
  );
}

/* ── Your team ────────────────────────────────────────────────────────────── */

/** The first name taken from the signed-in account at sign-in. Blank if unknown. */
function accountName(): string {
  try {
    return localStorage.getItem("sidq.name")?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Duo, made into something.
 *
 * It sold two seats and one invoice. Asked what it did, the honest answer was
 * "you both get Sidq" — and the thing people at a demo got excited about, that
 * a team could work from one shared context, was a guess they had made about
 * the name rather than a feature. This is that guess, made true.
 *
 * Through a folder, not a server. The front page says nothing is uploaded and
 * that it works with the wifi off, and those sentences are the product; making
 * them false for the paid tier is a worse trade than any feature is worth. So
 * Sidq writes one small readable file into somewhere that already syncs and
 * reads the files its teammates' copies wrote there. Sidq opens no socket, and
 * it works between people in different countries rather than two laptops on one
 * wifi.
 */
function Team({ bridge }: { bridge: ReturnType<typeof desktopBridge> }) {
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [options, setOptions] = useState<[string, string][]>([]);
  const [nearby, setNearby] = useState<FoundTeam[]>([]);
  const [shared, setShared] = useState<SharedHandover[]>([]);
  const [typed, setTyped] = useState("");
  const [name, setName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  /*
   * ── The code, for when nothing is discoverable ───────────────────────────
   *
   * Discovery is the good path and it only works once somebody else's file has
   * already synced onto this Mac. That leaves the two cases that actually
   * happen first: being the person who starts the team, and being on a drive
   * the other person is not on. Both used to end at "pick a folder and tell
   * them which one", which is the step this removes.
   */
  const [code, setCode] = useState<string | null>(null);
  const [seats, setSeats] = useState<{ code: string; taken: boolean }[]>([]);
  const [seatCode, setSeatCode] = useState("");
  const [seatProblem, setSeatProblem] = useState<string | null>(null);
  const [joining, setJoining] = useState("");
  const [joinProblem, setJoinProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!bridge) return;
    void bridge.teamSettings().then((next) => {
      setSettings(next);
      // Empty means they have not chosen one. The account already knows a name,
      // and it is the one their co-founder would recognise.
      setName(next.name || accountName());
    });
    void bridge.teamHandovers().then(setShared);
  }, [bridge]);

  useEffect(() => {
    load();
    void bridge?.teamFolderOptions().then(setOptions);
    void bridge?.teamNearby().then(setNearby);
    void bridge?.teamCode().then(setCode);
    void bridge?.teamSeats().then(setSeats);
  }, [bridge, load]);

  const useSeat = () => {
    if (!bridge || !seatCode.trim()) return;
    setBusy(true);
    setSeatProblem(null);
    void bridge
      .redeemTeamSeat(seatCode.trim())
      .then((why) => {
        setSeatProblem(why);
        if (!why) {
          setSeatCode("");
          load();
        }
      })
      .finally(() => setBusy(false));
  };

  const start = () => {
    if (!bridge || !name.trim()) return;
    setBusy(true);
    void bridge
      .setTeamName(name.trim())
      .then(() => bridge.startTeam())
      .then((made) => {
        setCode(made);
        load();
      })
      .finally(() => setBusy(false));
  };

  const join = () => {
    if (!bridge || !name.trim()) return;
    setBusy(true);
    setJoinProblem(null);
    void bridge
      .setTeamName(name.trim())
      .then(() => bridge.joinTeam(joining.trim()))
      .then((result) => {
        if (result.joined) {
          setJoining("");
          void bridge.teamCode().then(setCode);
          load();
          return;
        }
        /*
         * Two different failures, two different sentences. A mistyped code is
         * the person's to fix; a drive that has not synced is not, and telling
         * them to check the code would send them looking in the wrong place.
         */
        setJoinProblem(
          result.understood
            ? "That code is fine, but the drive holding it has not reached this Mac yet. Accept the shared folder and try again."
            : "Six characters, no vowels. Check it and try again.",
        );
      })
      .finally(() => setBusy(false));
  };

  const heading = <PanelHead eyebrow="Team" title="Your team" />;

  if (!settings) {
    return (
      <>
        {heading}
        <p className="mt-4 text-[0.875rem] text-[var(--w-text-4)]">
          Checking&hellip;
        </p>
      </>
    );
  }

  /*
   * The plan check is Rust's answer, not this window's guess.
   *
   * Sharing is refused in `team_rules` regardless of what is on screen, so the
   * two can never disagree about whether somebody is paying for it.
   */
  if (!settings.allowed) {
    return (
      <>
        {heading}
        <p className="mt-4 max-w-[56ch] text-[0.875rem] leading-relaxed text-[var(--w-text-3)]">
          On Team, the standing instructions on your{" "}
          <strong>How you work</strong> tab are shared with the people you work
          with, and theirs with you. Every handover any of you makes then
          arrives already knowing how the team works, not just how you do.
        </p>
        <p className="mt-3 max-w-[56ch] text-[0.875rem] leading-relaxed text-[var(--w-text-4)]">
          It goes through a folder you already sync, so nothing is uploaded to
          us and it still works with the wifi off.
        </p>
      </>
    );
  }

  /*
   * The name is written before the folder, always.
   *
   * The file is named after the person, and the fallback name is the same for
   * everybody. Two co-founders who pointed at the same folder without setting
   * one would both publish `me.sidq-context.md` and silently overwrite each
   * other's rules — the worst kind of bug here, because it looks like it is
   * working and the folder only ever holds one of them.
   */
  /**
   * Start a team, or join one, with six characters.
   *
   * Rendered in the branch where no folder is set, under whatever discovery
   * managed to find. It is not an alternative to discovery so much as the half
   * discovery cannot do: somebody has to be first, and two people are often on
   * drives that have never met.
   */
  const codeSection = (
    <section className="mt-8 border-t border-[var(--w-line)] pt-6">
      <p className="text-[0.875rem] font-medium text-[var(--w-text)]">
        Or use a code
      </p>
      <p className="mt-1.5 max-w-[56ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-4)]">
        Six characters, said out loud. Nothing is uploaded: the code is the name
        of a folder in a drive you already share.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={joining}
          onChange={(e) => {
            setJoining(e.target.value);
            setJoinProblem(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") join();
          }}
          placeholder="k7fm3q"
          spellCheck={false}
          autoCapitalize="off"
          aria-label="Team code"
          className={cn(
            "w-[9rem] rounded-lg px-3 py-1.5 font-mono text-[0.875rem] tracking-widest",
            "border border-[var(--w-line)] bg-[var(--w-surface)] text-[var(--w-text)]",
            "outline-none focus:border-[var(--w-text-4)]",
          )}
        />
        <button
          onClick={join}
          disabled={busy || !joining.trim() || !name.trim()}
          className={cn(
            "rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium",
            "bg-[var(--w-invert)] text-[var(--w-on-invert)]",
            "cursor-pointer transition-opacity duration-150 hover:opacity-90",
            "disabled:cursor-default disabled:opacity-40",
          )}
        >
          Join
        </button>

        <span className="px-1 text-[0.8125rem] text-[var(--w-text-5)]">or</span>

        <button
          onClick={start}
          disabled={busy || !name.trim()}
          className={cn(
            "rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium",
            "border border-[var(--w-line)] text-[var(--w-text-3)]",
            "cursor-pointer transition-colors duration-150 hover:border-[var(--w-text)] hover:text-[var(--w-text)]",
            "disabled:cursor-default disabled:opacity-40",
          )}
        >
          Start a team
        </button>
      </div>

      {joinProblem && (
        <p
          role="alert"
          className="mt-3 max-w-[56ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]"
        >
          {joinProblem}
        </p>
      )}
    </section>
  );

  /**
   * The code this team is joined by, once it has one.
   *
   * Shown wherever the team already exists so it can be passed to the next
   * person without anybody going back to look for the folder. Absent for a
   * team set up the old way, by pointing at a folder — those still work and
   * simply have no code to show.
   */
  const codeBanner = code ? (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[12px] border border-[var(--w-line)] bg-[var(--w-raised)] px-4 py-3">
      <span className="text-[0.8125rem] text-[var(--w-text-4)]">
        Anyone joins with
      </span>
      <code className="font-mono text-[0.9375rem] tracking-widest text-[var(--w-text)]">
        {code}
      </code>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(code);
          setCopied(code);
        }}
        className="cursor-pointer text-[0.8125rem] text-[var(--w-text-3)] underline underline-offset-4 hover:text-[var(--w-text)]"
      >
        {copied === code ? "Copied" : "Copy"}
      </button>
    </div>
  ) : null;

  /**
   * Seats, for the account that bought them and for the person handed one.
   *
   * Two halves of the same thing on purpose. A buyer opening this sees the
   * codes they are paying for and which are spoken for; anybody else sees one
   * field, because being given a code is the only way most people will ever
   * meet this feature.
   *
   * The buyer's half is absent when the account has no seats rather than
   * rendering an empty list with a heading, which would read as a feature that
   * is broken instead of one that was never bought.
   */
  const seatSection = (
    <section className="mt-8 border-t border-[var(--w-line)] pt-6">
      {seats.length > 0 && (
        <>
          <p className="text-[0.875rem] font-medium text-[var(--w-text)]">
            Your seats
          </p>
          <p className="mt-1.5 max-w-[56ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-4)]">
            One code each. Sending one puts that person on Team; it stops
            working once somebody has used it.
          </p>
          <ul className="mt-3 space-y-1.5">
            {seats.map((seat) => (
              <li key={seat.code} className="flex items-center gap-3">
                <code
                  className={cn(
                    "font-mono text-[0.875rem] tracking-widest",
                    seat.taken
                      ? "text-[var(--w-text-5)] line-through"
                      : "text-[var(--w-text)]",
                  )}
                >
                  {seat.code}
                </code>
                {seat.taken ? (
                  <span className="text-[0.75rem] text-[var(--w-text-5)]">
                    taken
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      void navigator.clipboard?.writeText(seat.code);
                      setCopied(seat.code);
                    }}
                    className="cursor-pointer text-[0.8125rem] text-[var(--w-text-3)] underline underline-offset-4 hover:text-[var(--w-text)]"
                  >
                    {copied === seat.code ? "Copied" : "Copy"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p
        className={cn(
          "text-[0.875rem] font-medium text-[var(--w-text)]",
          seats.length > 0 && "mt-6",
        )}
      >
        Given a seat?
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={seatCode}
          onChange={(e) => {
            setSeatCode(e.target.value);
            setSeatProblem(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") useSeat();
          }}
          placeholder="paste the code"
          spellCheck={false}
          autoCapitalize="off"
          aria-label="Seat code"
          className={cn(
            "w-[12rem] rounded-lg px-3 py-1.5 font-mono text-[0.875rem]",
            "border border-[var(--w-line)] bg-[var(--w-surface)] text-[var(--w-text)]",
            "outline-none focus:border-[var(--w-text-4)]",
          )}
        />
        <button
          onClick={useSeat}
          disabled={busy || !seatCode.trim()}
          className={cn(
            "rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium",
            "bg-[var(--w-invert)] text-[var(--w-on-invert)]",
            "cursor-pointer transition-opacity duration-150 hover:opacity-90",
            "disabled:cursor-default disabled:opacity-40",
          )}
        >
          Use it
        </button>
      </div>

      {seatProblem && (
        <p
          role="alert"
          className="mt-3 max-w-[56ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]"
        >
          {seatProblem}
        </p>
      )}
    </section>
  );

  const choose = (path: string | null) => {
    if (!bridge) return;
    const settle = path
      ? bridge.setTeamName(name.trim())
      : Promise.resolve(true);
    void settle.then(() => bridge.setTeamFolder(path)).then(load);
  };

  if (!settings.folder) {
    /*
     * ── Joining is one button, and starting is one button ──────────────────
     *
     * This used to be symmetrical: both people picked a folder from a list,
     * having agreed on which one somewhere else first. Four steps each, and a
     * way to get it wrong that produces no error — point at different folders
     * and it simply never works, with both windows saying everything is fine.
     *
     * The first person's file is already sitting in a folder the second person
     * can see, because that is what shared means. So the second person is not
     * asked anything: their Sidq finds it, says who is in there, and offers to
     * join. The list of drives is the fallback for the person who is first.
     */
    return (
      <>
        {heading}

        {nearby.length > 0 ? (
          <>
            <p className="mt-4 max-w-[56ch] text-[0.875rem] leading-relaxed text-[var(--w-text-3)]">
              Already set up. Join and your standing instructions travel with
              theirs, in every handover either of you makes.
            </p>

            <ul className="mt-5 space-y-2">
              {nearby.map((team) => (
                <li key={team.folder}>
                  <button
                    onClick={() => choose(team.folder)}
                    disabled={!name.trim()}
                    className={cn(
                      "flex w-full items-center justify-between gap-4 rounded-[12px] px-4 py-3 text-left",
                      "border border-[var(--w-line)] bg-[var(--w-surface)] transition-colors duration-150",
                      "cursor-pointer hover:border-[var(--w-accent-soft)] disabled:cursor-default disabled:opacity-40",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[0.9375rem] text-[var(--w-text)]">
                        {team.members.join(", ")}
                      </span>
                      <span className="block truncate text-[0.75rem] text-[var(--w-text-5)]">
                        in {team.inside}
                      </span>
                    </span>
                    <span className="shrink-0 text-[0.8125rem] font-medium text-[var(--w-text-3)]">
                      Join
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-4 max-w-[56ch] text-[0.875rem] leading-relaxed text-[var(--w-text-3)]">
            Pick somewhere that syncs. Sidq writes one small file there,{" "}
            <span className="tabular text-[var(--w-text)]">
              {settings.file}
            </span>
            , and reads the ones your teammates write. Then share that folder
            with them and their Sidq will find it on its own.
          </p>
        )}

        <label className="mt-5 block text-[0.8125rem]">
          <span className="block text-[var(--w-text-4)]">
            What your team sees you called
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
            spellCheck={false}
            className={cn(
              "mt-1.5 w-full max-w-[18rem] rounded-lg border border-[var(--w-line)] bg-[var(--w-surface)] px-3 py-2",
              "text-[0.8125rem] outline-none focus:border-[var(--w-accent-soft)]",
            )}
          />
        </label>

        <p className="mt-6 text-[0.75rem] uppercase tracking-[0.16em] text-[var(--w-text-5)]">
          {nearby.length > 0 ? "Or start a new one" : "Start sharing in"}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {options.map(([label, path]) => (
            <button
              key={path}
              disabled={!name.trim()}
              onClick={() => choose(path)}
              className={cn(
                "rounded-lg border border-[var(--w-line)] bg-[var(--w-surface)] px-3 py-2 text-[0.8125rem]",
                "cursor-pointer transition-colors duration-150 hover:border-[var(--w-accent-soft)]",
                "disabled:cursor-default disabled:opacity-40 disabled:hover:border-[var(--w-line)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" &&
              typed.trim() &&
              name.trim() &&
              choose(typed.trim())
            }
            placeholder="Or a path of your own, including a git repo"
            spellCheck={false}
            className={cn(
              "min-w-0 flex-1 rounded-lg border border-[var(--w-line)] bg-[var(--w-surface)] px-3 py-2",
              "text-[0.8125rem] outline-none focus:border-[var(--w-accent-soft)]",
            )}
          />
          <button
            disabled={!typed.trim() || !name.trim()}
            onClick={() => choose(typed.trim())}
            className={cn(
              "shrink-0 rounded-lg bg-[var(--w-invert)] px-3 py-2 text-[0.8125rem] font-medium text-[var(--w-on-invert)]",
              "cursor-pointer transition-opacity duration-150 hover:opacity-90",
              "disabled:cursor-default disabled:opacity-35",
            )}
          >
            Use this
          </button>
        </div>

        {codeSection}
        {seatSection}
      </>
    );
  }

  return (
    <div>
      {heading}

      <p className="mt-4 max-w-[56ch] text-[0.875rem] leading-relaxed text-[var(--w-text-3)]">
        Sharing through{" "}
        <span className="tabular text-[var(--w-text)]">{settings.folder}</span>.
        Sidq writes{" "}
        <span className="tabular text-[var(--w-text)]">{settings.file}</span>{" "}
        there and reads whatever your teammates put beside it. You can open that
        file and read every word of it.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-[0.8125rem]">
          <span className="block text-[var(--w-text-4)]">
            What your team sees you called
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() =>
              name.trim() !== settings.name &&
              bridge?.setTeamName(name).then(load)
            }
            spellCheck={false}
            className={cn(
              "mt-1.5 rounded-lg border border-[var(--w-line)] bg-[var(--w-surface)] px-3 py-2",
              "text-[0.8125rem] outline-none focus:border-[var(--w-accent-soft)]",
            )}
          />
        </label>
        {/*
         * The code, above the Finder button rather than instead of it.
         *
         * Sharing the drive is still macOS's own sheet and Sidq cannot do it.
         * What the code removes is the step after that one — describing which
         * folder inside the drive, which is where this used to fail silently.
         */}
        {codeBanner}
        {seatSection}
        {/*
         * The one step Sidq cannot do: a folder has to be shared with a
         * person, and sharing is macOS's own sheet on the folder itself.
         * Opening Finder with it selected puts them one right-click away,
         * which is the difference between a clear next move and a path they
         * have to go and find.
         */}
        {settings.members.length === 0 && (
          <button
            onClick={() => void bridge?.revealTeamFolder()}
            className={cn(
              "rounded-lg bg-[var(--w-invert)] px-3 py-2 text-[0.8125rem] font-medium text-[var(--w-on-invert)]",
              "cursor-pointer transition-opacity duration-150 hover:opacity-90",
            )}
          >
            Show it in Finder to share it
          </button>
        )}

        <button
          onClick={() => choose(null)}
          className={cn(
            "rounded-lg border border-[var(--w-line)] px-3 py-2 text-[0.8125rem]",
            "cursor-pointer transition-colors duration-150 hover:border-[var(--w-text)]",
          )}
        >
          Stop sharing
        </button>
      </div>

      {/*
       * The seat count, next to the heading.
       *
       * Every person is already listed below with what they contribute, which
       * answers "who is here" and not "how many". On a Team plan that number is
       * the invoice, and it is derived from a folder rather than looked up in a
       * database — which is the whole argument for a tier that costs nothing per
       * seat to run. Worth stating rather than leaving to be counted.
       */}
      <div className="mt-6 flex items-baseline justify-between gap-4">
        <p className="text-[0.75rem] uppercase tracking-[0.16em] text-[var(--w-text-5)]">
          In this folder
        </p>
        <p className="text-[0.75rem] tabular-nums text-[var(--w-text-5)]">
          {settings.members.length + 1 === 1
            ? "1 person"
            : `${settings.members.length + 1} people`}
        </p>
      </div>

      <ul className="mt-3 space-y-px">
        <li className="flex items-baseline gap-4 rounded-[10px] bg-[var(--w-raised)] px-3 py-2.5">
          <span className="min-w-0 flex-1 text-[0.875rem] text-[var(--w-text)]">
            {settings.name}{" "}
            <span className="text-[var(--w-text-5)]">(you)</span>
          </span>
          <span className="shrink-0 text-[0.75rem] tabular-nums text-[var(--w-text-5)]">
            {settings.sharing === 1 ? "1 rule" : `${settings.sharing} rules`}
          </span>
        </li>
        {settings.members.map(([who, count]: [string, number]) => (
          <li
            key={who}
            className="flex items-baseline gap-4 rounded-[10px] px-3 py-2.5"
          >
            <span className="min-w-0 flex-1 text-[0.875rem] text-[var(--w-text)]">
              {who}
            </span>
            <span className="shrink-0 text-[0.75rem] tabular-nums text-[var(--w-text-5)]">
              {count === 1 ? "1 rule" : `${count} rules`}
            </span>
          </li>
        ))}
      </ul>

      {/*
       * Nobody else yet is the normal first state, not a failure. It says what
       * to do rather than reporting an absence, because the thing to do is the
       * only part that is not obvious: the other person has to point their own
       * Sidq at the same folder.
       */}
      {settings.members.length === 0 && (
        <p className="mt-4 max-w-[56ch] text-[0.875rem] leading-relaxed text-[var(--w-text-4)]">
          Nobody else is in here yet. Share this folder with whoever you work
          with. Their Sidq finds it on its own and offers to join, so there is
          nothing for them to configure.
        </p>
      )}

      {/*
       * ── Whole conversations, when somebody chose to hand one over ──────────
       *
       * The rules above are published for you. These are not: each one is here
       * because a person pressed Share on that conversation. Its own section
       * for the same reason it is its own command in Rust — the two are
       * different sizes of decision and should not look alike.
       */}
      <p className="mt-8 text-[0.75rem] uppercase tracking-[0.16em] text-[var(--w-text-5)]">
        Conversations shared with the team
      </p>

      {shared.length === 0 ? (
        <p className="mt-3 max-w-[56ch] text-[0.875rem] leading-relaxed text-[var(--w-text-4)]">
          None yet. Press <strong>Share with team</strong> on any handover and
          it lands here for everyone pointed at this folder.
        </p>
      ) : (
        <ul className="mt-3 space-y-px">
          {shared.map((item) => (
            <li
              key={item.path}
              className={cn(
                "flex items-baseline gap-4 rounded-[10px] px-3 py-2.5",
                "transition-colors duration-150 hover:bg-[var(--w-raised)]",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[0.875rem] text-[var(--w-text)]">
                {item.title}
              </span>
              <span className="shrink-0 text-[0.75rem] text-[var(--w-text-5)]">
                {item.mine ? "you" : item.who}
              </span>
              <button
                onClick={() => {
                  void bridge?.readTeamHandover(item.path).then((text) => {
                    if (!text) return;
                    void navigator.clipboard.writeText(text).then(() => {
                      setCopied(item.path);
                      setTimeout(() => setCopied(null), COPIED_FOR_MS);
                    });
                  });
                }}
                className={cn(
                  "shrink-0 rounded-md px-2 py-1 text-[0.75rem] font-medium",
                  "cursor-pointer text-[var(--w-text-3)] transition-colors duration-150",
                  "hover:bg-[var(--w-invert)] hover:text-[var(--w-on-invert)]",
                )}
              >
                {copied === item.path ? "Copied" : "Copy"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Search ───────────────────────────────────────────────────────────────── */

function Search({
  bridge,
  historyDays,
}: {
  bridge: ReturnType<typeof desktopBridge>;
  /** How far back the plan reaches, or null for everything. */
  historyDays: number | null;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [withheld, setWithheld] = useState(0);
  const [searched, setSearched] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  /*
   * There is no window to pass.
   *
   * This used to compute the cutoff and send it down, which meant the limit was
   * whatever the page felt like sending. Rust works it out from the plan now,
   * and the only thing this can say is what to look for.
   */
  const run = useCallback(
    (q: string) => {
      if (!bridge || q.trim().length < 2) {
        setHits([]);
        setWithheld(0);
        setSearched(false);
        return;
      }
      void bridge.searchConversations(q, 50).then(([found, older]) => {
        setHits(found);
        setWithheld(older);
        setSearched(true);
      });
    },
    [bridge],
  );

  // Debounced, because every keystroke otherwise runs a full-text query against
  // several thousand messages.
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => run(query), 180);
    return () => window.clearTimeout(timer.current);
  }, [query, run]);

  return (
    <>
      <PanelHead
        eyebrow={
          historyDays == null
            ? "Everything on this Mac"
            : `Reaching back ${historyDays} ${historyDays === 1 ? "day" : "days"}`
        }
        title="Search"
      />

      <div className="relative mt-5">
        <span
          aria-hidden="true"
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--w-text-5)]"
        >
          <Icon name="search" />
        </span>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search everything you have ever asked"
          spellCheck={false}
          className={cn(
            "w-full rounded-[12px] bg-[var(--w-surface)] py-3.5 pl-11 pr-4",
            "text-[1rem] text-[var(--w-text)] placeholder:text-[var(--w-text-5)]",
            "ring-1 ring-inset ring-[var(--w-line)] transition-shadow duration-150",
            "focus:outline-none focus:ring-[var(--w-accent)]/40",
          )}
        />
      </div>

      {searched && (
        <p className="mt-4 text-[0.8125rem] text-[var(--w-text-4)]">
          {hits.length === 0
            ? "Nothing matched that one."
            : `${hits.length} ${hits.length === 1 ? "result" : "results"}`}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {hits.map((hit) => (
          <Hit key={`${hit.sessionId}-${hit.snippet.slice(0, 24)}`} hit={hit} />
        ))}
      </div>

      {/*
       * The locked results.
       *
       * The count is real and comes from the same query; the text does not. It
       * is shown rather than hidden because someone who can see exactly what
       * they are missing has a reason to pay, and someone who cannot has no
       * idea there is anything there.
       */}
      {withheld > 0 && historyDays !== null && (
        <div className="mt-5 rounded-[12px] border border-[var(--w-accent-soft)]/45 bg-[var(--w-tint)] p-4">
          <p className="text-[0.875rem] text-[var(--w-text)]">
            <span className="font-medium text-[var(--w-text)]">
              {withheld} more
            </span>{" "}
            {withheld === 1 ? "conversation matches" : "conversations match"},
            older than {historyDays} days
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--w-text-4)]">
            Free search reaches back {historyDays} days. Pro reaches everything
            you have ever asked, in any AI.
          </p>
        </div>
      )}

      {!searched && (
        <p className="mt-8 max-w-[52ch] text-[0.875rem] leading-relaxed text-[var(--w-text-4)]">
          Every conversation on this Mac, plus every AI you have opened in Sidq,
          searched together. No AI can read another one&rsquo;s history, so this
          is the only place yours sits in one pile.
        </p>
      )}
    </>
  );
}

function Hit({ hit }: { hit: SearchHit }) {
  return (
    <article className="rounded-[12px] bg-[var(--w-raised)] p-4 ring-1 ring-inset ring-[var(--w-line)]">
      <div className="flex items-baseline gap-2">
        <span className="truncate text-[0.875rem] font-medium text-[var(--w-text)]/90">
          {hit.title || "Untitled"}
        </span>
        <span className="shrink-0 text-[0.6875rem] text-[var(--w-text-5)]">
          {sourceLabel(hit.source)}
          {projectLabel(hit.project) && ` · ${projectLabel(hit.project)}`}
          {hit.endedAt > 0 && ` · ${whenLabel(hit.endedAt)}`}
        </span>
      </div>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]">
        {/* FTS5 wraps matches in « ». Rendered as marks so the eye lands on why
            this result is here rather than on the surrounding sentence. */}
        {hit.snippet.split(/[«»]/).map((part, i) =>
          i % 2 === 1 ? (
            <mark
              key={i}
              className="rounded bg-[var(--w-line-accent)] px-0.5 text-[var(--w-text)]"
            >
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </p>
    </article>
  );
}

/* ── Sources ──────────────────────────────────────────────────────────────── */

/**
 * Bring in the history you already have, from whichever assistant it is in.
 *
 * claude.ai keeps nothing readable on this Mac. Its desktop app has an
 * IndexedDB at Application Support/Claude, and that store holds no conversation
 * text — checked, not assumed: 2.2MB, 31% printable, and the only readable
 * string in it is the name of the store.
 *
 * The extension covers the tab you have open. This covers the rest, which for
 * most people is nearly all of it.
 *
 * The file is read here and the JSON handed to Rust, rather than Rust opening
 * the path. That means no file-dialog plugin, and it means Sidq only ever sees
 * the one file somebody deliberately chose.
 */
/**
 * The assistants, opened where you are already signed in.
 *
 * Sidq has its own browser engine and for a while these opened inside it, which
 * removed the extension install and looked like the better answer. It is not.
 * The pages render perfectly and the one thing every account now depends on
 * cannot work: passkeys need WebAuthn, WebAuthn in a webview needs an
 * associated-domains entitlement, and that entitlement has to be granted by the
 * site owner publishing Sidq's team identifier in their own
 * apple-app-site-association file. OpenAI is not going to do that. AutoFill,
 * Keychain and every password manager are the same story.
 *
 * So the login stays in the browser where all of that already works, and Sidq
 * never holds a session at all. The extension reads the page from there.
 *
 * Opening inside Sidq is still offered underneath, because an account that
 * signs in with an email and a password hits none of the above and it saves
 * them an install.
 */
function OpenAssistants({
  bridge,
}: {
  bridge: ReturnType<typeof desktopBridge>;
}) {
  const [rows, setRows] = useState<{ id: string; label: string }[]>([]);
  const [inSidq, setInSidq] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    void bridge.assistantList().then(setRows);
  }, [bridge]);

  if (rows.length === 0) return null;

  return (
    <div className="mt-8">
      <p className="text-[0.875rem] font-medium text-[var(--w-text)]">
        Open one
      </p>
      <p className="mt-1.5 max-w-[56ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]">
        In your own browser, where you are already signed in and your passkeys
        and password manager work. Sidq never asks you to log in to anything.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {rows.map((row) => (
          <button
            key={row.id}
            onClick={() =>
              void (inSidq
                ? bridge?.openAssistant(row.id)
                : bridge?.openAssistantInBrowser(row.id))
            }
            className={cn(
              "rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium",
              "bg-[var(--w-raised)] text-[var(--w-text)] ring-1 ring-inset ring-[var(--w-line)]",
              "cursor-pointer transition-colors duration-150 hover:bg-[var(--w-line)] hover:text-[var(--w-text)]",
            )}
          >
            {row.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => setInSidq((v) => !v)}
        className="mt-3 text-[0.75rem] text-[var(--w-text-5)] transition-colors duration-150 hover:text-[var(--w-text-2)]"
      >
        {inSidq
          ? "Opening inside Sidq. Passkeys and autofill will not work here. Use my browser instead"
          : "Or open them inside Sidq, if you sign in with an email and password"}
      </button>
    </div>
  );
}

function ImportHistory({
  bridge,
}: {
  bridge: ReturnType<typeof desktopBridge>;
}) {
  const [state, setState] = useState<"idle" | "reading" | "done" | "failed">(
    "idle",
  );
  const [message, setMessage] = useState("");

  return (
    <div className="mt-8 rounded-[12px] border border-[var(--w-accent-soft)]/45 bg-[var(--w-tint)] p-4">
      <p className="text-[0.875rem] font-medium text-[var(--w-text)]">
        Already have an export file?
      </p>
      {/*
       * Deliberately the last thing on this panel, and phrased as an
       * afterthought.
       *
       * It used to be the headline. Requesting an export from Claude or
       * ChatGPT is emailed to you and can take days to arrive, so putting it
       * in front of somebody who has just installed Sidq means their first
       * experience of the product is waiting. Opening an assistant here works
       * in one click, so that is the offer; this is for the people who
       * happen to have a file already.
       */}
      <p className="mt-1.5 max-w-[54ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]">
        This is the one route that needs no scrolling: an export holds every
        conversation in full, however old, whether or not you ever open it
        again. Worth requesting now even though it takes a day or two to arrive.
        Claude and ChatGPT both call it{" "}
        <code className="text-[var(--w-text-2)]">conversations.json</code>;
        Google Takeout calls it{" "}
        <code className="text-[var(--w-text-2)]">MyActivity.json</code>. Sidq
        works out which is which.
      </p>

      <label
        className={cn(
          "mt-3 inline-flex cursor-pointer items-center rounded-lg px-3 py-1.5",
          "bg-[var(--w-invert)] text-[0.8125rem] font-medium text-[var(--w-on-invert)]",
          "transition-opacity duration-150 hover:opacity-90",
          state === "reading" && "pointer-events-none opacity-50",
        )}
      >
        {state === "reading" ? "Importing…" : "Choose an export file"}
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file || !bridge) return;

            setState("reading");
            void file
              .text()
              .then((json) => bridge.importExport(json))
              .then((count) => {
                setState("done");
                setMessage(
                  `${count} conversation${count === 1 ? "" : "s"} imported. They are searchable now.`,
                );
              })
              .catch((err: unknown) => {
                setState("failed");
                // Rust says what is actually wrong with the file. Replacing that
                // with "something went wrong" throws away the only useful part.
                setMessage(err instanceof Error ? err.message : String(err));
              });
            // Let the same file be chosen twice, after a failed first attempt.
            e.target.value = "";
          }}
        />
      </label>

      {state !== "idle" && state !== "reading" && (
        <p
          className={cn(
            "mt-2.5 text-[0.8125rem]",
            state === "done"
              ? "text-[var(--w-text-3)]"
              : "text-[var(--w-danger)]",
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}

/**
 * The sources, most-used first, measured rather than asked.
 *
 * Setup used to have a screen for this — "Which do you use most?", a row of
 * chips, a Continue — and ordered the list from the answer. Sidq has read the
 * index by the time anybody sees this panel, so it already knows, and knows
 * better: what somebody taps during setup is what they think they use, and
 * this is what they actually opened. It also stays true as that changes, which
 * a one-time answer cannot.
 *
 * Ties keep the fixed order, so the list does not reshuffle for no reason.
 */
function orderedSources(counts: Map<string, number>): readonly Source[] {
  return [...SOURCES].sort(
    (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0),
  );
}

function Sources({
  sessions,
  bridge,
}: {
  sessions: WorkSession[];
  bridge: ReturnType<typeof desktopBridge>;
}) {
  const [stale, setStale] = useState<string[]>([]);
  const [accessible, setAccessible] = useState<boolean | null>(null);
  /** Whether Sidq reads assistants running in a browser. Off on a new install. */
  const [readsBrowsers, setReadsBrowsers] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    void bridge.staleSources().then(setStale);
    try {
      void bridge.readsBrowsers().then(setReadsBrowsers, () => {});
    } catch {
      /* An older bridge has no opinion; the default is off either way. */
    }

    // Polled, because it is granted in another application and can change while
    // this window is open.
    const check = () => void bridge.accessibilityGranted().then(setAccessible);
    check();
    const timer = setInterval(check, 2000);
    return () => clearInterval(timer);
  }, [bridge]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const key = s.source ?? "claude-code";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [sessions]);

  return (
    <>
      {/*
       * This credited the extension, and so did every row below it. The
       * extension stopped being how any of this works when the Accessibility
       * permission replaced it, and telling somebody their AIs are read "via
       * extension" sends them looking for an install that is not part of the
       * product any more — while the thing that actually reads them sits
       * further down the same screen.
       */}
      <PanelHead
        eyebrow={
          sessions.length > 0 ? `${sessions.length} being read` : undefined
        }
        title="Sources"
        lead="Sidq is not tied to any one AI. The ones that write conversations to this Mac are read with nothing to set up. The ones that run in a browser keep nothing readable here, so Sidq reads them from the window instead, in whichever browser you already use. Sidq never asks you to log in to anything."
      />

      {/*
       * ── The permission, as a switch rather than a fait accompli ───────────
       *
       * Reading a browser needs Accessibility, which is the same permission a
       * keylogger needs and which macOS describes that way in its dialog. It
       * is now off on a new install, so the first run can say "Sidq does not
       * watch your screen, it reads files" and have that be literally true.
       *
       * This is where it comes back on, and it has to exist: a default nobody
       * can change is not a default, it is a removed feature. Somebody who was
       * already using it keeps it, untouched — see `reads_browsers` in the Rust
       * for how that is decided.
       */}
      <div className="mt-8 flex items-start gap-6 border-y border-[var(--w-line)] py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-medium tracking-[-0.01em] text-[var(--w-text)]">
            Also read assistants running in a browser
          </p>
          <p className="mt-1 max-w-[60ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]">
            ChatGPT, Claude.ai, Gemini, Grok and DeepSeek keep nothing readable
            on this Mac, so Sidq reads them from the window. That needs the
            Accessibility permission. Everything read from disk works without it
            and is unaffected by this.
          </p>
        </div>
        <div className="shrink-0 pt-0.5">
          <Toggle
            on={readsBrowsers}
            onChange={(on) => {
              setReadsBrowsers(on);
              void bridge?.setReadsBrowsers(on);
            }}
          />
        </div>
      </div>

      <ul className="mt-8 divide-y divide-[var(--w-line)] border-y border-[var(--w-line)]">
        {orderedSources(counts).map((source) => {
          const found = counts.get(source.id) ?? 0;
          return (
            <li
              key={source.id}
              className={cn(
                "flex items-center gap-3 py-3",
                // Read ones at full strength, the rest a step back: the list
                // is what you use first and what you could use after.
                found === 0 && "opacity-60",
              )}
            >
              <SourceGlyph source={source.id} />
              <span className="flex-1 text-[0.875rem] text-[var(--w-text)]">
                {source.label}
              </span>
              <span
                className={cn(
                  "text-[0.75rem] tabular-nums",
                  found > 0 ? "text-[var(--w-accent)]" : "text-[var(--w-text-3)]",
                )}
              >
                {/*
                 * What a row with nothing in it is waiting for, which is a
                 * different thing for the two kinds of source. A local one has
                 * simply never been used. A browser one is read the moment you
                 * open it, unless the permission is off, in which case that is
                 * the only thing standing in the way and the row should say so.
                 */}
                {found > 0
                  ? `${found} ${found === 1 ? "conversation" : "conversations"}`
                  : source.local
                    ? "none found"
                    : accessible === false
                      ? "needs permission"
                      : "when you open it"}
              </span>
            </li>
          );
        })}
      </ul>
      {stale.length > 0 && (
        /*
         * Said out loud, because the alternative is a source sitting at zero
         * that looks identical to one nobody has used. These sites redesign
         * without notice and the extension reads nothing when they do.
         */
        <div className="mt-6 rounded-[14px] border border-[var(--w-line)] bg-[var(--w-bg)] p-4">
          <p className="text-[0.875rem] font-medium text-[var(--w-text)]">
            {stale.join(" and ")} changed, and Sidq stopped reading{" "}
            {stale.length === 1 ? "it" : "them"}
          </p>
          <p className="mt-1.5 max-w-[54ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]">
            The page moved out from under the extension. This is fixed from our
            side without you updating anything, usually the same day. Everything
            already captured is safe.
          </p>
        </div>
      )}

      <div className="mt-8">
        <GrantAccess />
      </div>

      {/*
       * The extension only when the permission has been declined.
       *
       * It is a real fallback and a worse one: a store listing, a review queue
       * and a developer-mode install per browser. Offering both at once asks
       * somebody to choose between two setups when one switch would have done.
       */}
      {accessible === false && (
        <div className="mt-4">
          <ConnectExtension />
        </div>
      )}

      <OpenAssistants bridge={bridge} />
      <ImportHistory bridge={bridge} />
    </>
  );
}
