import {
  type AttentionInbox,
  type SearchResult,
  buildAttentionInbox,
  readHivemind,
} from '@colony/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { detectMcpClientIdentity } from './heartbeat.js';
import {
  type CompactNegativeWarning,
  buildContextQuery,
  buildHivemindContext,
  searchNegativeWarnings,
  toHivemindOptions,
} from './shared.js';

const DEFAULT_CONTEXT_LANE_LIMIT = 8;
const DEFAULT_CONTEXT_MEMORY_LIMIT = 3;
const DEFAULT_CONTEXT_CLAIM_LIMIT = 12;
const DEFAULT_CONTEXT_HOT_FILE_LIMIT = 8;
const DEFAULT_CONTEXT_ATTENTION_ID_LIMIT = 12;

export function register(server: McpServer, ctx: ToolContext): void {
  const { store, resolveEmbedder } = ctx;

  server.tool(
    'hivemind',
    'See what other agents are doing right now. Summarizes active sessions, branches, task ownership, stale lanes, and runtime state before coordination.',
    {
      repo_root: z.string().min(1).optional(),
      repo_roots: z.array(z.string().min(1)).max(20).optional(),
      include_stale: z.boolean().optional(),
      limit: z.number().int().positive().max(100).optional(),
    },
    async ({ repo_root, repo_roots, include_stale, limit }) => {
      const options: Parameters<typeof readHivemind>[0] = {};
      if (repo_root !== undefined) options.repoRoot = repo_root;
      if (repo_roots !== undefined) options.repoRoots = repo_roots;
      if (include_stale !== undefined) options.includeStale = include_stale;
      if (limit !== undefined) options.limit = limit;
      const snapshot = readHivemind(options);
      return { content: [{ type: 'text', text: JSON.stringify(snapshot) }] };
    },
  );

  server.tool(
    'hivemind_context',
    'Before editing, inspect ownership, then claim touched files on the active task. Active ownership, relevant memory, negative warnings, nearby claims, hot files, attention counts, and observation IDs stay compact.',
    {
      repo_root: z.string().min(1).optional(),
      repo_roots: z.array(z.string().min(1)).max(20).optional(),
      include_stale: z.boolean().optional(),
      limit: z.number().int().positive().max(100).optional(),
      query: z.string().min(1).optional(),
      memory_limit: z.number().int().positive().max(10).optional(),
      max_claims: z.number().int().positive().max(100).optional(),
      max_hot_files: z.number().int().positive().max(100).optional(),
      attention_id_limit: z.number().int().positive().max(100).optional(),
      session_id: z.string().min(1).optional(),
      agent: z.string().min(1).optional(),
    },
    async ({
      repo_root,
      repo_roots,
      include_stale,
      limit,
      query,
      memory_limit,
      max_claims,
      max_hot_files,
      attention_id_limit,
      session_id,
      agent,
    }) => {
      const laneLimit = limit ?? DEFAULT_CONTEXT_LANE_LIMIT;
      const snapshot = readHivemind(
        toHivemindOptions({ repo_root, repo_roots, include_stale, limit: laneLimit }),
      );
      const memoryLimit = memory_limit ?? DEFAULT_CONTEXT_MEMORY_LIMIT;
      const maxClaims = max_claims ?? DEFAULT_CONTEXT_CLAIM_LIMIT;
      const maxHotFiles = max_hot_files ?? DEFAULT_CONTEXT_HOT_FILE_LIMIT;
      const attentionLimit = attention_id_limit ?? DEFAULT_CONTEXT_ATTENTION_ID_LIMIT;
      const contextQuery = buildContextQuery(query, snapshot.sessions);
      let memoryHits: SearchResult[] = [];
      let negativeWarnings: CompactNegativeWarning[] = [];

      if (contextQuery) {
        const e = (await resolveEmbedder()) ?? undefined;
        memoryHits = await store.search(contextQuery, memoryLimit, e);
        negativeWarnings = await searchNegativeWarnings(
          store,
          contextQuery,
          Math.min(memoryLimit, 3),
        );
      }

      const attentionIdentity = resolveAttentionIdentity(session_id, agent);
      const attentionInbox = buildAttentionInbox(store, {
        session_id: attentionIdentity.session_id,
        agent: attentionIdentity.agent,
        ...(repo_root !== undefined ? { repo_root } : {}),
        ...(repo_roots !== undefined ? { repo_roots } : {}),
        include_stalled_lanes: false,
        recent_claim_limit: maxClaims,
      });
      const attentionIds = attentionObservationIds(attentionInbox, attentionLimit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              buildHivemindContext(snapshot, memoryHits, negativeWarnings, contextQuery, {
                maxClaims,
                maxHotFiles,
                attention: {
                  session_id: attentionIdentity.session_id,
                  agent: attentionIdentity.agent,
                  summary: attentionInbox.summary,
                  observation_ids: attentionIds.ids,
                  observation_ids_truncated: attentionIds.truncated,
                },
              }),
            ),
          },
        ],
      };
    },
  );
}

function resolveAttentionIdentity(
  sessionId: string | undefined,
  agent: string | undefined,
): { session_id: string; agent: string } {
  const detected = detectMcpClientIdentity();
  return {
    session_id: sessionId ?? detected.sessionId,
    agent: agent ?? agentFromIde(detected.ide),
  };
}

function agentFromIde(ide: string): string {
  return ide === 'claude-code' ? 'claude' : ide;
}

function attentionObservationIds(
  inbox: AttentionInbox,
  limit: number,
): { ids: number[]; truncated: boolean } {
  const orderedIds = [
    ...inbox.unread_messages.filter((m) => m.urgency === 'blocking').map((m) => m.id),
    ...inbox.pending_handoffs.map((h) => h.id),
    ...inbox.pending_wakes.map((w) => w.id),
    ...inbox.unread_messages.filter((m) => m.urgency === 'needs_reply').map((m) => m.id),
    ...inbox.coalesced_messages.map((m) => m.latest_id),
    ...inbox.read_receipts.map((r) => r.read_message_id),
  ];
  const uniqueIds = [...new Set(orderedIds)];
  return { ids: uniqueIds.slice(0, limit), truncated: uniqueIds.length > limit };
}
