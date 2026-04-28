const assert = require('node:assert/strict');
const { lstatSync, readFileSync, readlinkSync } = require('node:fs');
const { resolve } = require('node:path');
const { describe, it } = require('node:test');

const repoRoot = resolve(__dirname, '..');
const agentsPath = resolve(repoRoot, 'AGENTS.md');
const claudePath = resolve(repoRoot, 'CLAUDE.md');
const docsMcpPath = resolve(repoRoot, 'docs/mcp.md');

const AGENTS_TEXT = readFileSync(agentsPath, 'utf8');
const AGENTS_NORMALIZED = AGENTS_TEXT.replace(/\s+/g, ' ').toLowerCase();
const DOCS_MCP_TEXT = readFileSync(docsMcpPath, 'utf8');
const DOCS_MCP_NORMALIZED = DOCS_MCP_TEXT.replace(/\s+/g, ' ').toLowerCase();

function assertContainsInOrder(text, requiredTerms, label) {
  let previousIndex = -1;
  for (const term of requiredTerms) {
    const index = text.indexOf(term);
    assert.notEqual(index, -1, `${label} must mention ${term}`);
    assert.ok(index > previousIndex, `${label} must keep ${term} after the previous startup step`);
    previousIndex = index;
  }
}

const CLAUDE_POINTER = [
  '# CLAUDE.md',
  '',
  'AGENTS.md is the source of truth for this repository.',
  'Read and follow ./AGENTS.md before doing any work here.',
  '',
].join('\n');

describe('agent instruction contract', () => {
  it('keeps AGENTS.md Colony-first instead of OMX-first', () => {
    assertContainsInOrder(
      AGENTS_TEXT,
      [
        'mcp__colony__hivemind_context',
        'mcp__colony__attention_inbox',
        'mcp__colony__task_ready_for_agent',
      ],
      'AGENTS.md',
    );

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
      AGENTS_TEXT,
      /Use `task_note_working` first for current working state/i,
      'AGENTS.md must make task_note_working the first working-state write path',
    );
    assert.match(
      AGENTS_TEXT,
      /bridge\.writeOmxNotepadPointer=true/,
      'AGENTS.md must document the optional tiny OMX pointer bridge',
    );
    assert.match(
      AGENTS_TEXT,
      /colony_observation_id=<id>/,
      'AGENTS.md must include the Colony observation id in the pointer shape',
    );
    assert.match(
      AGENTS_NORMALIZED,
      /do not embed stale memory dumps/,
      'AGENTS.md must forbid stale memory dumps',
    );
  });

  it('keeps docs/mcp.md aligned with the Colony startup loop', () => {
    assertContainsInOrder(
      DOCS_MCP_TEXT,
      [
        'mcp__colony__hivemind_context',
        'mcp__colony__attention_inbox',
        'mcp__colony__task_ready_for_agent',
      ],
      'docs/mcp.md',
    );
    assertContainsInOrder(
      DOCS_MCP_TEXT,
      ['`hivemind_context`', '`attention_inbox`', '`task_ready_for_agent`'],
      'docs/mcp.md',
    );

    for (const required of [
      /Use `task_list` for browsing\/debugging recent task threads/i,
      /Use `task_ready_for_agent` for choosing what to work on next/i,
      /Claim files with `task_claim_file` .* before editing/i,
    ]) {
      assert.match(DOCS_MCP_TEXT, required);
    }

    for (const required of [
      /use colony first for coordination/,
      /use omx state or notepad only when colony is unavailable or missing the required surface/,
      /call `task_note_working` before any omx notepad write/,
      /a successful colony working note must not duplicate the full content/,
      /allow_omx_notepad_fallback=true/,
    ]) {
      assert.match(DOCS_MCP_NORMALIZED, required);
    }
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
