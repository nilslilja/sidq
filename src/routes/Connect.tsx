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

const WEB_ASSISTANTS = [
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
          {WEB_ASSISTANTS.join(', ')} are different. Their desktop apps encrypt what they
          store and the web versions keep nothing on disk, so there is no file for Sidq to
          read. The only place those conversations exist in the clear is the browser you
          are reading this in, which is where the extension will read them from.
        </p>

        {/*
         * Load-unpacked instructions rather than a store link.
         *
         * The Chrome Web Store takes days to review and this works today. It is
         * four steps, it is what every developer tool ships during its first
         * weeks, and it is honest about being that. The store listing follows.
         */}
        <div className="mt-10 rounded-[16px] border border-ink/10 bg-white/60 p-6">
          <p className="text-[0.9375rem] font-medium">Install it in about a minute</p>
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
          <p className="mt-5 max-w-[54ch] text-[0.8125rem] leading-relaxed ink-muted">
            Then open a conversation in ChatGPT, Gemini, Claude or Perplexity and click the
            Sidq icon in your toolbar. It appears in the picker straight away. Sidq has to
            be running, because the conversation goes to the app on your Mac and nowhere
            else.
          </p>
        </div>

        <p className="mt-6 max-w-[58ch] text-[0.8125rem] leading-relaxed ink-muted">
          Developer mode sounds alarming and is not: it is how every extension is
          installed before a store review, which takes days. The Chrome Web Store listing
          is in progress and this page will point at it instead when it is live. Safari
          needs its own build and is not ready yet.
        </p>

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
