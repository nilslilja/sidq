import { Routes, Route, Navigate } from 'react-router-dom';
import { Upgrade } from '@/routes/Upgrade';
import { SignIn } from '@/routes/SignIn';

/*
 * The two screens that live behind the landing page.
 *
 * Sign-in and billing, and nothing else. This used to carry a second product —
 * a coach dashboard, client sharing, an intake flow, a day board, a focus timer
 * and a shutdown ritual — around nine screens and roughly fifteen hundred lines
 * from when Sidq was a day planner. Nothing in the current product linked to any
 * of it, so the only way to reach those screens was to type the URL, and what
 * you found there described software that no longer exists.
 *
 * Both survivors are real: you cannot sell a subscription without somewhere to
 * sign in and somewhere to pay. They keep SidqProvider because both read the
 * account and plan state from it.
 *
 * Everything a person actually uses Sidq for happens in the desktop app, not
 * here. If a screen is ever added back to this file it should be because a
 * paying customer needs it in a browser.
 */

export default function AppShell() {
  return (
    <Routes>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/upgrade" element={<Upgrade />} />
        {/*
         * Anything else goes home rather than 404ing. Every real destination is
         * either on the landing page or inside the app, so an unknown path here
         * is a stale link, and the landing page is the useful answer to one.
         */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
  );
}
