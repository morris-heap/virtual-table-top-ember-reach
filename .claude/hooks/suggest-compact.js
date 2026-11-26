#!/usr/bin/env node
/**
 * Strategic compact suggester.
 *
 * Counts Edit/Write calls in a session and prints a note to stderr at a
 * threshold, so you can choose a `/compact` at a phase boundary instead of
 * letting auto-compact fire mid-task.
 *
 * Adapted from the MIT-licensed `everything-claude-code` collection
 * (github.com/affaan-m/everything-claude-code), rewritten to drop its
 * scripts/lib dependency and to key the counter on the real session id.
 *
 * Never blocks: it always exits 0 and passes stdin through untouched.
 *
 * Config: COMPACT_THRESHOLD (default 60), COMPACT_INTERVAL (default 25).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function main() {
  let stdin = '';
  try {
    stdin = fs.readFileSync(0, 'utf8');
  } catch {
    stdin = '';
  }

  // Prefer the session id the harness supplies; fall back to the transcript
  // path, then the payload. process.ppid is deliberately not used: on Windows
  // it can repeat across sessions, which leaks the counter between them.
  let sessionId = process.env.CLAUDE_SESSION_ID || '';
  if (!sessionId && stdin) {
    try {
      const payload = JSON.parse(stdin);
      sessionId = payload.session_id || payload.transcript_path || '';
    } catch {
      /* not JSON; fall through */
    }
  }
  sessionId = String(sessionId).replace(/[^A-Za-z0-9_-]/g, '').slice(-40) || 'default';

  const threshold = parseInt(process.env.COMPACT_THRESHOLD || '60', 10);
  const interval = parseInt(process.env.COMPACT_INTERVAL || '25', 10);

  const dir = path.join(os.tmpdir(), 'claude-strategic-compact');
  const counterFile = path.join(dir, `count-${sessionId}`);

  let count = 1;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const existing = fs.readFileSync(counterFile, 'utf8');
    const parsed = parseInt(existing.trim(), 10);
    if (Number.isFinite(parsed)) count = parsed + 1;
  } catch {
    /* first call this session */
  }

  try {
    fs.writeFileSync(counterFile, String(count));
  } catch {
    /* a counter we cannot persist is not worth failing a tool call over */
  }

  if (count === threshold) {
    console.error(
      `[StrategicCompact] ${threshold} edits this session - consider /compact if you are between phases.`
    );
  } else if (count > threshold && (count - threshold) % interval === 0) {
    console.error(
      `[StrategicCompact] ${count} edits - a good checkpoint for /compact if the context is stale.`
    );
  }

  if (stdin) process.stdout.write(stdin);
  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error('[StrategicCompact] skipped:', err && err.message);
  process.exit(0);
}
