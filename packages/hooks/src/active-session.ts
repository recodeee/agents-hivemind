import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { detectRepoBranch } from '@colony/core';
import type { HookInput, HookName } from './types.js';

type ActiveSessionState = 'working' | 'thinking' | 'idle';

const ACTIVE_SESSIONS_RELATIVE_DIR = join('.omx', 'state', 'active-sessions');
const PREVIEW_LIMIT = 180;

export function upsertActiveSession(input: HookInput, hook: HookName): void {
  const detected = detectFromInput(input);
  if (!detected) return;

  const filePath = activeSessionFilePath(detected.repo_root, input.session_id);
  const existing = readExisting(filePath);
  const now = new Date().toISOString();
  const preview = taskPreview(input, hook);
  const taskName =
    hook === 'user-prompt-submit' && preview
      ? preview
      : existing?.taskName || existing?.task_name || preview || 'Agent session';
  const record = {
    schemaVersion: 1,
    repoRoot: detected.repo_root,
    branch: detected.branch,
    taskName,
    latestTaskPreview: preview || existing?.latestTaskPreview || '',
    agentName: agentName(input),
    cliName: input.ide ?? agentName(input),
    worktreePath: detected.repo_root,
    taskMode: existing?.taskMode ?? '',
    openspecTier: existing?.openspecTier ?? '',
    taskRoutingReason: 'colony hook cwd binding',
    startedAt: existing?.startedAt ?? now,
    lastHeartbeatAt: now,
    state: stateForHook(hook),
    sessionKey: input.session_id,
  };

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

export function removeActiveSession(input: HookInput): void {
  const detected = detectFromInput(input);
  if (!detected) return;

  const filePath = activeSessionFilePath(detected.repo_root, input.session_id);
  if (existsSync(filePath)) unlinkSync(filePath);
}

function detectFromInput(input: Pick<HookInput, 'cwd'>) {
  if (!input.cwd) return null;
  return detectRepoBranch(input.cwd);
}

function activeSessionFilePath(repoRoot: string, sessionId: string): string {
  return join(repoRoot, ACTIVE_SESSIONS_RELATIVE_DIR, `${sanitize(sessionId)}.json`);
}

function readExisting(filePath: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function sanitize(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'unknown-session';
}

function stateForHook(hook: HookName): ActiveSessionState {
  if (hook === 'user-prompt-submit') return 'thinking';
  if (hook === 'stop') return 'idle';
  return 'working';
}

function agentName(input: Pick<HookInput, 'ide' | 'session_id'>): string {
  if (input.ide === 'claude-code') return 'claude';
  if (input.ide === 'codex') return 'codex';
  const prefix = input.session_id.split('@')[0]?.toLowerCase();
  if (prefix === 'claude' || prefix === 'claude-code') return 'claude';
  if (prefix === 'codex') return 'codex';
  return input.ide ?? 'agent';
}

function taskPreview(input: HookInput, hook: HookName): string {
  const raw =
    hook === 'user-prompt-submit'
      ? input.prompt
      : hook === 'post-tool-use'
        ? toolUsePreview(input)
        : hook === 'stop'
          ? (input.turn_summary ?? input.last_assistant_message)
          : hook === 'session-end'
            ? input.reason
            : input.source
              ? `Session start: ${input.source}`
              : 'Session start';
  return typeof raw === 'string' ? oneLine(raw).slice(0, PREVIEW_LIMIT) : '';
}

function toolUsePreview(input: HookInput): string {
  const tool = input.tool_name ?? input.tool ?? 'unknown';
  const detail = toolInputPreview(tool, input.tool_input);
  return detail ? `${tool}: ${detail}` : `Tool: ${tool}`;
}

function toolInputPreview(tool: string, toolInput: unknown): string {
  if (!isRecord(toolInput)) return '';
  const command = readString(toolInput.command);
  if (command && isShellTool(tool)) return scrubShellSecrets(command);
  const filePath = readString(toolInput.file_path) || readString(toolInput.notebook_path);
  if (filePath) return filePath;
  const pattern = readString(toolInput.pattern);
  if (pattern) return pattern;
  if (command) return scrubShellSecrets(command);
  return '';
}

function isShellTool(tool: string): boolean {
  return tool === 'Bash' || tool === 'Shell' || tool.toLowerCase() === 'bash';
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function scrubShellSecrets(value: string): string {
  return value
    .replace(
      /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|KEY|CREDENTIAL)[A-Z0-9_]*)=(?:"[^"]*"|'[^']*'|[^\s]+)/gi,
      '$1=<redacted>',
    )
    .replace(
      /(--(?:token|password|secret|api-key|key)=)(?:"[^"]*"|'[^']*'|[^\s]+)/gi,
      '$1<redacted>',
    );
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
