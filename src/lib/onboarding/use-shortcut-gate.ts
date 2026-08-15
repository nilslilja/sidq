import { useEffect, useRef, useState } from 'react';

/*
 * A step that advances on a real keypress.
 *
 * The reason this exists rather than a Next button: a shortcut you have pressed
 * once is a shortcut you still know next week, and a shortcut you read about is
 * not. Three screens of this is why people who finish these flows actually use
 * the product rather than clicking through it.
 *
 * It also lights each modifier as it goes down, so a half-pressed combination
 * shows which key is missing instead of just not working.
 */

export interface Combo {
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  /** KeyboardEvent.code, so it is layout independent. */
  code: string;
}

export interface HeldKeys {
  meta: boolean;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  key: boolean;
}

const NONE: HeldKeys = { meta: false, shift: false, alt: false, ctrl: false, key: false };

export function useShortcutGate(args: {
  armed: boolean;
  combo: Combo;
  onComplete: () => void;
}): { held: HeldKeys; completed: boolean } {
  const [held, setHeld] = useState<HeldKeys>(NONE);
  const [completed, setCompleted] = useState(false);

  // Kept in a ref so the listener is attached once per arming rather than being
  // torn down and rebuilt on every modifier press.
  const onComplete = useRef(args.onComplete);
  onComplete.current = args.onComplete;
  const combo = useRef(args.combo);
  combo.current = args.combo;

  useEffect(() => {
    if (!args.armed) {
      setHeld(NONE);
      setCompleted(false);
      return;
    }

    const read = (e: KeyboardEvent, keyDown: boolean): HeldKeys => ({
      meta: e.metaKey,
      shift: e.shiftKey,
      alt: e.altKey,
      ctrl: e.ctrlKey,
      key: keyDown,
    });

    const matches = (e: KeyboardEvent): boolean => {
      const c = combo.current;
      return (
        e.code === c.code &&
        e.metaKey === Boolean(c.meta) &&
        e.shiftKey === Boolean(c.shift) &&
        e.altKey === Boolean(c.alt) &&
        e.ctrlKey === Boolean(c.ctrl)
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      setHeld(read(e, e.code === combo.current.code));
      if (!matches(e)) return;

      // The OS shortcut fires too; stopping the browser default keeps the two from
      // both acting on one press.
      e.preventDefault();
      setCompleted(true);
      // A beat, so the keys are seen lighting up before the screen changes. Without
      // it the step appears to skip and people are not sure what they did.
      window.setTimeout(() => onComplete.current(), 420);
    };

    const onKeyUp = (e: KeyboardEvent) => setHeld(read(e, false));
    // Modifiers released while the window is not focused are never seen, so the
    // display would stay stuck lit. Clearing on blur is the honest reset.
    const onBlur = () => setHeld(NONE);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [args.armed]);

  return { held, completed };
}
