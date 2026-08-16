import { Check, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ImportHistory } from '@/components/companion/ImportHistory';
import type { WorkSession } from '@/lib/companion/work-history';

/*
 * Connecting the assistants.
 *
 * The one screen where the product explains its own premise: your work is split
 * across three assistants and none of them can see the others, because no vendor
 * can read a competitor's history. Something on your machine can.
 *
 * It is also the screen where the privacy claim has to be exact. Reading local
 * AI transcripts is the most invasive-sounding thing this product does, so each
 * source states what is extracted AND what is not, in that order. A vague
 * reassurance here reads as evasion, and correctly so.
 */

export interface SourceStatus {
  /** How many Claude Code sessions were found on disk. */
  claudeSessions: number;
  /** How many conversations have been imported from an export. */
  importedSessions: number;
}

export function ConnectSources({
  status,
  onImported,
}: {
  status: SourceStatus;
  onImported: (sessions: WorkSession[]) => void;
}) {
  return (
    <div className="space-y-2.5">
      <Source
        name="Claude Code"
        logo="/claude-logo.svg"
        connected={status.claudeSessions > 0}
        detail={
          status.claudeSessions > 0
            ? `${status.claudeSessions} recent ${status.claudeSessions === 1 ? 'session' : 'sessions'} found`
            : 'Nothing found yet. It appears here once you have used Claude Code.'
        }
        note="Read straight from ~/.claude/projects. Nothing to connect and nothing to authorise."
      />

      <Source
        name="ChatGPT"
        logo="/openai-logo.svg"
        connected={status.importedSessions > 0}
        detail="Settings → Data controls → Export data, then drop conversations.json below."
        // The honest reason, stated plainly. "Not supported" would imply we
        // could not be bothered; this is a deliberate decision by OpenAI and
        // working around it would be the wrong kind of clever.
        note="The desktop app encrypts its local history, so an export is the only supported way in."
      />

      <Source
        name="Gemini"
        logo="/gemini-logo.svg"
        connected={status.importedSessions > 0}
        detail="Google Takeout → My Activity → Gemini Apps, in JSON. Drop it below."
        note="Gemini keeps nothing on your machine, so there is nothing to read locally."
      />

      <ImportHistory onImported={onImported} className="pt-1" />

      {/*
       * The exact promise. Every line here is enforced somewhere in the code,
       * and if one stops being true it comes off this screen the same day.
       */}
      <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.02] p-4">
        <p className="flex items-center gap-2 text-[0.6875rem] uppercase tracking-[0.18em] text-white/35">
          <ShieldCheck className="size-3.5" />
          What is taken, exactly
        </p>

        <ul className="mt-3 space-y-2">
          {[
            'A session title, its last prompt, the project folder and the branch.',
            'Nothing else from any conversation. Not the messages, not the code, not the replies.',
            'Read on this machine. None of it is uploaded, and no file is copied or kept.',
            'Delete it any time and the source is forgotten immediately.',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-[0.8125rem] text-white/65">
              <Check className="mt-0.5 size-3.5 shrink-0 text-[#A9E5C3]" />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Source({
  name,
  logo,
  connected,
  detail,
  note,
}: {
  name: string;
  logo: string;
  connected: boolean;
  detail: string;
  note: string;
}) {
  return (
    <div
      className={cn(
        'rounded-[14px] border p-4 transition-colors duration-300',
        connected
          ? 'border-[#B8A6FF]/35 bg-[#B8A6FF]/[0.07]'
          : 'border-white/[0.07] bg-white/[0.02]',
      )}
    >
      <div className="flex items-start gap-3">
        <img src={logo} alt="" aria-hidden="true" width={20} height={20} className="mt-0.5 size-5 shrink-0" />

        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-medium text-white">{name}</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-white/55">{detail}</p>
          <p className="mt-1.5 text-[0.75rem] leading-relaxed text-white/35">{note}</p>
        </div>

        {connected && (
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#B8A6FF]">
            <Check className="size-3 text-white" />
          </span>
        )}
      </div>
    </div>
  );
}
