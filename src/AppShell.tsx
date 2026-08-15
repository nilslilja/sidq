import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SidqProvider, useSidq } from '@/state/SidqProvider';
import { Intake } from '@/routes/Intake';
import { DayBoard } from '@/routes/DayBoard';
import { FocusMode } from '@/routes/FocusMode';
import { Shutdown } from '@/routes/Shutdown';
import { Momentum } from '@/routes/Momentum';
import { Upgrade } from '@/routes/Upgrade';
import { SignIn } from '@/routes/SignIn';
import { CoachDashboard } from '@/routes/CoachDashboard';
import { CoachClient } from '@/routes/CoachClient';
import { JoinCoach } from '@/routes/JoinCoach';
import { Sharing } from '@/routes/Sharing';
import { Loader } from '@/components/ui/loader';

/*
 * Everything behind the landing page, in one lazily-loaded chunk.
 *
 * The split is deliberate rather than incidental: Supabase, embla and the whole
 * planner state machine are dead weight on a marketing page, and the landing page
 * is the one surface where load time costs signups.
 */
// Dev-only, and lazily imported so the upstream reference components stay out of
// the app bundle entirely. A static import would keep them in the module graph
// even with the route branch removed, GooeyLoader's top-level forwardRef() call
// is not provably side-effect-free, so Rollup cannot shake it.
const ComponentGallery = lazy(() => import('@/routes/ComponentGallery'));

export default function AppShell() {
  return (
    <SidqProvider>
      <Routes>
        <Route path="/signin" element={<SignIn />} />
        {/* The client link. Public on purpose: a prospective client must be able to
            read what will be shared before they create anything. */}
        <Route path="/join/:code" element={<JoinCoach />} />

        {/* Coach side. */}
        <Route
          path="/coach"
          element={
            <RequiresAccount>
              <CoachDashboard />
            </RequiresAccount>
          }
        />
        <Route
          path="/coach/client/:clientId"
          element={
            <RequiresAccount>
              <CoachClient />
            </RequiresAccount>
          }
        />

        {/* Client's own privacy controls. */}
        <Route
          path="/sharing"
          element={
            <RequiresAccount>
              <Sharing />
            </RequiresAccount>
          }
        />
        <Route
          path="/intake"
          element={
            <RequiresAccount>
              <Intake />
            </RequiresAccount>
          }
        />
        <Route
          path="/today"
          element={
            <RequiresPlan>
              <DayBoard />
            </RequiresPlan>
          }
        />
        <Route
          path="/focus/:taskId"
          element={
            <RequiresPlan>
              <FocusMode />
            </RequiresPlan>
          }
        />
        <Route
          path="/shutdown"
          element={
            <RequiresPlan>
              <Shutdown />
            </RequiresPlan>
          }
        />
        <Route path="/momentum" element={<Momentum />} />
        <Route path="/upgrade" element={<Upgrade />} />
        {/* Reference-component gallery. Dead code in production, so the upstream
            sources and their deps never reach a user's bundle. */}
        {import.meta.env.DEV && (
          <Route
            path="/gallery"
            element={
              <Suspense fallback={null}>
                <ComponentGallery />
              </Suspense>
            }
          />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SidqProvider>
  );
}

/**
 * The account wall. Sits in front of intake, so a plan cannot exist without an owner.
 * When no backend is configured there is no account to require and this passes
 * through, otherwise the wall would just be theatre in local development.
 */
function RequiresAccount({ children }: { children: React.ReactNode }) {
  const { canEnter } = useSidq();
  if (!canEnter) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}

/**
 * Gate on having a plan, not on having an account. An anonymous visitor reaches
 * every screen here, signing up is what makes it durable, not what unlocks it.
 */
function RequiresPlan({ children }: { children: React.ReactNode }) {
  const { phase, canEnter } = useSidq();

  if (!canEnter) return <Navigate to="/signin" replace />;

  if (phase === 'loading') {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <Loader statuses={['Picking up where you left off']} />
      </div>
    );
  }

  if (phase === 'needs-intake') {
    return <Navigate to="/intake" replace />;
  }

  return <>{children}</>;
}
