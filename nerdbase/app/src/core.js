/* Nerdbase core: store, helpers, sound, haptics. */
(function (NB) {
  const pad = (n) => String(n).padStart(2, '0');
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const clock = { offsetDays: +(params.get('dayoffset') || 0), speed: params.get('fast') ? 60 : 1 };
  const nowDate = () => new Date(Date.now() + clock.offsetDays * 864e5);
  const dayKey = (d = nowDate()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); const dt = new Date(y, m - 1, d + n); return dayKey(dt); };
  const diffDays = (a, b) => { const p = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 864e5); };

  const KEY = 'nb.v1';
  const DEFAULTS = () => ({
    v: 1, onboarded: false, name: '', goal: 'both', interests: [], dailyGoal: 'steady', blocks: 4, reward: 'Musik', lang: 'sv', sound: true, haptics: true, reminder: '18:00',
    xp: 0, xpDay: {}, streak: { count: 0, last: null, freezes: 0, best: 0 }, days: {}, lessons: { day: null, n: 0, bonus: 0 }, scans: { day: null, n: 0 },
    nodes: {}, tests: {}, mistakes: [], errlog: {}, attempts: { total: 0, correct: 0 }, saved: [], recent: [], pro: false, trial: false, focus: { sessions: 0, minutes: 0 }, prov: { week: null, n: 0 }, course: 'matte', accuracyLog: [],
  });
  let S = DEFAULTS();
  let memory = null;
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(DEFAULTS(), JSON.parse(raw)); } catch (e) { if (memory) S = memory; }
    return S;
  }
  function save() { memory = S; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage may be blocked */ } }
  function reset() { S = DEFAULTS(); save(); return S; }

  /* ---- streak and daily counters ---- */
  function effectiveStreak() {
    const t = dayKey(); const s = S.streak;
    if (!s.last) return 0;
    const gap = diffDays(s.last, t);
    if (gap <= 1) return s.count;
    if (gap === 2 && s.freezes > 0) return s.count;
    return 0;
  }
  function countedToday() { return S.streak.last === dayKey(); }
  /* Called when a lesson completes. Returns {extended, used freeze, earnedFreeze, count} */
  function registerLesson() {
    const t = dayKey(); const s = S.streak; const out = { extended: false, usedFreeze: false, earnedFreeze: false };
    S.days[t] = (S.days[t] || 0) + 1;
    if (s.last === t) { out.count = s.count; return out; }
    if (!s.last) s.count = 1;
    else {
      const gap = diffDays(s.last, t);
      if (gap === 1) s.count += 1;
      else if (gap === 2 && s.freezes > 0) { s.freezes -= 1; s.count += 1; out.usedFreeze = true; }
      else s.count = 1;
    }
    s.last = t; s.best = Math.max(s.best, s.count); out.extended = true; out.count = s.count;
    if (s.count % NB.Tuning.streakFreezeEvery === 0 && s.freezes < 2) { s.freezes += 1; out.earnedFreeze = true; }
    return out;
  }
  function lessonsLeft() {
    if (S.pro) return Infinity;
    const t = dayKey(); if (S.lessons.day !== t) S.lessons = { day: t, n: 0, bonus: 0 };
    return NB.Tuning.freeLessonsPerDay + S.lessons.bonus - S.lessons.n;
  }
  function useLesson() { const t = dayKey(); if (S.lessons.day !== t) S.lessons = { day: t, n: 0, bonus: 0 }; S.lessons.n += 1; save(); }
  function addBonusLesson() { lessonsLeft(); if (S.lessons.bonus < NB.Tuning.bonusMax) { S.lessons.bonus += 1; save(); return true; } return false; }
  function scansLeft() { if (S.pro) return Infinity; const t = dayKey(); if (S.scans.day !== t) S.scans = { day: t, n: 0 }; return NB.Tuning.freeScansPerDay - S.scans.n; }
  function useScan() { const t = dayKey(); if (S.scans.day !== t) S.scans = { day: t, n: 0 }; S.scans.n += 1; save(); }
  function addXP(n) { const t = dayKey(); S.xp += n; S.xpDay[t] = (S.xpDay[t] || 0) + n; save(); }
  const xpToday = () => S.xpDay[dayKey()] || 0;
  const goalXP = () => NB.Tuning.dailyGoals[S.dailyGoal] || 20;

  /* ---- skill mastery / path ---- */
  function nodeOf(id) { return S.nodes[id] || (S.nodes[id] = { level: 0, last: 0, ease: 2.5, box: 0, due: 0 }); }
  function completeSkill(id, accuracy) {
    const n = nodeOf(id);
    if (accuracy >= 0.9) { n.level = Math.min(3, n.level + 1); n.ease = Math.min(3, n.ease + 0.1); n.box = Math.min(NB.Tuning.leitner.length - 1, n.box + 1); }
    else if (accuracy >= 0.7) { if (n.level === 0) n.level = 1; n.box = Math.max(0, n.box); }
    else { n.ease = Math.max(1.3, n.ease - 0.2); n.box = 0; }
    n.last = Date.now(); n.due = Date.now() + NB.Tuning.leitner[n.box] * (n.ease / 2.5) * 864e5; save();
    return n;
  }
  const isDue = (id) => { const n = S.nodes[id]; return !!n && n.level > 0 && n.due && n.due < Date.now() + clock.offsetDays * 864e5; };
  function skillsOf(course) { return NB.content.SKILLS.filter((s) => s.course === course); }
  function unlocked(course, id) {
    const list = skillsOf(course); const i = list.findIndex((s) => s.id === id); if (i <= 0) return true;
    const prev = list[i - 1]; return nodeOf(prev.id).level >= 1;
  }
  function currentSkill(course) { const list = skillsOf(course); return list.find((s) => nodeOf(s.id).level === 0 && unlocked(course, s.id)) || null; }
  function unitDone(unit, course) { return skillsOf(course).filter((s) => s.unit === unit).every((s) => nodeOf(s.id).level >= 1); }

  /* ---- mistakes and error log ---- */
  function logMistake(ex, trap) {
    S.mistakes = S.mistakes.filter((m) => m.ex.id !== ex.id); S.mistakes.unshift({ ex, t: Date.now(), trap: trap || ex.trap || 'Annat fel' }); S.mistakes = S.mistakes.slice(0, 60);
    const k = trap || ex.trap || 'Annat fel'; S.errlog[k] = (S.errlog[k] || 0) + 1; save();
  }
  function clearMistake(ex) { S.mistakes = S.mistakes.filter((m) => m.ex.id !== ex.id); save(); }

  /* ---- sound and haptics ---- */
  let ac = null;
  function ctx() { if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (C) ac = new C(); } if (ac && ac.state === 'suspended') ac.resume(); return ac; }
  function tone(freq, t0, dur, type = 'sine', vol = 0.12) {
    const a = ctx(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, a.currentTime + t0); g.gain.exponentialRampToValueAtTime(vol, a.currentTime + t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + dur + 0.02);
  }
  const semi = (f, n) => f * Math.pow(2, n / 12);
  const SOUNDS = {
    tap: () => tone(620, 0, 0.07, 'sine', 0.08),
    pop: () => { tone(520, 0, 0.06, 'sine', 0.09); tone(780, 0.04, 0.08, 'sine', 0.07); },
    correct: (n = 0) => { tone(semi(660, n), 0, 0.12, 'sine', 0.13); tone(semi(880, n), 0.09, 0.2, 'sine', 0.12); },
    wrong: () => { tone(190, 0, 0.22, 'triangle', 0.12); tone(150, 0.1, 0.22, 'triangle', 0.1); },
    combo: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.06, 0.14, 'sine', 0.1)),
    complete: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle', 0.12)),
    streak: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.25, 'sine', 0.11)); },
    unlock: () => [880, 1109, 1319].forEach((f, i) => tone(f, i * 0.05, 0.2, 'sine', 0.09)),
    whoosh: () => { tone(300, 0, 0.12, 'sawtooth', 0.03); tone(500, 0.04, 0.12, 'sawtooth', 0.025); },
    shutter: () => { tone(1800, 0, 0.03, 'square', 0.05); tone(900, 0.04, 0.05, 'square', 0.04); },
    timer: () => [660, 660, 880].forEach((f, i) => tone(f, i * 0.18, 0.16, 'sine', 0.12)),
  };
  const fx = {
    play(name, a) { if (!S.sound) return; try { SOUNDS[name] && SOUNDS[name](a); } catch (e) { /* audio blocked */ } },
    buzz(p) { if (!S.haptics) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* unsupported */ } },
    tap() { fx.play('tap'); fx.buzz(8); }, good() { fx.buzz(18); }, bad() { fx.buzz([30, 40, 30]); }, big() { fx.buzz([20, 30, 20, 30, 60]); },
  };

  /* ---- helpers ---- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const L = (sv, en) => (S.lang === 'en' && en != null ? en : sv);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const mmss = (sec) => `${pad(Math.floor(sec / 60))}:${pad(Math.floor(sec % 60))}`;
  const ICON = {
    flame: (c = '#FB6415') => `<svg class="ico" viewBox="0 0 24 24"><path fill="${c}" d="M12 2c1 3.5 5 5.5 5 10.5A5 5 0 0 1 12 18a5 5 0 0 1-5-5.5c0-2 1-3 2-4 .2 1.6 1 2.3 1.8 2.5C10.2 8 10.8 4.5 12 2z"/></svg>`,
    bolt: (c = '#F5B301') => `<svg class="ico" viewBox="0 0 24 24"><path fill="${c}" d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
    lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
    play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
    star: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>`,
    trophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 21h8M10 18h4"/></svg>`,
    home: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 3 10.5V21h6v-6h6v6h6V10.5z"/></svg>`,
    scan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/></svg>`,
    practice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5V21"/></svg>`,
    chev: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>`,
    bulb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.7.6 1 1.3 1 2.1h5c0-.8.3-1.5 1-2.1A6 6 0 0 0 12 3z"/></svg>`,
    img: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 9"/></svg>`,
    keyboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="3"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7 14h10"/></svg>`,
    mistake: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`,
    target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>`,
    chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
    flash: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>`,
    x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  };
  NB.Tuning = Object.assign(NB.Tuning || {}, { streakFreezeEvery: 7 });
  NB.core = { get S() { return S; }, load, save, reset, dayKey, addDays, diffDays, clock, effectiveStreak, countedToday, registerLesson, lessonsLeft, useLesson, addBonusLesson, scansLeft, useScan, addXP, xpToday, goalXP, nodeOf, completeSkill, isDue, skillsOf, unlocked, currentSkill, unitDone, logMistake, clearMistake, fx, esc, L, $, $$, mmss, ICON, nowDate, tone };
})(typeof NB !== 'undefined' ? NB : (globalThis.NB = globalThis.NB || {}));
