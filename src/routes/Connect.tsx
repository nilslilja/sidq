import { Link } from 'react-router-dom';

/*
 * Where the desktop app sends you to connect the web assistants.
 *
 * ChatGPT, Gemini and Perplexity keep nothing readable on the machine: the
 * desktop apps encrypt their stores and the web ones write nothing to disk that
 * survives. The browser is the only place that data is ever in the clear, which
 * is why this page exists and why it is a browser page rather than a screen in
 * the app.
 *
 * ── Why it says "not ready" rather than showing a button ──────────────────────
 * The extension is being built and is not published. Putting an Install button
 * here that leads nowhere would be the single most damaging thing on this
 * domain: this is the page that opens straight out of setup, so it is the first
 * promise the product makes after somebody has already trusted it with their
 * files. It says where things actually stand instead.
 */

const WEB_ASSISTANTS = ['ChatGPT', 'Gemini', 'Perplexity', 'Claude.ai'];

export function Connect() {
  return (
    <div className="min-h-[100dvh] bg-paper">
      <header className="mx-auto max-w-[42rem] px-6 pt-10">
        <Link
          to="/"
          className="font-display text-[1.5rem] leading-none tracking-[-0.05em] transition-opacity duration-150 hover:opacity-70"
        >
          Sidq
        </Link>
      </header>

      <main className="mx-auto max-w-[42rem] px-6 py-16">
        <h1 className="font-display text-[clamp(2.25rem,5vw,3.25rem)] leading-[0.98] tracking-[-0.04em]">
          Connecting the ones
          <br />
          that live in your browser
        </h1>

        <p className="mt-7 max-w-[58ch] text-[1.0625rem] leading-relaxed">
          Claude Code and Cursor are already connected. They keep their history on your
          Mac, so Sidq reads them with nothing to set up, including everything you did
          before you installed it.
        </p>

        <p className="mt-5 max-w-[58ch] text-[0.9375rem] leading-relaxed ink-muted">
          {WEB_ASSISTANTS.join(', ')} are different. Their desktop apps encrypt what they
          store and the web versions keep nothing on disk, so there is no file for Sidq to
          read. The only place those conversations exist in the clear is the browser you
          are reading this in, which is where the extension will read them from.
        </p>

        {/*
         * An honest status, not an install button.
         *
         * This page opens directly out of setup, so it is the first thing the
         * product says after somebody has trusted it with their files. A button
         * that led nowhere would cost more than the feature is worth.
         */}
        <div className="mt-10 rounded-[16px] border border-ink/10 bg-white/60 p-6">
          <p className="text-[0.9375rem] font-medium">The extension is not published yet.</p>
          <p className="mt-2 max-w-[54ch] text-[0.875rem] leading-relaxed ink-muted">
            It is being built. Until it is in the Chrome store there is no link here worth
            clicking, and pretending otherwise would be a poor start. Nothing else about
            Sidq depends on it: the assistants most people build in are already connected.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            to="/"
            className="text-[0.875rem] underline underline-offset-4 transition-colors duration-150 hover:text-accent"
          >
            Back to Sidq
          </Link>
          <Link
            to="/privacy"
            className="text-[0.875rem] ink-muted underline underline-offset-4 transition-colors duration-150 hover:text-accent"
          >
            What Sidq reads, exactly
          </Link>
        </div>

        <p className="mt-12 text-[0.8125rem] ink-muted">
          You can close this tab and carry on with setup. Nothing here is required.
        </p>
      </main>
    </div>
  );
}
