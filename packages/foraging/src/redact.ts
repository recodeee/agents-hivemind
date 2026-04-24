/**
 * Best-effort secret scrubbing for foraged content.
 *
 * Examples directories often carry `.env.example`, API-key snippets in
 * README blocks, or copy-pasted Dockerfile secrets that a well-meaning
 * author forgot to trim. We do a conservative pass before the text
 * reaches SQLite — enough to strip the obvious cases without trying to
 * be a fully general DLP engine.
 *
 * The three tiers:
 *   1. Common cloud / service env-var names whose values are tokens.
 *   2. Long opaque base64/hex strings that sit on their own assignment.
 *   3. Armored PEM blocks.
 */

const DEFAULT_ENV_NAME_PATTERNS: readonly RegExp[] = [
  /AWS_[A-Z0-9_]*(?:KEY|SECRET|TOKEN)[A-Z0-9_]*/,
  /GITHUB_TOKEN/,
  /GH_TOKEN/,
  /OPENAI_API_KEY/,
  /ANTHROPIC_API_KEY/,
  /HUGGINGFACE_[A-Z0-9_]*TOKEN/,
  /SLACK_[A-Z0-9_]*TOKEN/,
  /STRIPE_[A-Z0-9_]*KEY/,
  /TWILIO_[A-Z0-9_]*TOKEN/,
  /[A-Z0-9_]*(?:SECRET|PASSWORD|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*/,
];

const PEM_BLOCK = /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g;

/**
 * Scrubs the text in place. Emits `***REDACTED***` wherever a secret was
 * removed so downstream readers can see *that* a redaction happened
 * without seeing the value.
 */
export function redact(text: string, extraEnvNames: readonly string[] = []): string {
  let out = text;

  // Tier 3 first — PEM blocks span many lines, easier to match before
  // we start mangling assignment lines.
  out = out.replace(PEM_BLOCK, '***REDACTED_PRIVATE_KEY***');

  // Tier 1 — env-var-like assignments. Match `FOO_SECRET=value` and
  // `FOO_SECRET: "value"` in both .env and YAML forms, then zero the
  // value while keeping the key for context.
  const extraPatterns = extraEnvNames.map((n) => new RegExp(`^${escapeRegex(n)}$`, 'i'));
  const envMatchers = [...DEFAULT_ENV_NAME_PATTERNS, ...extraPatterns];
  out = out
    .split('\n')
    .map((line) => redactEnvLine(line, envMatchers))
    .join('\n');

  return out;
}

function redactEnvLine(line: string, matchers: readonly RegExp[]): string {
  const match = line.match(/^(\s*)([A-Z][A-Z0-9_]*)(\s*[:=]\s*)(.*)$/);
  if (!match) return line;
  const indent = match[1] ?? '';
  const name = match[2];
  const sep = match[3];
  if (!name || !sep) return line;
  if (!matchers.some((re) => re.test(name))) return line;
  // Keep the key + separator for debugging context; drop the value.
  return `${indent}${name}${sep}***REDACTED***`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
