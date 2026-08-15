import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { useSidq } from '@/state/SidqProvider';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Button } from '@/components/ui/button';
import { formatClock } from '@/lib/date';

/*
 * Focus mode. One task, one ring, nothing else on screen, the antidote to the
 * board when the board itself becomes the distraction.
 */
export function FocusMode() {
  const { taskId } = useParams<{ taskId: string }>();
  const { today, toggle } = useSidq();
  const navigate = useNavigate();

  const task = today?.tasks.find((t) => t.id === decodeURIComponent(taskId ?? ''));
  const totalSeconds = (task?.estMinutes ?? 25) * 60;

  const [remaining, setRemaining] = useState(totalSeconds);
  const [running, setRunning] = useState(true);
  const [elapsedAlert, setElapsedAlert] = useState(false);

  // Wall-clock based rather than tick-counting: a backgrounded tab throttles
  // setInterval, and a timer that silently runs slow is worse than no timer.
  const deadlineRef = useRef<number>(Date.now() + totalSeconds * 1000);

  useEffect(() => {
    setRemaining(totalSeconds);
    deadlineRef.current = Date.now() + totalSeconds * 1000;
  }, [totalSeconds]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const left = Math.round((deadlineRef.current - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) {
        setRunning(false);
        setElapsedAlert(true);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);

  const pause = useCallback(() => {
    setRunning(false);
    setRemaining(Math.round((deadlineRef.current - Date.now()) / 1000));
  }, []);

  const resume = useCallback(() => {
    deadlineRef.current = Date.now() + Math.max(0, remaining) * 1000;
    setRunning(true);
  }, [remaining]);

  const finish = useCallback(() => {
    if (task) toggle(task.id);
    navigate('/today');
  }, [task, toggle, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('/today');
      if (e.key === ' ') {
        e.preventDefault();
        running ? pause() : resume();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, pause, resume, navigate]);

  if (!task) {
    navigate('/today', { replace: true });
    return null;
  }

  const progress = 1 - Math.max(0, remaining) / totalSeconds;

  return (
    <div className="relative grid min-h-[100dvh] place-items-center">
      <button
        onClick={() => navigate('/today')}
        aria-label="Leave focus mode"
        className="absolute right-5 top-5 grid size-10 place-items-center rounded-full text-muted transition-colors duration-(--duration-fast) hover:text-text"
      >
        <X className="size-5" />
      </button>

      <div className="column flex flex-col items-center text-center">
        <ProgressRing progress={progress} size={224} strokeWidth={2} label="Time remaining">
          <span className="text-[2.5rem] font-normal">{formatClock(Math.max(0, remaining))}</span>
        </ProgressRing>

        <h1 className="mt-12 max-w-[24ch] font-display text-[1.75rem] leading-tight">{task.title}</h1>
        {task.why && <p className="mt-3 max-w-[34ch] text-sm leading-relaxed text-muted">{task.why}</p>}

        {elapsedAlert && (
          <p aria-live="polite" className="mt-6 text-sm text-accent">
            Time is up. Stop here or keep going, both are fine.
          </p>
        )}

        <div className="mt-12 flex items-center gap-3">
          <Button variant="outline" onClick={running ? pause : resume}>
            {running ? 'Pause' : 'Resume'}
          </Button>
          <Button onClick={finish}>Done</Button>
        </div>

        <p className="mt-8 text-xs text-muted">Space to pause · Esc to go back</p>
      </div>
    </div>
  );
}
