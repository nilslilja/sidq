import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { useSidq } from '@/state/SidqProvider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { completedCount, plannedCount } from '@/types/domain';

/*
 * Evening shutdown. Thirty seconds, three beats: what landed, what rolls forward,
 * one line about how it went. Then the streak.
 *
 * The tone here matters more than anywhere else in the product. This screen runs on
 * the days that went badly, and it is the screen that decides whether they come back.
 */
export function Shutdown() {
  const { today, finishDay, lastStreakMessage } = useSidq();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  if (!today) {
    navigate('/today', { replace: true });
    return null;
  }

  const completed = today.tasks.filter((t) => t.status === 'completed');
  const rolling = today.tasks.filter((t) => t.status === 'pending' || t.status === 'active');
  const doneCount = completedCount(today);
  const planned = plannedCount(today);

  const submit = async () => {
    setSaving(true);
    await finishDay(note.trim());
    setSaving(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="column grid min-h-[100dvh] place-items-center text-center">
        <div>
          <h1 className="font-display text-[2.5rem]">Day closed.</h1>
          {lastStreakMessage && <p className="mt-4 text-[0.9375rem] text-accent">{lastStreakMessage}</p>}
          <p className="mx-auto mt-4 max-w-[32ch] text-sm leading-relaxed text-muted">
            {rolling.length > 0
              ? `${rolling.length} ${rolling.length === 1 ? 'thing moves' : 'things move'} to tomorrow. You will not have to remember ${rolling.length === 1 ? 'it' : 'them'}.`
              : 'Nothing left over. Tomorrow starts clean.'}
          </p>
          <Button className="mt-10" onClick={() => navigate('/momentum')}>
            See the week
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="column min-h-[100dvh] py-12">
      <h1 className="font-display text-[2.5rem] leading-tight">
        {doneCount === 0 ? 'Some days are like that.' : `${doneCount} of ${planned} done.`}
      </h1>
      <p className="mt-3 max-w-[38ch] text-sm leading-relaxed text-muted">
        {doneCount === 0
          ? 'Nothing got ticked off. It still goes on the record, and everything moves forward.'
          : 'Take thirty seconds to close it out properly.'}
      </p>

      {completed.length > 0 && (
        <section className="mt-10" aria-labelledby="landed">
          <h2 id="landed" className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
            Landed
          </h2>
          <ul className="mt-4 space-y-3">
            {completed.map((t) => (
              <li key={t.id} className="flex items-start gap-3 text-[0.9375rem]">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent">
                  <Check className="size-3 stroke-[3]" style={{ color: 'var(--color-accent-text)' }} />
                </span>
                {t.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rolling.length > 0 && (
        <section className="mt-10" aria-labelledby="rolls">
          <h2 id="rolls" className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
            Rolls to tomorrow
          </h2>
          <ul className="mt-4 space-y-3">
            {rolling.map((t) => (
              <li key={t.id} className="flex items-start gap-3 text-[0.9375rem] text-muted">
                <span className="mt-0.5 size-5 shrink-0 rounded-full border border-line" />
                {t.title}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            Tomorrow's plan is built around these. Anything you have been dodging gets made
            smaller rather than repeated.
          </p>
        </section>
      )}

      <section className="mt-10" aria-labelledby="reflect">
        <h2 id="reflect" className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
          One line about today
        </h2>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional. Anything you want tomorrow-you to know."
          className={cn(
            'mt-4 w-full glass-subtle rounded-(--radius) px-4 py-3.5',
            'text-[0.9375rem] text-text placeholder:text-muted/60',
            'transition-colors duration-(--duration-fast) focus:border-accent focus:outline-none',
          )}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
      </section>

      <div className="mt-12">
        <Button block size="lg" onClick={submit} disabled={saving}>
          {saving ? 'Closing…' : 'Close the day'}
        </Button>
      </div>
    </div>
  );
}
