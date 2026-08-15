import { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  parseExport,
  saveImported,
  UnknownExportError,
  type ImportSource,
} from '@/lib/companion/import-history';
import type { WorkSession } from '@/lib/companion/work-history';

/*
 * Drop your ChatGPT or Gemini export here.
 *
 * Claude Code is read live off disk. These two cannot be: ChatGPT encrypts its
 * local cache and Gemini keeps nothing locally at all. The supported route is
 * your own official export, which is one drag and makes the rest of the product
 * work across all three.
 *
 * Read with FileReader and parsed in this process. Nothing is uploaded, and the
 * file itself is not kept — only titles and timestamps survive the parse.
 */

const LABELS: Record<ImportSource, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
};

type State =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'done'; source: ImportSource; added: number; seen: number }
  | { status: 'failed'; message: string };

export function ImportHistory({
  onImported,
  className,
}: {
  onImported: (sessions: WorkSession[]) => void;
  className?: string;
}) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setState({ status: 'reading' });
      try {
        const raw = await file.text();
        const { source, sessions, seen } = parseExport(raw);
        const merged = saveImported(sessions);
        onImported(merged);
        setState({ status: 'done', source, added: sessions.length, seen });
      } catch (err) {
        setState({
          status: 'failed',
          message:
            err instanceof UnknownExportError
              ? err.message
              : 'That file could not be read.',
        });
      }
    },
    [onImported],
  );

  return (
    <div className={className}>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border border-dashed px-4 py-5',
          'text-center transition-colors duration-150',
          dragging
            ? 'border-[#6366F1] bg-[#6366F1]/[0.08]'
            : 'border-white/15 hover:border-white/30',
        )}
      >
        {/* A real input behind the label, so this works by click as well as by
            drag. Drop-only zones are unusable by keyboard. */}
        <input
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        <Upload className="size-4 text-white/40" />

        {state.status === 'reading' ? (
          <p className="text-[0.8125rem] text-white/60">Reading…</p>
        ) : state.status === 'done' ? (
          <p className="text-[0.8125rem] text-[#A9E5C3]">
            {LABELS[state.source]}: {state.added} recent{' '}
            {state.added === 1 ? 'conversation' : 'conversations'} added
            {state.seen > state.added && (
              <span className="text-white/40"> ({state.seen} in the file)</span>
            )}
          </p>
        ) : state.status === 'failed' ? (
          <p className="text-[0.8125rem] text-[#FFB4A2]">{state.message}</p>
        ) : (
          <>
            <p className="text-[0.8125rem] text-white/70">
              Drop your ChatGPT or Gemini export
            </p>
            <p className="text-[0.6875rem] leading-relaxed text-white/35">
              Parsed here, never uploaded. Only titles and dates are kept.
            </p>
          </>
        )}
      </label>

      {/*
       * Where to get the files. Nobody knows these paths, and a drop zone with
       * no instructions is a drop zone nobody uses.
       */}
      <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-white/30">
        ChatGPT: Settings → Data controls → Export, then use{' '}
        <span className="text-white/50">conversations.json</span>. Gemini: Google
        Takeout → My Activity → Gemini Apps, JSON format.
      </p>
    </div>
  );
}
