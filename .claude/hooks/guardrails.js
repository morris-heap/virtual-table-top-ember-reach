#!/usr/bin/env node
/**
 * Repo guardrails: the few CLAUDE.md invariants that are decidable from text
 * alone, and where missing one is expensive or confusing to debug.
 *
 * Deliberately narrow. Anything needing dataflow or intent (does this response
 * leak `ownerId`? do the rule numbers agree across five files?) stays in the
 * /sc and /cw skills, where a model can actually reason about it. A hook that
 * cries wolf gets switched off, and the real warnings go with it.
 *
 * Wired to PreToolUse (can block) and PostToolUse (warns only).
 * Exit 2 blocks the call and shows stderr to the model; exit 0 allows it.
 * Anything unrecognized, malformed or unexpected exits 0.
 */

const fs = require('fs');

function readPayload() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

const SECRET_PATH =
  /(^|[\\/])(\.env(\.[A-Za-z0-9_-]+)?|settings\.local\.json|credentials\.json)$/i;

/** PreToolUse on Bash: stop what is cheaper to prevent than to undo. */
function checkBash(cmd, cwd) {
  const errs = [];

  // The Vitest trap in CLAUDE.md: a lowercase drive letter makes every test
  // file that imports a local module fail with a misleading error.
  const isVitest = /\b(vitest|npm\s+(run\s+)?test|npm\s+t)\b/.test(cmd);
  if (isVitest && /^[a-z]:[\\/]/.test(cwd || '')) {
    const fixed = String(cwd).replace(/^[a-z]:/, (c) => c.toUpperCase());
    errs.push(
      'Vitest run from a lowercase drive letter. Every test file that imports a ' +
        'local module will fail with "Cannot read properties of undefined ' +
        "(reading 'config')\" — a misleading error with an unrelated cause.\n" +
        `  cwd: ${cwd}\n  Re-run from: ${fixed}`
    );
  }

  // CLAUDE.md: no AWS keys in .env, GitHub or code. Keep it that way.
  if (/\bgit\s+(add|commit)\b/.test(cmd)) {
    for (const token of cmd.match(/[^\s'"]+/g) || []) {
      if (SECRET_PATH.test(token)) {
        errs.push(`Refusing to stage or commit a secrets file: ${token}`);
      }
    }
  }

  // Deploying a stateful stack without reading a diff first.
  if (/\bcdk\s+deploy\b/.test(cmd) && /\bEmberreach(Data|Auth)\b/.test(cmd)) {
    errs.push(
      'Deploying a stateful stack. CLAUDE.md: always `cdk diff` first and stop if ' +
        'anything says "replace" on the table or the user pool.\n' +
        '  Run `npm run diff` in infra/ first.'
    );
  }

  return errs;
}

/**
 * PostToolUse on Edit/Write: warn where a textual change has outsized blast
 * radius. Warnings rather than blocks, because each of these edits is
 * occasionally the correct thing to do and the model needs the reasoning.
 */
function checkEdit(filePath, input) {
  const warns = [];
  if (!filePath) return warns;

  const rel = String(filePath).replace(/\\/g, '/');
  const before = typeof input.old_string === 'string' ? input.old_string : '';
  const after =
    typeof input.new_string === 'string'
      ? input.new_string
      : typeof input.content === 'string'
        ? input.content
        : '';

  // Renaming a CDK construct id replaces the resource behind it.
  const STATEFUL = [
    {
      file: 'infra/lib/data-stack.ts',
      id: 'Characters',
      what: 'replaces the DynamoDB table, destroying its contents'
    },
    {
      file: 'infra/lib/auth-stack.ts',
      id: 'Users',
      what: 'replaces the user pool, deleting every account'
    }
  ];
  for (const s of STATEFUL) {
    if (rel.endsWith(s.file) && before.includes(`'${s.id}'`) && !after.includes(`'${s.id}'`)) {
      warns.push(
        `Construct id '${s.id}' looks renamed or removed in ${s.file}.\n` +
          `  CLAUDE.md: this ${s.what}.\n` +
          '  Run `npm run diff` in infra/ and confirm before any deploy.'
      );
    }
  }

  // Renaming a gsi1 key replaces the one shared index (ADR 0008).
  if (rel.includes('infra/lib/') && /gsi1(pk|sk)/.test(before) && !/gsi1(pk|sk)/.test(after)) {
    warns.push(
      'A `gsi1pk`/`gsi1sk` key looks renamed. CLAUDE.md and ADR 0008: `gsi1` is the ' +
        "table's one general-purpose index, and renaming its keys replaces the index."
    );
  }

  // Single-item reads are strongly consistent on purpose.
  if (/\bapi\/src\//.test(rel) && /ConsistentRead/.test(before) && !/ConsistentRead/.test(after)) {
    warns.push(
      '`ConsistentRead` looks removed. CLAUDE.md: single-hero reads are strongly ' +
        'consistent so a read right after a save or delete is fresh. Keep it.'
    );
  }

  if (SECRET_PATH.test(rel)) {
    warns.push(
      `Writing ${rel}. Keep it out of git: confirm \`git check-ignore -v\` covers it.`
    );
  }

  return warns;
}

function main() {
  const payload = readPayload();
  if (!payload) process.exit(0);

  const tool = payload.tool_name || payload.tool || '';
  const input = payload.tool_input || {};
  const event = payload.hook_event_name || '';
  const isPre = event === 'PreToolUse' || event === '';

  let blocking = [];
  let warnings = [];

  if (tool === 'Bash') {
    if (isPre) blocking = checkBash(String(input.command || ''), payload.cwd || process.cwd());
  } else if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') {
    warnings = checkEdit(input.file_path, input);
  }

  if (blocking.length) {
    console.error('[guardrail] ' + blocking.join('\n[guardrail] '));
    process.exit(2);
  }
  if (warnings.length) {
    console.error('[guardrail] ' + warnings.join('\n[guardrail] '));
  }
  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error('[guardrail] skipped:', err && err.message);
  process.exit(0);
}
