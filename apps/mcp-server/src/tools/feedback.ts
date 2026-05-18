import type { FeedbackImportance } from '@colony/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ToolContext, defaultWrapHandler } from './context.js';
import { mcpErrorResponse } from './shared.js';

/**
 * Feedback lane (ICM slice 2 — docs/icm-integration-plan.md). Records the
 * "AI predicted X, real answer was Y" pairs that surface in code review,
 * test failures, and human corrections so a later agent can search prior
 * mistakes by topic.
 *
 * Progressive disclosure mirrors the observation surface:
 *   feedback_record → row id only
 *   feedback_search → compact hits (id, topic, score, snippet)
 *   feedback_stats  → counts per topic
 *
 * Compression invariant: prediction/correction/context flow through
 * `MemoryStore.recordFeedback`, which runs each body through the same
 * `prepareMemoryText` path observations use. Tool handlers never write
 * raw prose to storage directly.
 *
 * Note: this PR does not register a pre-tool-use hook that surfaces prior
 * corrections on inbound prompts. That belongs to a follow-up PR so this
 * slice can ship behind a search surface first.
 */
export function register(server: McpServer, ctx: ToolContext): void {
  const wrapHandler = ctx.wrapHandler ?? defaultWrapHandler;
  const { store } = ctx;

  const importanceSchema = z
    .enum(['critical', 'high', 'medium', 'low'])
    .describe('how strongly this correction should weigh against repeating the prediction');

  server.tool(
    'feedback_record',
    "Record an 'AI predicted X, real answer was Y' correction. Bodies are compressed via the same path observations use; returns only the new row id.",
    {
      topic: z
        .string()
        .min(1)
        .max(200)
        .describe('a short, stable label callers can pivot on (e.g. "frontend.routing")'),
      prediction: z.string().min(1).describe('what the AI predicted / asserted'),
      correction: z.string().min(1).describe('what the real answer turned out to be'),
      context: z
        .string()
        .min(1)
        .optional()
        .describe('optional surrounding context (where the prediction was made)'),
      importance: importanceSchema.optional(),
      created_by: z.string().min(1).optional().describe('agent or human author for audit'),
    },
    wrapHandler('feedback_record', async (args) => {
      const topic = args.topic.trim();
      if (!topic) {
        return mcpErrorResponse('INTERNAL_ERROR', 'feedback_record: topic must be non-empty');
      }
      const id = store.recordFeedback({
        topic,
        prediction: args.prediction,
        correction: args.correction,
        ...(args.context !== undefined ? { context: args.context } : {}),
        ...(args.importance !== undefined
          ? { importance: args.importance as FeedbackImportance }
          : {}),
        ...(args.created_by !== undefined ? { created_by: args.created_by } : {}),
      });
      if (id < 0) {
        return mcpErrorResponse(
          'INTERNAL_ERROR',
          'feedback_record: prediction/correction collapsed to empty after privacy redaction',
        );
      }
      return { content: [{ type: 'text', text: JSON.stringify({ id }) }] };
    }),
  );

  server.tool(
    'feedback_search',
    'Search prior corrections. Returns compact hits (id, topic, importance, score, snippet); use feedback_record output ids and a follow-up read if you need the full bodies.',
    {
      query: z
        .string()
        .min(1)
        .describe('FTS5 query across topic + prediction + correction + context'),
      topic: z
        .string()
        .min(1)
        .optional()
        .describe('optional exact-match filter on the feedback topic'),
      limit: z.number().int().positive().max(100).optional(),
    },
    wrapHandler('feedback_search', async (args) => {
      const hits = store.searchFeedback({
        query: args.query,
        ...(args.topic !== undefined ? { topic: args.topic } : {}),
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
      });
      return { content: [{ type: 'text', text: JSON.stringify({ hits }) }] };
    }),
  );

  server.tool(
    'feedback_stats',
    'Per-topic counts of recorded corrections, sorted by most recent first. Pass a topic to scope to a single bucket.',
    {
      topic: z.string().min(1).optional(),
    },
    wrapHandler('feedback_stats', async (args) => {
      const stats = store.feedbackStats(args.topic !== undefined ? { topic: args.topic } : {});
      return { content: [{ type: 'text', text: JSON.stringify({ stats }) }] };
    }),
  );
}
