/* Nerdbase content: skills, parametric exercise generators (correct by construction), authored items, lesson builder.
   Pure logic, no DOM. */
(function (NB) {
  const Tuning = {
    lessonLength: 10, testLength: 14, refreshLength: 8, mistakesLength: 6,
    xpBase: 10, xpPerfect: 5, xpCombo: 3, xpTest: 20, xpRefresh: 5,
    freeLessonsPerDay: 3, bonusMax: 2, freeScansPerDay: 2, testPass: 0.8,
    leitner: [1, 3, 7, 14, 30], dailyGoals: { chill: 10, steady: 20, serious: 30, insane: 50 },
    combo: [3, 5, 8], focusMin: 25, breakMin: 7,
  };

  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  function shuffle(r, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const M = (s) => `<span class="m">${s}</span>`;
  const mi = (s) => s.replace(/-/g, '−');

  // complex helpers: text for grader ("3-4i") and html
  function cxSrc(a, b) { if (b === 0) return String(a); if (a === 0) return b === 1 ? 'i' : b === -1 ? '-i' : b + 'i'; return a + (b < 0 ? '-' : '+') + (Math.abs(b) === 1 ? '' : Math.abs(b)) + 'i'; }
  function cxHtml(a, b) { return mi(cxSrc(a, b)).replace(/i/g, '<i>i</i>').replace(/\+/g, ' + ').replace(/(?<=\S)−/g, ' − '); }
  const cmul = (a, b, c, d) => [a * c - b * d, a * d + b * c];

  /* ---- skills ---- */
  const SKILLS = [
    { id: 'm.i', course: 'matte', unit: 'Komplexa tal', title: 'Imaginära enheten', blurb: 'i, i² och rötter ur negativa tal', icon: 'i' },
    { id: 'm.add', course: 'matte', unit: 'Komplexa tal', title: 'Addera och subtrahera', blurb: 'Reella och imaginära delar var för sig', icon: '+' },
    { id: 'm.mul', course: 'matte', unit: 'Komplexa tal', title: 'Multiplikation', blurb: 'Parentesmultiplikation med i² = −1', icon: '×' },
    { id: 'm.conj', course: 'matte', unit: 'Komplexa tal', title: 'Konjugat och belopp', blurb: 'z̄ och |z|', icon: '|z|' },
    { id: 'm.div', course: 'matte', unit: 'Komplexa tal', title: 'Division', blurb: 'Förläng med konjugatet', icon: '÷' },
    { id: 'h.kva1', course: 'hp', unit: 'KVA', title: 'Jämförelsetekniken', blurb: 'Testa x = 0, 1, −1 och bråk', icon: '≶' },
    { id: 'h.kva2', course: 'hp', unit: 'KVA', title: 'Storleksordning', blurb: 'Bråk och decimaltal i rätt ordning', icon: '<' },
    { id: 'h.pct', course: 'hp', unit: 'XYZ', title: 'Procent och förändringsfaktor', blurb: 'Faktorer slår att addera procent', icon: '%' },
    { id: 'h.eq', course: 'hp', unit: 'XYZ', title: 'Ekvationer', blurb: 'Lös ut x snabbt', icon: 'x' },
  ];
  const COURSES = [
    { id: 'matte', title: 'Matte 4', long: 'Matematik 4', units: ['Komplexa tal'] },
    { id: 'hp', title: 'Högskoleprovet', long: 'Högskoleprovet Kvantitativ', units: ['KVA', 'XYZ'] },
  ];

  /* ---- exercise factories ---- */
  function choice(id, skill, instr, promptHtml, options, answerIdx, explain, extra = {}) {
    return Object.assign({ id, skill, kind: 'choice', instr, prompt: promptHtml, options, answerIdx, explain, fixed: false }, extra);
  }
  function numeric(id, skill, instr, promptHtml, answer, explain, extra = {}) {
    return Object.assign({ id, skill, kind: 'numeric', instr, prompt: promptHtml, answer, explain, hint: extra.hint || null }, extra);
  }

  const G = {};

  /* Imaginära enheten */
  G['m.i'] = (r, d, n) => {
    const t = r();
    if (t < 0.4) {
      const k = ri(r, 2, d > 1 ? 31 : 15), res = [['1', '1'], ['i', 'i'], ['-1', '-1'], ['-i', '-i']][k % 4];
      const opts = ['1', 'i', '−1', '−i'].map((s) => s.replace('i', '<i>i</i>'));
      return choice(n, 'm.i', 'Välj rätt värde', `Vad är ${M(`<i>i</i><sup>${k}</sup>`)}?`, opts, ['1', 'i', '-1', '-i'].indexOf(res[0]),
        `i upprepas i cykler om 4: i, −1, −i, 1. ${k} har resten ${k % 4} vid division med 4, alltså blir svaret ${opts[['1', 'i', '-1', '-i'].indexOf(res[0])]}.`,
        { fixed: true, trap: 'Räknade fel i fyrcykeln', verify: `i^${k}`, verifyAnswer: res[0] });
    }
    if (t < 0.8) {
      const k = ri(r, 2, d > 1 ? 15 : 9);
      return numeric(n, 'm.i', 'Skriv svaret som ett tal med i', `Förenkla ${M(`√(−${k * k})`)}`, `${k}i`,
        `√(−${k * k}) = √(${k * k})·√(−1) = ${k}<i>i</i>.`, { trap: 'Glömde i', traps: [{ ans: String(k), label: 'Glömde i' }, { ans: `-${k}i`, label: 'Teckenfel' }], verify: `sqrt(-${k * k})` });
    }
    const a = ri(r, 2, 9);
    return choice(n, 'm.i', 'Välj rätt värde', `Vad är ${M(`(${a}<i>i</i>)<sup>2</sup>`)}?`, [`${a * a}`, `−${a * a}`, `${a * a}<i>i</i>`, `−${a}`].map(String), 1,
      `(${a}i)² = ${a}²·i² = ${a * a}·(−1) = −${a * a}.`, { trap: 'i² = −1 glömdes', verify: `(${a}i)^2`, verifyAnswer: String(-a * a) });
  };

  /* Addera och subtrahera */
  G['m.add'] = (r, d, n) => {
    const m = d > 1 ? 12 : 8, a = ri(r, -m, m), b = ri(r, -m, m) || 3, c = ri(r, -m, m), e = ri(r, -m, m) || -2, sub = r() < 0.5;
    const res = sub ? [a - c, b - e] : [a + c, b + e];
    return numeric(n, 'm.add', 'Skriv svaret på formen a + bi', `Beräkna ${M(`(${cxHtml(a, b)}) ${sub ? '−' : '+'} (${cxHtml(c, e)})`)}`, cxSrc(res[0], res[1]),
      `Räkna reella delar för sig och imaginära för sig: reellt ${a} ${sub ? '−' : '+'} ${c < 0 ? '(' + c + ')' : c} = ${res[0]}, imaginärt ${b} ${sub ? '−' : '+'} ${e < 0 ? '(' + e + ')' : e} = ${res[1]}.`,
      { verify: `(${cxSrc(a, b)})${sub ? '-' : '+'}(${cxSrc(c, e)})`, trap: 'Teckenfel vid subtraktion', traps: sub ? [{ ans: cxSrc(a + c, b + e), label: 'Subtraherade som addition' }] : [] });
  };

  /* Multiplikation */
  G['m.mul'] = (r, d, n) => {
    if (d >= 2 && r() < 0.3) {
      const a = ri(r, 1, 6), b = ri(r, 1, 6), s = r() < 0.5 ? 1 : -1;
      const z = [a, s * b], sq = cmul(a, s * b, a, s * b);
      return numeric(n, 'm.mul', 'Skriv svaret på formen a + bi', `Beräkna ${M(`(${cxHtml(z[0], z[1])})<sup>2</sup>`)}`, cxSrc(sq[0], sq[1]),
        `(${cxSrc(z[0], z[1])})² = ${a * a} + 2·${a}·${s * b}i + (${s * b}i)² = ${a * a} + ${2 * a * s * b}i − ${b * b} = ${sq[0]} + ${sq[1]}i.`,
        { verify: `(${cxSrc(z[0], z[1])})^2`, trap: 'Glömde mittentermen', traps: [{ ans: cxSrc(a * a - b * b, 0), label: 'Glömde mittentermen' }, { ans: cxSrc(a * a + b * b, 2 * a * s * b), label: 'i² = −1 glömdes' }] });
    }
    const m = d > 1 ? 6 : 4, a = ri(r, -m, m) || 2, b = ri(r, -m, m) || 3, c = ri(r, -m, m) || 1, e = ri(r, -m, m) || -2;
    const p = cmul(a, b, c, e);
    return numeric(n, 'm.mul', 'Skriv svaret på formen a + bi', `Beräkna ${M(`(${cxHtml(a, b)})(${cxHtml(c, e)})`)}`, cxSrc(p[0], p[1]),
      `Multiplicera ut: ${a * c} ${b * e < 0 ? '−' : '+'} ${Math.abs(b * e)}i² + imaginära delar ${a * e + b * c}i. Med i² = −1 blir reella delen ${a * c} ${-b * e < 0 ? '−' : '+'} ${Math.abs(b * e)} = ${p[0]}. Svar: ${cxHtml(p[0], p[1])}.`,
      { verify: `(${cxSrc(a, b)})(${cxSrc(c, e)})`, trap: 'i² = −1 glömdes', traps: [{ ans: cxSrc(a * c + b * e, a * e + b * c), label: 'i² = −1 glömdes' }] });
  };

  /* Konjugat och belopp */
  const TRIPLES = [[3, 4], [5, 12], [8, 15], [6, 8], [20, 21], [9, 12], [7, 24]];
  G['m.conj'] = (r, d, n) => {
    const t = r();
    if (t < 0.35) {
      const a = ri(r, -9, 9), b = ri(r, -9, 9) || 4;
      return numeric(n, 'm.conj', 'Skriv svaret på formen a + bi', `Vad är konjugatet av ${M(cxHtml(a, b))}?`, cxSrc(a, -b),
        `Konjugatet byter tecken på den imaginära delen: ${cxHtml(a, -b)}.`, { verify: cxSrc(a, -b), trap: 'Bytte tecken på reella delen', traps: [{ ans: cxSrc(-a, b), label: 'Bytte tecken på reella delen' }] });
    }
    if (t < 0.8) {
      const [p, q] = pick(r, TRIPLES), sa = r() < 0.5 ? 1 : -1, sb = r() < 0.5 ? 1 : -1, sw = r() < 0.5, a = sa * (sw ? q : p), b = sb * (sw ? p : q);
      const h = Math.hypot(p, q);
      return numeric(n, 'm.conj', 'Skriv beloppet som ett tal', `Beräkna ${M(`|${cxHtml(a, b)}|`)}`, String(h),
        `|a + bi| = √(a² + b²) = √(${a * a} + ${b * b}) = √${a * a + b * b} = ${h}.`, { verify: String(h), trap: 'Glömde roten', traps: [{ ans: String(a * a + b * b), label: 'Glömde roten' }, { ans: String(Math.abs(a) + Math.abs(b)), label: 'Adderade delarna' }] });
    }
    const a = ri(r, 1, 7), b = ri(r, 1, 7), v = a * a + b * b;
    return choice(n, 'm.conj', 'Välj rätt värde', `Vad är ${M(`(${cxHtml(a, b)})(${cxHtml(a, -b)})`)}?`, [`${a * a - b * b}`, `${v}`, `${a * a + b * b}<i>i</i>`, `${2 * a}`].map((s) => mi(s)), 1,
      `z·z̄ = a² + b² = ${a * a} + ${b * b} = ${v}. Konjugatprodukten blir alltid reell.`, { trap: 'Subtraherade i stället för adderade', fixed: false });
  };

  /* Division, byggd bakifrån så svaret blir heltal */
  G['m.div'] = (r, d, n) => {
    const m = d > 1 ? 5 : 3, p = ri(r, -m, m) || 2, q = ri(r, -m, m) || 1, c = ri(r, 1, 4), s = ri(r, 1, 3) * (r() < 0.5 ? 1 : -1);
    const num = cmul(p, q, c, s), den = c * c + s * s;
    return numeric(n, 'm.div', 'Skriv svaret på formen a + bi', `Beräkna ${M(`(${cxHtml(num[0], num[1])}) / (${cxHtml(c, s)})`)}`, cxSrc(p, q),
      `Förläng med nämnarens konjugat ${cxHtml(c, -s)}. Nämnaren blir ${c}² + ${s * s} = ${den} och täljaren (${cxSrc(num[0], num[1])})(${cxSrc(c, -s)}) = ${cxSrc(num[0] * c + num[1] * s, num[1] * c - num[0] * s)}. Dela med ${den}: ${cxHtml(p, q)}.`,
      { verify: `(${cxSrc(num[0], num[1])})/(${cxSrc(c, s)})`, trap: 'Glömde förlänga med konjugatet', traps: [{ ans: cxSrc(num[0] / c, num[1] / s), label: 'Delade del för del' }] });
  };

  /* KVA: jämförelsetekniken */
  const KVA_OPTS = ['I är större', 'II är större', 'I och II är lika stora', 'Informationen är otillräcklig'];
  function kva(n, skill, given, I, II, ans, explain, extra = {}) {
    return choice(n, skill, 'Jämför kvantiteterna', `${given}`, KVA_OPTS, ans, explain, Object.assign({ kva: { I, II }, fixed: true }, extra));
  }
  G['h.kva1'] = (r, d, n) => {
    const t = ri(r, 0, 8);
    switch (t) {
      case 0: return kva(n, 'h.kva1', `För ett tal ${M('<i>x</i>')} gäller att ${M('<i>x</i> &gt; 0')}.`, M('<i>x</i><sup>2</sup>'), M('<i>x</i>'), 3,
        `Testa x = ½: I = ¼, II = ½ (II störst). Testa x = 2: I = 4, II = 2 (I störst). Olika utfall, alltså otillräcklig.`, { trap: 'Testade bara heltal', tip: 'Testa x = ½, 1 och 2.' });
      case 1: return kva(n, 'h.kva1', `För ett tal ${M('<i>x</i>')} gäller att ${M('0 &lt; <i>x</i> &lt; 1')}.`, M('<i>x</i><sup>2</sup>'), M('<i>x</i>'), 1,
        `När 0 < x < 1 blir x² mindre än x. Testa x = ½: I = ¼ och II = ½. Alltså är II större.`, { trap: 'Antog att kvadrat alltid är större', tip: 'Testa ett bråk mellan 0 och 1.' });
      case 2: return kva(n, 'h.kva1', `För ett tal ${M('<i>x</i>')} gäller att ${M('<i>x</i> &gt; 1')}.`, M('<i>x</i><sup>2</sup>'), M('<i>x</i>'), 0,
        `När x > 1 växer x² snabbare än x. Testa x = 2: I = 4, II = 2. Alltså är I större.`, { trap: 'Förväxlade intervallen' });
      case 3: return kva(n, 'h.kva1', `För ett tal ${M('<i>x</i>')} gäller att ${M('<i>x</i> &lt; 0')}.`, M('<i>x</i><sup>2</sup>'), M('<i>x</i>'), 0,
        `Ett negativt tal i kvadrat blir positivt, så I > 0 medan II < 0. Alltså är I större.`, { trap: 'Glömde att kvadrat blir positiv' });
      case 4: { const a = ri(r, 2, 9), b = ri(r, 2, 9); return kva(n, 'h.kva1', `${M(`<i>a</i> = ${a}`)} och ${M(`<i>b</i> = ${b}`)}.`, M('<i>a</i> + <i>b</i>'), M('<i>b</i> + <i>a</i>'), 2, `Addition är kommutativ, så a + b = b + a = ${a + b}. Lika stora.`, { trap: 'Räknade i onödan' }); }
      case 5: return kva(n, 'h.kva1', `För talen ${M('<i>x</i>')} och ${M('<i>y</i>')} gäller att ${M('<i>x</i> &gt; 0')} och ${M('<i>y</i> &gt; 0')}.`, M('(<i>x</i> + <i>y</i>)<sup>2</sup>'), M('<i>x</i><sup>2</sup> + <i>y</i><sup>2</sup>'), 0,
        `(x + y)² = x² + 2xy + y². Eftersom x, y > 0 är 2xy > 0, så I är större.`, { trap: 'Glömde mittentermen 2xy' });
      case 6: { const p = ri(r, 2, 8), q = ri(r, p + 1, 12), a = ri(r, 2, 8), b = ri(r, a + 1, 13); const L = p * b, R = q * a;
        const ans = L > R ? 0 : L < R ? 1 : 2; if (ans === 2) return G['h.kva1'](r, d, n);
        return kva(n, 'h.kva1', 'Jämför två bråk.', M(`${fracH(p, q)}`), M(`${fracH(a, b)}`), ans,
          `Korsmultiplicera: ${p}·${b} = ${L} och ${a}·${q} = ${R}. ${L > R ? 'I' : 'II'} är större.`, { trap: 'Jämförde bara täljarna', tip: 'Korsmultiplicera.' }); }
      case 7: return kva(n, 'h.kva1', `${M('<i>n</i>')} är ett heltal och ${M('<i>n</i> &gt; 0')}.`, M('<i>n</i>'), M('<i>n</i><sup>2</sup>'), 3,
        `Testa n = 1: I = 1, II = 1 (lika). Testa n = 2: I = 2, II = 4 (II störst). Olika utfall, alltså otillräcklig.`, { trap: 'Glömde testa n = 1' });
      default: { const x = ri(r, 2, 9); return kva(n, 'h.kva1', `${M(`<i>x</i> = ${x}`)}.`, M('2<i>x</i> + 1'), M('<i>x</i> + <i>x</i> + 1'), 2, `2x + 1 och x + x + 1 är samma uttryck, båda ${2 * x + 1}. Lika stora.`, { trap: 'Räknade i onödan' }); }
    }
  };
  function fracH(a, b) { return `<span class="fr"><span>${a}</span><span>${b}</span></span>`; }

  /* KVA: storleksordning */
  G['h.kva2'] = (r, d, n) => {
    const set = new Set(); const items = [];
    while (items.length < 4) { const q = ri(r, 3, d > 1 ? 13 : 9), p = ri(r, 1, q - 1), k = p / q; const key = Math.round(k * 1e6); if (!set.has(key)) { set.add(key); items.push({ p, q, k }); } }
    const mx = items.reduce((a, b, i) => (b.k > items[a].k ? i : a), 0);
    return choice(n, 'h.kva2', 'Välj rätt svar', 'Vilket av bråken är störst?', items.map((x) => fracH(x.p, x.q)), mx,
      `Omvandla till decimaltal: ${items.map((x) => `${x.p}/${x.q} ≈ ${x.k.toFixed(3).replace('.', ',')}`).join(', ')}. Störst är ${items[mx].p}/${items[mx].q}.`,
      { trap: 'Jämförde bara täljare eller nämnare', fixed: true });
  };

  /* Procent och förändringsfaktor */
  const PCT_PAIRS = [[20, 25], [25, 20], [50, 40], [10, 10], [20, 50], [100, 50], [30, 10], [40, 25], [15, 20], [60, 25], [10, 20], [50, 20], [20, 20]];
  function opts5(r, correct, others) {
    const all = [correct]; for (const o of others) if (!all.includes(o)) all.push(o);
    let x = 1; while (all.length < 5) { const c = correct + x * (x % 2 ? 1 : -1) * 2; if (!all.includes(c)) all.push(c); x++; }
    const sh = shuffle(r, all.slice(0, 5)); return { opts: sh, idx: sh.indexOf(correct) };
  }
  G['h.pct'] = (r, d, n) => {
    const t = r();
    if (t < 0.5) {
      const [p, q] = pick(r, PCT_PAIRS), f = (100 + p) * (100 - q) / 100, ch = Math.round((f - 100) * 100) / 100;
      const fmt = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + String(Math.abs(v)).replace('.', ',') + ' %';
      const { opts, idx } = opts5(r, ch, [p - q, -(q - p) + 1, Math.round((p * q) / 100), ch > 0 ? ch + 2 : ch - 2]);
      return choice(n, 'h.pct', 'Välj rätt svar', `Ett pris höjs med ${p} % och sänks sedan med ${q} %. Hur förändras priset totalt?`, opts.map(fmt), idx,
        `Förändringsfaktor: ${(1 + p / 100).toFixed(2).replace('.', ',')} · ${(1 - q / 100).toFixed(2).replace('.', ',')} = ${(f / 100).toFixed(4).replace(/0+$/, '').replace('.', ',')}. Det motsvarar ${fmt(ch)}. Procent får inte adderas rakt av.`,
        { trap: 'Adderade procenten i stället för att multiplicera faktorerna', fixed: false });
    }
    if (t < 0.75) {
      const p = pick(r, [5, 8, 12, 15, 20, 25, 30, 40, 60]), up = r() < 0.5, f = up ? 1 + p / 100 : 1 - p / 100;
      const fm = (v) => v.toFixed(2).replace('.', ',');
      const { opts, idx } = opts5(r, +f.toFixed(2), [+(up ? p / 100 : -p / 100 + 1).toFixed(2), +(up ? 1 - p / 100 : 1 + p / 100).toFixed(2), +(p / 10).toFixed(2)]);
      return choice(n, 'h.pct', 'Välj rätt svar', `Vilken förändringsfaktor motsvarar en ${up ? 'ökning' : 'minskning'} med ${p} %?`, opts.map(fm), idx,
        `${up ? 'Ökning' : 'Minskning'} med ${p} %: faktorn är 1 ${up ? '+' : '−'} ${fm(p / 100)} = ${fm(f)}.`, { trap: 'Fel tecken i förändringsfaktorn', fixed: false });
    }
    const base = pick(r, [20, 40, 50, 80, 200, 250, 400, 500]), part = pick(r, [0.1, 0.25, 0.5, 0.75, 0.2, 0.3, 0.05]) * base;
    if (!Number.isInteger(part)) return G['h.pct'](r, d, n);
    const pc = (part / base) * 100;
    return numeric(n, 'h.pct', 'Svara med ett tal (i procent)', `Hur många procent är ${part} av ${base}?`, String(pc),
      `${part}/${base} = ${(part / base).toString().replace('.', ',')} = ${String(pc).replace('.', ',')} %.`, { verify: `${part}/${base}*100`, trap: 'Fel jämförelsebas', traps: [{ ans: String((base / part) * 100), label: 'Vände på kvoten' }] });
  };

  /* Ekvationer */
  G['h.eq'] = (r, d, n) => {
    const x = ri(r, -9, 12), a = ri(r, 2, d > 1 ? 9 : 6), b = ri(r, -12, 12), c = a * x + b;
    if (r() < 0.65) return numeric(n, 'h.eq', 'Svara med ett tal', `Lös ekvationen ${M(`${a}<i>x</i> ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${c}`.replace(/-/g, '−'))}.`, String(x),
      `Flytta över ${b}: ${a}x = ${c - b}. Dela med ${a}: x = ${x}.`, { verify: `(${c}-(${b}))/${a}`, trap: 'Teckenfel när konstanten flyttades', traps: [{ ans: String((c + b) / a), label: 'Teckenfel när konstanten flyttades' }] });
    const { opts, idx } = opts5(r, x, [x + 1, x - 1, -x, c - b]);
    return choice(n, 'h.eq', 'Välj rätt svar', `Vilket värde på ${M('<i>x</i>')} uppfyller ${M(`${a}<i>x</i> ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${c}`.replace(/-/g, '−'))}?`, opts.map((v) => String(v).replace('-', '−')), idx,
      `${a}x = ${c} ${b < 0 ? '+' : '−'} ${Math.abs(b)} = ${c - b}, så x = ${x}.`, { trap: 'Teckenfel', fixed: false });
  };

  /* ---- authored items ---- */
  const AUTH = {
    'm.mul': [
      { id: 'a.spot1', kind: 'spot', skill: 'm.mul', instr: 'Tryck på raden där felet sker', prompt: 'Här är en lösning av ' + M('(2 + 3<i>i</i>)(1 − <i>i</i>)') + '. Var gick det fel?',
        lines: ['= 2·1 + 2·(−<i>i</i>) + 3<i>i</i>·1 + 3<i>i</i>·(−<i>i</i>)', '= 2 − 2<i>i</i> + 3<i>i</i> − 3<i>i</i>²', '= 2 + <i>i</i> − 3', '= −1 + <i>i</i>'], wrong: 2,
        explain: 'Raden 3 är fel: −3i² = −3·(−1) = +3, inte −3. Rätt svar är 2 + i + 3 = 5 + i.', trap: 'i² = −1 glömdes' },
      { id: 'a.spot2', kind: 'spot', skill: 'm.mul', instr: 'Tryck på raden där felet sker', prompt: 'Här är en lösning av ' + M('(1 + 2<i>i</i>)(3 + <i>i</i>)') + '. Var gick det fel?',
        lines: ['= 3 + <i>i</i> + 6<i>i</i> + 2<i>i</i>²', '= 3 + 7<i>i</i> + 2·1', '= 5 + 7<i>i</i>'], wrong: 1,
        explain: 'Raden 2 är fel: i² = −1, så 2i² = −2, inte +2. Rätt svar är 3 + 7i − 2 = 1 + 7i.', trap: 'i² = −1 glömdes' },
    ],
    'm.div': [
      { id: 'a.ord1', kind: 'order', skill: 'm.div', instr: 'Tryck stegen i rätt ordning', prompt: 'Beräkna ' + M('(6 + 3<i>i</i>) / (1 + 2<i>i</i>)') + '.',
        steps: ['Förläng med nämnarens konjugat 1 − 2<i>i</i>', 'Täljare: (6 + 3<i>i</i>)(1 − 2<i>i</i>) = 12 − 9<i>i</i>', 'Nämnare: (1 + 2<i>i</i>)(1 − 2<i>i</i>) = 5', 'Svar: (12 − 9<i>i</i>)/5 = 2,4 − 1,8<i>i</i>'],
        explain: 'Först förläng, sedan räkna täljare och nämnare var för sig, sist dela.', trap: 'Fel ordning på stegen' },
    ],
    'm.conj': [
      { id: 'a.spot3', kind: 'spot', skill: 'm.conj', instr: 'Tryck på raden där felet sker', prompt: 'Här är en beräkning av ' + M('|3 − 4<i>i</i>|') + '. Var gick det fel?',
        lines: ['|3 − 4<i>i</i>| = √(3² + (−4<i>i</i>)²)', '= √(9 + 16<i>i</i>²)', '= √(9 − 16)'], wrong: 0,
        explain: 'Beloppet använder bara koefficienterna: |a + bi| = √(a² + b²) = √(9 + 16) = 5. Man ska inte kvadrera i.', trap: 'Kvadrerade i i beloppet' },
    ],
  };

  /* ---- builder ---- */
  let uid = 0;
  function gen(skill, r, level, tries = 0) {
    const pool = AUTH[skill] || [];
    if (pool.length && r() < 0.18 && level >= 1) { const a = pool[Math.floor(r() * pool.length)]; return Object.assign({}, a); }
    const e = G[skill](r, level >= 2 ? 2 : 1, skill + '#' + (++uid));
    e.skill = skill; return e;
  }
  function build(skillIds, count, level, seed) {
    const r = rng(seed ?? (Date.now() & 0xfffffff)); const out = []; const seen = new Set();
    let guard = 0;
    while (out.length < count && guard++ < count * 40) {
      const sk = skillIds[out.length % skillIds.length];
      const e = gen(sk, r, level);
      const sig = e.prompt + (e.options ? e.options.join('|') : '');
      if (seen.has(sig)) continue; seen.add(sig); out.push(e);
    }
    return out;
  }

  /* ---- grading ---- */
  function grade(ex, input) {
    if (ex.kind === 'choice') return { ok: input === ex.answerIdx };
    if (ex.kind === 'spot') return { ok: input === ex.wrong };
    if (ex.kind === 'order') return { ok: JSON.stringify(input) === JSON.stringify(ex.steps.map((_, i) => i)) };
    const g = NB.math.equivalent(input, ex.answer);
    if (g.ok) return { ok: true };
    let trap = ex.trap || null;
    if (!g.parseError && ex.traps) for (const t of ex.traps) { try { if (NB.math.equivalent(input, t.ans).ok) { trap = t.label; break; } } catch (e) { /* ignore */ } }
    return { ok: false, parseError: !!g.parseError, trap };
  }

  /* ---- timed HP set ---- */
  const PROV = {
    xyz: { title: 'XYZ', minutes: 12, items: 12, skills: ['h.pct', 'h.eq'], note: 'Matematisk problemlösning' },
    kva: { title: 'KVA', minutes: 10, items: 10, skills: ['h.kva1', 'h.kva2'], note: 'Kvantitativa jämförelser' },
  };

  NB.content = { Tuning, SKILLS, COURSES, G, AUTH, build, gen, grade, rng, shuffle, PROV, cxSrc, cxHtml, M };
  NB.Tuning = Tuning;
})(typeof NB !== 'undefined' ? NB : (globalThis.NB = globalThis.NB || {}));
