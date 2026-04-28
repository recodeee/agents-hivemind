const assert = require('node:assert/strict');
const { lstatSync, readFileSync, readlinkSync } = require('node:fs');
const { resolve } = require('node:path');
const { describe, it } = require('node:test');

const repoRoot = resolve(__dirname, '..');
const agentsPath = resolve(repoRoot, 'AGENTS.md');
const claudePath = resolve(repoRoot, 'CLAUDE.md');

const AGENTS_TEXT = readFileSync(agentsPath, 'utf8');
const AGENTS_NORMALIZED = AGENTS_TEXT.replace(/\s+/g, ' ').toLowerCase();

const CLAUDE_POINTER = [
  '# CLAUDE.md',
  '',
  'AGENTS.md is the source of truth for this repository.',
  'Read and follow ./AGENTS.md before doing any work here.',
  '',
].join('\n');

describe('agent instruction contract', () => {
  it('keeps AGENTS.md Colony-first instead of OMX-first', () => {
    for (const required of [
      'mcp__colony__hivemind_context',
      'mcp__colony__attention_inbox',
      'mcp__colony__task_ready_for_agent',
    ]) {
      assert.ok(AGENTS_TEXT.includes(required), `AGENTS.md must mention ${required}`);
    }

    assert.match(
      AGENTS_TEXT,
      /Use `task_list` only for browsing\/debugging/i,
      'AGENTS.md must keep task_list as browsing/debugging inventory, not a scheduler',
    );
    assert.match(
      AGENTS_TEXT,
      /call `task_claim_file` for each touched file/i,
      'AGENTS.md must require task_claim_file for each touched file',
    );
    assert.match(
      AGENTS_NORMALIZED,
      /use colony for coordination before falling back to omx state\/notepad/,
      'AGENTS.md must put Colony before OMX',
    );
    assert.match(
      AGENTS_NORMALIZED,
      /omx is fallback, not the first coordination source/,
      'AGENTS.md must keep OMX as fallback coordination state',
    );
    assert.match(
      AGENTS_NORMALIZED,
      /do not embed stale memory dumps/,
      'AGENTS.md must forbid stale memory dumps',
    );
  });

  it('keeps CLAUDE.md pointed at AGENTS.md', () => {
    const stat = lstatSync(claudePath);
    if (stat.isSymbolicLink()) {
      assert.equal(readlinkSync(claudePath), 'AGENTS.md');
      return;
    }

    const claudeText = readFileSync(claudePath, 'utf8');
    assert.ok(
      claudeText.startsWith(CLAUDE_POINTER),
      'CLAUDE.md must be a symlink to AGENTS.md or start with the exact AGENTS.md pointer',
    );
  });
});
