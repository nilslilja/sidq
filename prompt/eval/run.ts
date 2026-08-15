/**
 * The gate.
 *
 *   npm run eval                    all fixtures against the live model
 *   npm run eval -- --fixture real-week
 *   npm run eval -- --model claude-opus-5
 *   npm run eval:offline            render prompts only, no API call, no key needed
 *
 * Exits non-zero if any fixture produces an `error` violation. Wire it into CI and
 * the prompt cannot silently rot.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SYSTEM_PROMPT,
  FEWSHOT_INPUT,
  FEWSHOT_OUTPUT,
  PROMPT_VERSION,
  buildUserMessage,
} from '../../supabase/functions/_shared/prompt.ts';
import { parsePlan, gradePlan, totalMinutes } from '../../supabase/functions/_shared/plan.ts';
import { fixtures } from './fixtures.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'out');
const ROOT = join(HERE, '..', '..');

/**
 * Load .env.local so the gate runs straight after setup without the user having to
 * export anything. An already-exported variable always wins, so a deliberate
 * override on the command line is never silently replaced by the file.
 */
function loadEnvLocal(): void {
  const path = join(ROOT, '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key] && value) process.env[key] = value;
  }
}
loadEnvLocal();

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const only = valueOf('--fixture');
const model = valueOf('--model') ?? 'claude-sonnet-5';

function valueOf(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const accent = (s: string) => `\x1b[36m${s}\x1b[0m`;

async function generate(userMessage: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const res = await client.messages.create({
    model,
    max_tokens: 1500,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: FEWSHOT_INPUT },
      { role: 'assistant', content: FEWSHOT_OUTPUT },
      { role: 'user', content: userMessage },
      // Prefilling the opening brace removes an entire class of "Here's your plan:"
      // preamble failures before the parser ever has to deal with them.
      { role: 'assistant', content: '{' },
    ],
  });
  const text = res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  return `{${text}`;
}

async function main() {
  const selected = only ? fixtures.filter((f) => f.name === only) : fixtures;
  if (selected.length === 0) {
    console.error(red(`No fixture named "${only}". Available: ${fixtures.map((f) => f.name).join(', ')}`));
    process.exit(1);
  }

  console.log(bold(`\nSidq plan eval`), dim(`prompt ${PROMPT_VERSION}`), dim(offline ? '(offline)' : `(${model})`));
  console.log(dim('─'.repeat(72)));

  if (offline) {
    for (const f of selected) {
      console.log(`\n${bold(f.name)} ${dim('· ' + f.probe)}\n`);
      console.log(dim(buildUserMessage(f.input)));
    }
    console.log(dim('\n─'.repeat(72)));
    console.log(dim('Offline: prompts rendered, nothing generated. Set ANTHROPIC_API_KEY and drop --offline.\n'));
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(red('\nANTHROPIC_API_KEY is not set.'));
    console.error(dim('  export ANTHROPIC_API_KEY=sk-ant-...   or run: npm run eval:offline\n'));
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  let errorCount = 0;
  let warnCount = 0;

  for (const f of selected) {
    const userMessage = buildUserMessage(f.input);
    let raw: string;
    try {
      raw = await generate(userMessage);
    } catch (err) {
      console.log(`\n${bold(f.name)}  ${red('REQUEST FAILED')}`);
      console.log(dim(`  ${err instanceof Error ? err.message : String(err)}`));
      errorCount++;
      continue;
    }

    const { plan, recovered, repairs } = parsePlan(raw);
    const violations = gradePlan(plan);
    const errors = violations.filter((v) => v.severity === 'error');
    const warns = violations.filter((v) => v.severity === 'warn');
    errorCount += errors.length;
    warnCount += warns.length;

    const status = errors.length > 0 ? red('FAIL') : warns.length > 0 ? yellow('WARN') : green('PASS');
    console.log(`\n${status}  ${bold(f.name)}  ${dim(`${totalMinutes(plan)} min · ${plan.tasks.length} tasks`)}`);
    console.log(dim(`      ${f.probe}`));

    if (recovered) console.log(yellow(`      recovered: ${repairs.join(', ')}`));

    console.log();
    for (const [i, t] of plan.tasks.entries()) {
      const marker = i === 0 ? accent('◆') : dim('○');
      console.log(`      ${marker} ${t.title}  ${dim(`${t.est_minutes}m`)}`);
      if (t.why) console.log(dim(`        ${t.why}`));
    }
    if (plan.note) console.log(`\n      ${dim('note:')} ${plan.note}`);

    for (const v of errors) console.log(red(`      ✗ ${v.rule}: ${v.detail}`));
    for (const v of warns) console.log(yellow(`      ! ${v.rule}: ${v.detail}`));

    writeFileSync(
      join(OUT_DIR, `${f.name}.json`),
      JSON.stringify({ fixture: f.name, promptVersion: PROMPT_VERSION, model, raw, plan, violations }, null, 2),
    );
  }

  console.log(dim('\n' + '─'.repeat(72)));
  const summary = `${selected.length} fixtures · ${errorCount} errors · ${warnCount} warnings`;
  console.log(errorCount > 0 ? red(bold(summary)) : green(bold(summary)));
  console.log(dim(`Full output written to prompt/eval/out/\n`));

  if (errorCount > 0) {
    console.log(red('Gate is red. Fix the prompt before building on top of it.\n'));
    process.exit(1);
  }
  console.log(dim('Read the plans above. Automated checks are the floor, not the bar —\n') +
              dim('the real question is whether you would work this day.\n'));
}

main().catch((err) => {
  console.error(red(`\n${err instanceof Error ? err.stack : String(err)}\n`));
  process.exit(1);
});
