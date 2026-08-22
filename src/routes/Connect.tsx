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

const WEB_AIS = [
  'ChatGPT',
  'Claude.ai',
  'Gemini',
  'Perplexity',
  'Grok',
  'DeepSeek',
  'Mistral',
  'Copilot',
];

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
          Claude Code, Claude Cowork, Cursor, Windsurf and VS Code are already connected. They keep their history on your
          Mac, so Sidq reads them with nothing to set up, including everything you did
          before you installed it.
        </p>

        <p className="mt-5 max-w-[58ch] text-[0.9375rem] leading-relaxed ink-muted">
          {WEB_AIS.join(', ')} are different. Their desktop apps encrypt what they
          store and the web versions keep nothing on disk, so there is no file for Sidq to
          read. The only place those conversations exist in the clear is the browser you
          are reading this in, which is where the extension will read them from.
        </p>

        {/*
         * The permission first, the extension second.
         *
         * This page led with load-unpacked instructions, written when the
         * extension was the only route. It is not any more: Sidq reads these
         * conversations out of the window through one macOS permission, with
         * nothing to install in any browser. Leading with the harder path was
         * telling people to do the slow thing.
         */}
        <div className="mt-10 rounded-[16px] border border-ink/10 bg-white/60 p-6">
          <p className="text-[0.9375rem] font-medium">Nothing to install</p>
          <p className="mt-3 max-w-[54ch] text-[0.875rem] leading-relaxed ink-muted">
            Open Sidq and it asks once for macOS Accessibility, the same permission every
            dictation app uses. Grant it and every AI above works immediately, in whichever
            browser you already use, still signed in, with your passkeys and password
            manager exactly as they are.
          </p>
          <ol className="mt-4 space-y-3">
            {[
              <>Open Sidq, then <strong className="font-medium">Sources</strong></>,
              <>Click <strong className="font-medium">Turn it on</strong> and allow it when macOS asks</>,
              <>That is it. The panel goes green by itself once it is working</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3 text-[0.875rem] leading-relaxed ink-muted">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent/50" />
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 max-w-[54ch] text-[0.8125rem] leading-relaxed ink-muted">
            Sidq reads nine applications and, inside them, only tabs that are one of the AIs
            above. Every other window is never looked at, which is enforced in the code
            rather than promised. Nothing is uploaded.
          </p>
        </div>

        {/* The extension is the alternative for anybody who would rather not
            grant the permission. Real, and slower. */}
        <details className="mt-6 max-w-[58ch]">
          <summary className="cursor-pointer text-[0.875rem] underline underline-offset-4 transition-colors duration-150 hover:text-accent">
            Would rather not grant it? Use the extension instead
          </summary>
          <ol className="mt-4 space-y-3">
            {[
              <>Download <a
                    href="/sidq-extension.zip"
                    download
                    className="text-ink underline underline-offset-4 transition-colors duration-150 hover:text-accent"
                  >
                    sidq-extension.zip
                  </a> and unzip it</>,
              <>Open <code className="rounded bg-ink/[0.06] px-1.5 py-0.5 text-[0.8125rem]">chrome://extensions</code> — the same address works in Edge, Brave, Arc, Opera and Vivaldi</>,
              <>Turn on <strong className="font-medium">Developer mode</strong>, top right</>,
              <>Click <strong className="font-medium">Load unpacked</strong> and choose the folder you unzipped</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3 text-[0.875rem] leading-relaxed ink-muted">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent/50" />
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[0.8125rem] leading-relaxed ink-muted">
            Developer mode is how every extension is installed before a store review, which
            takes days. The Chrome Web Store listing is in progress. Safari needs its own
            build and is not ready yet.
          </p>
        </details>

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
