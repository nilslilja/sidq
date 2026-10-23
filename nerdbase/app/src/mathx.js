/* Nerdbase math engine: parser, complex evaluator, equivalence grader, symbolic derivative with steps.
   Pure logic, no DOM. Loaded in the browser and in Node tests (vm). */
(function (NB) {
  const C = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
    mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
    div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
    abs: (a) => Math.hypot(a[0], a[1]),
    arg: (a) => Math.atan2(a[1], a[0]),
    exp: (a) => { const m = Math.exp(a[0]); return [m * Math.cos(a[1]), m * Math.sin(a[1])]; },
    ln: (a) => [Math.log(C.abs(a)), C.arg(a)],
    sqrt: (a) => { const r = Math.sqrt(C.abs(a)), t = C.arg(a) / 2; return [r * Math.cos(t), r * Math.sin(t)]; },
    pow: (a, b) => {
      if (b[1] === 0 && Number.isInteger(b[0]) && Math.abs(b[0]) <= 64) {
        let n = Math.abs(b[0]), r = [1, 0], base = a;
        while (n > 0) { if (n & 1) r = C.mul(r, base); base = C.mul(base, base); n >>= 1; }
        return b[0] < 0 ? C.div([1, 0], r) : r;
      }
      if (a[0] === 0 && a[1] === 0) return [0, 0];
      return C.exp(C.mul(b, C.ln(a)));
    },
  };

  const FUNCS = ['sqrt', 'ln', 'sin', 'cos', 'tan', 'abs'];

  function tokenize(src) {
    let s = String(src).replace(/−/g, '-').replace(/[·×]/g, '*').replace(/÷/g, '/')
      .replace(/²/g, '^2').replace(/³/g, '^3').replace(/√/g, 'sqrt').replace(/π/g, 'pi')
      .replace(/\s+/g, '').replace(/,/g, '.');
    const out = []; let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/[0-9.]/.test(ch)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; const t = s.slice(i, j); if ((t.match(/\./g) || []).length > 1 || t === '.') throw new Error('num'); out.push({ k: 'num', v: parseFloat(t) }); i = j; continue; }
      if (/[a-zA-Z]/.test(ch)) {
        let j = i; while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
        let word = s.slice(i, j).toLowerCase(); let p = 0;
        while (p < word.length) {
          const f = FUNCS.find((n) => word.startsWith(n, p));
          if (f) { out.push({ k: 'fn', v: f }); p += f.length; continue; }
          if (word.startsWith('pi', p)) { out.push({ k: 'const', v: 'pi' }); p += 2; continue; }
          const c = word[p];
          if (c === 'e' || c === 'i') out.push({ k: 'const', v: c });
          else if (c === 'x') out.push({ k: 'var', v: 'x' });
          else throw new Error('ident');
          p++;
        }
        i = j; continue;
      }
      if ('+-*/^()'.includes(ch)) { out.push({ k: 'op', v: ch }); i++; continue; }
      throw new Error('char');
    }
    return out;
  }

  function parse(src) {
    const t = tokenize(src); let p = 0;
    if (!t.length) throw new Error('empty');
    const peek = () => t[p], eat = () => t[p++];
    const startsAtom = (k) => k && (k.k === 'num' || k.k === 'const' || k.k === 'var' || k.k === 'fn' || (k.k === 'op' && k.v === '('));
    function expr() {
      let l = term();
      while (peek() && peek().k === 'op' && (peek().v === '+' || peek().v === '-')) { const op = eat().v; l = { t: 'bin', op, a: l, b: term() }; }
      return l;
    }
    function term() {
      let l = unary();
      for (;;) {
        const k = peek();
        if (k && k.k === 'op' && (k.v === '*' || k.v === '/')) { eat(); l = { t: 'bin', op: k.v, a: l, b: unary() }; }
        else if (startsAtom(k)) { l = { t: 'bin', op: '*', a: l, b: power() }; }
        else break;
      }
      return l;
    }
    function unary() {
      const k = peek();
      if (k && k.k === 'op' && k.v === '-') { eat(); return { t: 'neg', a: unary() }; }
      if (k && k.k === 'op' && k.v === '+') { eat(); return unary(); }
      return power();
    }
    function power() {
      const base = atom();
      const k = peek();
      if (k && k.k === 'op' && k.v === '^') { eat(); return { t: 'bin', op: '^', a: base, b: unary() }; }
      return base;
    }
    function atom() {
      const k = eat();
      if (!k) throw new Error('eof');
      if (k.k === 'num') return { t: 'num', v: k.v };
      if (k.k === 'const') return { t: 'const', n: k.v };
      if (k.k === 'var') return { t: 'var', n: 'x' };
      if (k.k === 'fn') { const a = peek() && peek().k === 'op' && peek().v === '(' ? atom() : power(); return { t: 'call', f: k.v, a }; }
      if (k.k === 'op' && k.v === '(') { const e = expr(); const c = eat(); if (!c || c.v !== ')') throw new Error('paren'); return e; }
      throw new Error('unexpected');
    }
    const r = expr();
    if (p < t.length) throw new Error('trailing');
    return r;
  }

  function evalC(n, env) {
    switch (n.t) {
      case 'num': return [n.v, 0];
      case 'const': return n.n === 'e' ? [Math.E, 0] : n.n === 'pi' ? [Math.PI, 0] : [0, 1];
      case 'var': return [env.x, 0];
      case 'neg': { const a = evalC(n.a, env); return [0 - a[0], 0 - a[1]]; }
      case 'bin': {
        const a = evalC(n.a, env), b = evalC(n.b, env);
        if (n.op === '+') return C.add(a, b); if (n.op === '-') return C.sub(a, b);
        if (n.op === '*') return C.mul(a, b);
        if (n.op === '/') { if (b[0] === 0 && b[1] === 0) throw new Error('div0'); return C.div(a, b); }
        return C.pow(a, b);
      }
      case 'call': {
        const a = evalC(n.a, env);
        if (n.f === 'sqrt') return C.sqrt(a);
        if (n.f === 'ln') { if (a[0] === 0 && a[1] === 0) throw new Error('ln0'); return C.ln(a); }
        if (n.f === 'abs') return [C.abs(a), 0];
        if (Math.abs(a[1]) > 1e-12) throw new Error('complexfn');
        if (n.f === 'sin') return [Math.sin(a[0]), 0];
        if (n.f === 'cos') return [Math.cos(a[0]), 0];
        return [Math.tan(a[0]), 0];
      }
    }
    throw new Error('node');
  }

  const hasVar = (n) => n.t === 'var' ? true : n.t === 'bin' ? hasVar(n.a) || hasVar(n.b) : n.t === 'neg' || n.t === 'call' ? hasVar(n.a) : false;
  const close = (a, b, tol) => { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); return d <= tol * Math.max(1, Math.hypot(a[0], a[1]), Math.hypot(b[0], b[1])); };

  /* Equivalence of a typed answer and an expected answer. Never throws; parse errors reported. */
  function equivalent(input, expected) {
    let a, b;
    try { a = parse(input); } catch (e) { return { ok: false, parseError: true }; }
    b = parse(expected);
    const vars = hasVar(a) || hasVar(b);
    const pts = vars ? [-2.7, -1.3, -0.6, 0.45, 0.9, 1.7, 2.3, 2.9] : [0];
    let valid = 0;
    for (const x of pts) {
      let va, vb;
      try { va = evalC(a, { x }); vb = evalC(b, { x }); } catch (e) { continue; }
      if (![...va, ...vb].every(Number.isFinite)) continue;
      valid++;
      if (!close(va, vb, vars ? 1e-7 : 1e-9)) return { ok: false };
    }
    return { ok: valid >= (vars ? 4 : 1) };
  }

  /* ---------- Symbolic derivative with Swedish step explanations ---------- */
  const N = (v) => ({ t: 'num', v });
  const X = { t: 'var', n: 'x' };
  const E = { t: 'const', n: 'e' };
  const mul = (a, b) => ({ t: 'bin', op: '*', a, b });
  const add = (a, b) => ({ t: 'bin', op: '+', a, b });
  const sub = (a, b) => ({ t: 'bin', op: '-', a, b });
  const dv = (a, b) => ({ t: 'bin', op: '/', a, b });
  const pw = (a, b) => ({ t: 'bin', op: '^', a, b });
  const neg = (a) => ({ t: 'neg', a });
  const call = (f, a) => ({ t: 'call', f, a });

  // simplify
  function flattenMul(n, out) { if (n.t === 'bin' && n.op === '*') { flattenMul(n.a, out); flattenMul(n.b, out); } else out.push(n); return out; }
  function flattenAdd(n, sign, out) {
    if (n.t === 'bin' && n.op === '+') { flattenAdd(n.a, sign, out); flattenAdd(n.b, sign, out); }
    else if (n.t === 'bin' && n.op === '-') { flattenAdd(n.a, sign, out); flattenAdd(n.b, -sign, out); }
    else out.push({ n, s: sign });
    return out;
  }
  function key(n) { return JSON.stringify(n); }
  function simp(n) {
    switch (n.t) {
      case 'num': case 'const': case 'var': return n;
      case 'neg': { const a = simp(n.a); if (a.t === 'num') return N(-a.v); if (a.t === 'neg') return a.a; return neg(a); }
      case 'call': return call(n.f, simp(n.a));
      case 'bin': {
        if (n.op === '+' || n.op === '-') {
          const terms = flattenAdd(n, 1, []).map((x) => ({ n: simp(x.n), s: x.s }));
          const groups = new Map(); let konst = 0;
          for (const { n: tn, s } of terms) {
            let c = 1, rest = tn;
            if (tn.t === 'num') { konst += s * tn.v; continue; }
            if (tn.t === 'neg') { c = -1; rest = tn.a; }
            if (rest.t === 'bin' && rest.op === '*' && rest.a.t === 'num') { c *= rest.a.v; rest = rest.b; }
            const k = key(rest); const g = groups.get(k) || { n: rest, c: 0 }; g.c += s * c; groups.set(k, g);
          }
          const parts = [];
          for (const { n: rn, c } of groups.values()) { if (c === 0) continue; parts.push(c === 1 ? rn : c === -1 ? neg(rn) : mul(N(c), rn)); }
          if (konst !== 0) parts.push(N(konst));
          if (!parts.length) return N(0);
          return parts.map((p) => p).reduce((acc, p) => (p.t === 'neg' ? sub(acc, p.a) : p.t === 'bin' && p.op === '*' && p.a.t === 'num' && p.a.v < 0 ? sub(acc, mul(N(-p.a.v), p.b)) : p.t === 'num' && p.v < 0 ? sub(acc, N(-p.v)) : add(acc, p)));
        }
        if (n.op === '*') {
          const fs = flattenMul(n, []).map(simp);
          let coef = 1; const rest = [];
          for (let f of fs) {
            let flat = flattenMul(f, []);
            for (let g of flat) { if (g.t === 'num') coef *= g.v; else if (g.t === 'neg') { coef *= -1; rest.push(g.a); } else rest.push(g); }
          }
          if (coef === 0) return N(0);
          // combine powers of the same base
          const bases = new Map(); const order = [];
          for (const f of rest) {
            let b = f, e = 1;
            if (f.t === 'bin' && f.op === '^' && f.b.t === 'num') { b = f.a; e = f.b.v; }
            const k = key(b);
            if (!bases.has(k)) { bases.set(k, { b, e: 0 }); order.push(k); }
            bases.get(k).e += e;
          }
          const items = order.map((k) => { const { b, e } = bases.get(k); return e === 1 ? b : e === 0 ? null : pw(b, N(e)); }).filter(Boolean);
          const rank = (x) => (x.t === 'var' || (x.t === 'bin' && x.op === '^' && x.a.t === 'var') ? 0 : x.t === 'bin' && x.op === '^' && x.a.t === 'const' ? 2 : 1);
          items.sort((p, q) => rank(p) - rank(q));
          if (!items.length) return N(coef);
          let out = items.reduce((acc, p) => mul(acc, p));
          if (coef === -1) return neg(out);
          if (coef !== 1) out = mul(N(coef), out);
          return out;
        }
        if (n.op === '/') {
          const a = simp(n.a), b = simp(n.b);
          if (b.t === 'num' && b.v === 1) return a;
          if (a.t === 'num' && a.v === 0) return N(0);
          if (a.t === 'num' && b.t === 'num' && b.v !== 0 && Number.isInteger(a.v / b.v)) return N(a.v / b.v);
          return dv(a, b);
        }
        const a = simp(n.a), b = simp(n.b);
        if (b.t === 'num' && b.v === 0) return N(1);
        if (b.t === 'num' && b.v === 1) return a;
        if (a.t === 'num' && b.t === 'num') { const v = Math.pow(a.v, b.v); if (Number.isFinite(v) && Number.isInteger(v)) return N(v); }
        return pw(a, b);
      }
    }
  }

  // printing
  const prec = (n) => (n.t === 'bin' ? ({ '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 })[n.op] : n.t === 'neg' ? 3 : 5);
  function html(n, parent = 0) {
    let s;
    switch (n.t) {
      case 'num': s = String(+n.v.toFixed(10)).replace('.', ','); break;
      case 'const': s = n.n === 'pi' ? 'π' : `<i>${n.n}</i>`; break;
      case 'var': s = '<i>x</i>'; break;
      case 'neg': s = '−' + html(n.a, 3); break;
      case 'call': s = (n.f === 'sqrt' ? '√' : n.f) + '(' + html(n.a, 0) + ')'; break;
      case 'bin': {
        if (n.op === '^') {
          const base = n.a.t === 'num' || n.a.t === 'var' || n.a.t === 'const' || n.a.t === 'call' ? html(n.a, 5) : '(' + html(n.a, 0) + ')';
          s = base + '<sup>' + html(n.b, 0) + '</sup>'; break;
        }
        if (n.op === '+') s = html(n.a, 1) + ' + ' + html(n.b, 2);
        else if (n.op === '-') s = html(n.a, 1) + ' − ' + html(n.b, 2);
        else if (n.op === '/') s = html(n.a, 2) + ' / ' + html(n.b, 3);
        else {
          const l = html(n.a, 2), r = html(n.b, 2);
          const lhsNum = n.a.t === 'num';
          const rhsSimple = n.b.t === 'var' || (n.b.t === 'bin' && n.b.op === '^' && n.b.a.t === 'var') || n.b.t === 'call' || n.b.t === 'const' || (n.b.t === 'bin' && n.b.op === '*' && (n.b.a.t === 'var' || (n.b.a.t === 'bin' && n.b.a.op === '^' && n.b.a.a.t === 'var')));
          s = lhsNum && rhsSimple ? l + r : l + '·' + r;
        }
        break;
      }
    }
    return prec(n) < parent ? '(' + s + ')' : s;
  }

  function derive(src) {
    const ast = parse(src);
    const steps = [];
    const H = (n) => html(simp(n));
    const hasX = hasVar;
    function D(n) {
      switch (n.t) {
        case 'num': case 'const': return N(0);
        case 'var': return N(1);
        case 'neg': return neg(D(n.a));
        case 'bin': {
          const { op, a, b } = n;
          if (op === '+' || op === '-') {
            if (hasX(a) && hasX(b)) steps.push({ title: 'Summaregeln', text: 'Derivera term för term.' });
            const da = D(a), db = D(b);
            return { t: 'bin', op, a: da, b: db };
          }
          if (op === '*') {
            if (!hasX(a)) return mul(a, D(b));
            if (!hasX(b)) return mul(D(a), b);
            steps.push({ title: 'Produktregeln', text: `(u·v)′ = u′v + uv′ med u = ${H(a)} och v = ${H(b)}.` });
            const da = D(a), db = D(b);
            return add(mul(da, b), mul(a, db));
          }
          if (op === '/') {
            if (!hasX(b)) return dv(D(a), b);
            steps.push({ title: 'Kvotregeln', text: `(u/v)′ = (u′v − uv′)/v² med u = ${H(a)} och v = ${H(b)}.` });
            const da = D(a), db = D(b);
            return dv(sub(mul(da, b), mul(a, db)), pw(b, N(2)));
          }
          // power
          if (!hasX(b)) {
            const inner = a.t === 'var';
            const da = D(a);
            steps.push(inner
              ? { title: 'Potensregeln', text: `(x<sup>n</sup>)′ = n·x<sup>n−1</sup>, här n = ${H(b)}.` }
              : { title: 'Kedjeregeln', text: `(g<sup>n</sup>)′ = n·g<sup>n−1</sup>·g′ med g = ${H(a)}, g′ = ${H(da)}.` });
            return mul(mul(b, pw(a, sub(b, N(1)))), da);
          }
          if (!hasX(a)) {
            const db = D(b);
            if (a.t === 'const' && a.n === 'e') {
              steps.push(b.t === 'var' ? { title: 'Exponentialfunktionen', text: '(e<sup>x</sup>)′ = e<sup>x</sup>.' } : { title: 'Kedjeregeln', text: `(e<sup>g</sup>)′ = e<sup>g</sup>·g′ med g = ${H(b)}, g′ = ${H(db)}.` });
              return mul(n, db);
            }
            steps.push({ title: 'Exponentialfunktion', text: `(a<sup>g</sup>)′ = a<sup>g</sup>·ln(a)·g′ med a = ${H(a)}.` });
            return mul(mul(n, call('ln', a)), db);
          }
          const da = D(a), db = D(b);
          steps.push({ title: 'Allmän potens', text: 'Använd (u<sup>v</sup>)′ = u<sup>v</sup>(v′·ln u + v·u′/u).' });
          return mul(n, add(mul(db, call('ln', a)), dv(mul(b, da), a)));
        }
        case 'call': {
          const g = n.a, dg = D(g);
          const isX = g.t === 'var';
          const base = { sin: ['cos', (u) => call('cos', u), 'sin'], cos: ['−sin', (u) => neg(call('sin', u)), 'cos'] };
          if (n.f === 'sin' || n.f === 'cos') {
            steps.push({ title: isX ? 'Trigonometrisk derivata' : 'Kedjeregeln', text: `(${n.f} g)′ = ${n.f === 'sin' ? 'cos g' : '−sin g'}·g′ med g = ${H(g)}${isX ? '' : ', g′ = ' + H(dg)}.` });
            return mul(base[n.f][1](g), dg);
          }
          if (n.f === 'ln') { steps.push({ title: 'Logaritmregeln', text: `(ln g)′ = g′/g med g = ${H(g)}.` }); return dv(dg, g); }
          if (n.f === 'sqrt') { steps.push({ title: 'Rotregeln', text: `(√g)′ = g′/(2√g) med g = ${H(g)}.` }); return dv(dg, mul(N(2), call('sqrt', g))); }
          if (n.f === 'tan') { steps.push({ title: 'Kedjeregeln', text: `(tan g)′ = g′/cos² g med g = ${H(g)}.` }); return dv(dg, pw(call('cos', g), N(2))); }
          throw new Error('unsupported');
        }
      }
    }
    const raw = D(ast);
    const answer = simp(raw);
    // numeric verification against central difference of the original
    const f = (x) => evalC(ast, { x })[0];
    let checked = 0, bad = 0;
    for (const x of [-1.7, -0.8, 0.4, 0.9, 1.3, 2.1]) {
      try {
        const h = 1e-5, num = (f(x + h) - f(x - h)) / (2 * h), sym = evalC(answer, { x })[0];
        if (!Number.isFinite(num) || !Number.isFinite(sym)) continue;
        checked++;
        if (Math.abs(num - sym) > 1e-4 * Math.max(1, Math.abs(num))) bad++;
      } catch (e) { /* skip points outside the domain */ }
    }
    const verified = checked >= 3 && bad === 0;
    steps.push({ title: 'Förenkla', text: `f′(<i>x</i>) = ${html(answer)}` });
    return { problem: html(simp(ast)), answer: html(answer), answerSrc: html(answer), steps, verified, ast, answerAst: answer };
  }

  NB.math = { parse, evalC, equivalent, derive, html, simp };
})(typeof NB !== 'undefined' ? NB : (globalThis.NB = globalThis.NB || {}));
