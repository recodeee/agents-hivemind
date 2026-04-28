import {
  SUGGESTION_THRESHOLDS,
  type SuggestionPayload,
  buildSuggestionPayload,
  findSimilarTasks,
} from '@colony/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from './context.js';

// The honesty fallback shape — same schema as a real payload, but every
// structured field is empty / null and `insufficient_data_reason` carries
// the explanation. The downstream consumer (CLI, SessionStart preface)
// can branch on this single field rather than special-casing every kind
// of "we don't have enough data" path.
function emptyPayload(reason: string): SuggestionPayload {
  return {
    similar_tasks: [],
    first_files_likely_claimed: [],
    patterns_to_watch: [],
    resolution_hints: null,
    insufficient_data_reason: reason,
  };
}

export function register(server: McpServer, ctx: ToolContext): void {
  const { store, resolveEmbedder } = ctx;

  server.tool(
    'task_suggest_approach',
    [
      'Ask the colony what its accumulated history suggests about a new task.',
      'Returns similar past tasks, files commonly claimed early, failure',
      'patterns to watch for, and median resolution metrics — OR an explicit',
      "`insufficient_data_reason` when the corpus can't support a confident",
      'suggestion. Honesty about the limits of memory is the load-bearing',
      'property: the surface refuses to suggest at all rather than emit',
      'low-confidence noise that would erode trust in future calls.',
    ].join(' '),
    {
      query: z
        .string()
        .min(1)
        .describe('Free-text description of the task you are about to start.'),
      repo_root: z
        .string()
        .min(1)
        .optional()
        .describe('Scope to a single repo (default: search all repos in the corpus).'),
      current_task_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'If you are inside an existing task, pass its id so it is excluded from results — without exclusion, the top match would always be yourself.',
        ),
      limit: z
        .number()
        .int()
        .positive()
        .max(20)
        .optional()
        .describe('Max similar tasks to return (default 10).'),
    },
    async (args) => {
      const embedder = await resolveEmbedder();
      if (!embedder) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(emptyPayload('embedder unavailable')),
            },
          ],
        };
      }

      let queryVec: Float32Array;
      try {
        queryVec = await embedder.embed(args.query);
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                emptyPayload(`embed failed: ${err instanceof Error ? err.message : String(err)}`),
              ),
            },
          ],
        };
      }

      const similar = findSimilarTasks(store, embedder, queryVec, {
        ...(args.repo_root !== undefined ? { repo_root: args.repo_root } : {}),
        ...(args.current_task_id !== undefined ? { exclude_task_ids: [args.current_task_id] } : {}),
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
        min_similarity: SUGGESTION_THRESHOLDS.SIMILARITY_FLOOR,
      });

      const payload = buildSuggestionPayload(store, similar);
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
      };
    },
  );
}
