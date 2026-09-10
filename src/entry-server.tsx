import { GUIDES } from "@/lib/guides";
/*
 * The build-time renderer.
 *
 * Only the public marketing routes come through here. The desktop app runs the
 * same bundle inside a Tauri WebView and is never prerendered: it has no
 * crawler to satisfy and no cold first paint to fix, because the window is
 * already open before anything is fetched.
 *
 * `StaticRouter` rather than `BrowserRouter` is the whole reason `AppRoutes`
 * exists apart from `App`. There is no history to read from here.
 */
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { AppRoutes } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/global.css";

/*
 * Adding a route here is a promise about it.
 *
 * Anything prerendered must render the same thing on a build server as it does
 * in a browser on its first pass, or React discards the static page on arrival
 * and the work is worse than wasted. That rules out reading `navigator`,
 * `window` or the clock during render. `/downloading` is deliberately absent
 * for exactly that reason: it detects the machine as it renders, which is right
 * for a page reached by clicking Download and wrong for one built in advance.
 */
export const ROUTES = [
  "/",
  "/pricing",
  "/faq",
  "/chatgpt-to-claude",
  // The rest of the guides, from the same array that holds their words. A
  // route table typed out by hand beside a content table is how a page ends up
  // prerendered with somebody else's title.
  ...GUIDES.map((g) => g.route),
  "/privacy",
  "/terms",
] as const satisfies readonly string[];

/*
 * Re-exported so the prerenderer reads the same table the site does.
 *
 * The build script cannot import a .ts file directly, and a second copy of the
 * titles living in the script is how a page ends up with a canonical nobody
 * remembers writing. `ROUTES` and `PAGES` are asserted to agree in seo.test.ts.
 */
export { metaFor, PAGES } from "@/lib/seo";

export function render(url: string): string {
  return renderToString(
    <StrictMode>
      <ErrorBoundary>
        <StaticRouter location={url}>
          <AppRoutes />
        </StaticRouter>
      </ErrorBoundary>
    </StrictMode>,
  );
}
