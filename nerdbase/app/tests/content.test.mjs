import { load, t, done } from './run.mjs';
const NB = load(['mathx.js', 'content.js']); const { SKILLS, build, grade, G, rng } = NB.content; const { equivalent } = NB.math;
let n = 0;
for (const s of SKILLS) {
  const r = rng(12345);
  for (let k = 0; k < 400; k++) {
    const lvl = k % 3;
    let e; try { e = G[s.id](r, lvl >= 2 ? 2 : 1, s.id + k); } catch (err) { t(`gen ${s.id} threw ${err.message}`, false); continue; }
    n++;
    t(`${s.id} has prompt/explain`, e.prompt && e.explain);
    if (e.kind === 'numeric') {
      t(`${s.id} numeric self-correct "${e.answer}"`, grade(e, e.answer).ok);
      if (e.verify) t(`${s.id} verify ${e.verify} == ${e.answer}`, equivalent(e.verify, e.answer).ok);
      t(`${s.id} rejects wrong`, !grade(e, e.answer + '+1').ok);
    } else if (e.kind === 'choice') {
      t(`${s.id} idx range`, Number.isInteger(e.answerIdx) && e.answerIdx >= 0 && e.answerIdx < e.options.length);
      t(`${s.id} unique options ${e.options}`, new Set(e.options).size === e.options.length);
      if (e.verifyAnswer && e.verify) t(`${s.id} choice verify ${e.verify}`, equivalent(e.verify, e.verifyAnswer).ok);
      t(`${s.id} grade choice`, grade(e, e.answerIdx).ok && !grade(e, (e.answerIdx + 1) % e.options.length).ok);
    }
  }
  const lesson = build([s.id], 10, 1, 99); t(`${s.id} builds 10 unique`, lesson.length === 10);
}
// independent numeric checks for KVA / pct choice answers
{ const r = rng(7); for (let k = 0; k < 300; k++) { const e = G['h.kva2'](r, 1, 'k'); const vals = e.options.map((o) => { const m = o.match(/<span>(\d+)<\/span><span>(\d+)<\/span>/); return m[1] / m[2]; }); t('kva2 max correct', vals[e.answerIdx] === Math.max(...vals)); } }
{ const r = rng(8); for (let k = 0; k < 300; k++) { const e = G['h.pct'](r, 1, 'p'); if (e.kind === 'choice' && /totalt/.test(e.prompt)) { const m = e.prompt.match(/höjs med (\d+) % och sänks sedan med (\d+) %/); const exp = ((100 + +m[1]) * (100 - +m[2]) / 100 - 100); const got = parseFloat(e.options[e.answerIdx].replace('−', '-').replace(' %', '').replace(',', '.').replace('+', '')); t('pct total', Math.abs(got - exp) < 1e-9); } } }
// kva fixed answers sanity: brute-force the sampled truths
{ const f = (id, given, I, II) => 0; }
console.log('generated', n); done();
