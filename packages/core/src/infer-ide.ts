/**
 * Best-effort mapping from a session id to the IDE / agent that created it.
 *
 * Hooks write `ide = input.ide ?? infer(session_id) ?? 'unknown'`. Without a
 * broad matcher, ids like `codex-colony-usage-limit-takeover-verify-...` — the
 * hyphen-delimited task-named sessions codex emits — fell through and landed
 * in storage as `unknown`. The viewer then shows every such row as an
 * unowned session, making it impossible to tell who ran what.
 *
 * Keep this list conservative: prefix inference is a heuristic, so we only
 * return a known IDE id and never guess from arbitrary strings.
 */
export function inferIdeFromSessionId(sessionId: string): string | undefined {
  if (!sessionId) return undefined;
  const parts = sessionId.split(/[@\-:/_]/).map((p) => p.toLowerCase());
  const first = parts[0];
  if (!first) return undefined;
  // When an agent writes its session id using the Guardex branch form
  // (`agent/<name>/<task-slug>`), the literal leading segment is `agent`
  // and the IDE name lives in the second segment. Peel that off before
  // the normal prefix match so those rows get classified instead of
  // landing in storage as `unknown`.
  const candidate = first === 'agent' && parts[1] ? parts[1] : first;
  switch (candidate) {
    case 'claude':
    case 'claudecode':
      return 'claude-code';
    case 'codex':
      return 'codex';
    case 'gemini':
      return 'gemini';
    case 'cursor':
      return 'cursor';
    case 'windsurf':
      return 'windsurf';
    case 'aider':
      return 'aider';
    default:
      return undefined;
  }
}
