import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Landing } from '@/routes/Landing';
import { Bloom } from '@/components/atmosphere/Bloom';

// The app proper is a separate chunk. The landing page ships React, the router,
// the shader and the hero stroke. Nothing else.
const AppShell = lazy(() => import('./AppShell'));


// The picker. Its own window, its own chunk: it is summoned by a global
// shortcut and must appear instantly, so it carries nothing the list needs not.
const Pill = lazy(() => import('@/routes/Pill').then((m) => ({ default: m.Pill })));

// The window behind the pill: search, handovers, sources, stats. Its own chunk
// because it is opened deliberately, not summoned, so it can afford to load.
const Home = lazy(() => import('@/routes/Home').then((m) => ({ default: m.Home })));

// First run. Its own window in the desktop app, its own chunk everywhere, since
// it is seen exactly once per install and never again.
const Onboarding = lazy(() => import('@/routes/Onboarding'));

// The desktop sign-in hand-off. Its own chunk and its own route, deliberately
// not linked from anywhere on the site: it is the middle of a round trip that
// starts and ends in the installed app.
// The page people land on after clicking Download. Its own chunk: seen once,
// and it must not drag the marketing bundle around with it.
const Downloading = lazy(() =>
  import('@/routes/Downloading').then((m) => ({ default: m.Downloading })),
);

const DesktopSignIn = lazy(() =>
  import('@/routes/DesktopSignIn').then((m) => ({ default: m.DesktopSignIn })),
);

/*
 * Privacy and Terms, public and outside AppShell.
 *
 * They were footer links with no route, so both fell through to the catch-all
 * and redirected to the homepage. Putting them inside AppShell would have been
 * worse than nothing: it gates on a session, so the one page a cautious person
 * reads *before* signing up would have demanded they sign up first.
 */
// Opened straight out of setup, so it is public and outside AppShell for the
// same reason the legal pages are: it must not demand a session first.
const Connect = lazy(() => import('@/routes/Connect').then((m) => ({ default: m.Connect })));
const Privacy = lazy(() => import('@/routes/Legal').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('@/routes/Legal').then((m) => ({ default: m.Terms })));

export function App() {
  return (
    <BrowserRouter>
      {/* Fixed behind everything, mounted once so it never restarts on navigation. */}
      <Routes>
        {/* The desktop card renders alone: transparent, no bloom, no grain. The
            fallback is empty rather than a spinner, so the transparent window
            stays transparent while the chunk resolves. */}
        <Route
          path="/home"
          element={
            <Suspense fallback={<div className="min-h-[100dvh] bg-[#0B0B10]" />}>
              <Home />
            </Suspense>
          }
        />
        <Route
          path="/pill"
          element={
            <Suspense fallback={null}>
              <Pill />
            </Suspense>
          }
        />
        <Route
          path="/welcome"
          element={
            <Suspense fallback={<div className="min-h-[100dvh] bg-[#0B0B10]" />}>
              <Onboarding />
            </Suspense>
          }
        />
        <Route
          path="/desktop-signin"
          element={
            <Suspense fallback={<div className="min-h-[100dvh] bg-[#0B0B10]" />}>
              <DesktopSignIn />
            </Suspense>
          }
        />
        <Route
          path="/downloading"
          element={
            <Suspense fallback={<div className="min-h-[100dvh] bg-[#0B0B10]" />}>
              <Downloading />
            </Suspense>
          }
        />
        <Route path="*" element={<Shell />} />
      </Routes>
    </BrowserRouter>
  );
}

function Shell() {
  return (
    <>
      <Bloom />
      <div className="grain relative min-h-[100dvh]">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/connect"
            element={
              <Suspense fallback={<Blank />}>
                <Connect />
              </Suspense>
            }
          />
          <Route
            path="/privacy"
            element={
              <Suspense fallback={<Blank />}>
                <Privacy />
              </Suspense>
            }
          />
          <Route
            path="/terms"
            element={
              <Suspense fallback={<Blank />}>
                <Terms />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <Suspense fallback={<Blank />}>
                <AppShell />
              </Suspense>
            }
          />
        </Routes>
      </div>
    </>
  );
}

/**
 * Intentionally empty rather than a spinner. The chunk resolves well inside the
 * ~200ms where a loading indicator starts helping, and a flashed spinner reads as
 * jank on a fast connection. The bloom is already painted behind it.
 */
function Blank() {
  return <div className="min-h-[100dvh]" />;
}
