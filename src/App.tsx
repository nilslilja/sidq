import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Landing } from '@/routes/Landing';
import { Bloom } from '@/components/atmosphere/Bloom';

// The app proper is a separate chunk. The landing page ships React, the router,
// the shader and the hero stroke. Nothing else.
const AppShell = lazy(() => import('./AppShell'));

// The desktop card is split off too. It reads the store and joins realtime rooms,
// so importing it eagerly put the whole Supabase client on the landing page and
// pushed it 60kB past budget. Nobody hitting the marketing site needs any of it.
const Overlay = lazy(() => import('@/routes/Overlay'));

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

export function App() {
  return (
    <BrowserRouter>
      {/* Fixed behind everything, mounted once so it never restarts on navigation. */}
      <Routes>
        {/* The desktop card renders alone: transparent, no bloom, no grain. The
            fallback is empty rather than a spinner, so the transparent window
            stays transparent while the chunk resolves. */}
        <Route
          path="/overlay"
          element={
            <Suspense fallback={null}>
              <Overlay />
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
