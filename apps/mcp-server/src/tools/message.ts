import { TASK_THREAD_ERROR_CODES, TaskThread, listMessagesForAgent } from '@colony/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { mcpError, mcpErrorResponse } from './shared.js';

export function register(server: McpServer, ctx: ToolContext): void {
  const { store } = ctx;

  server.tool(
    'task_message',
    "Send a direct message to another agent on a task thread. Use for coordination chat that doesn't transfer file claims — for 'hand off the work + files', use task_hand_off instead. Urgency controls preface prominence: fyi (collapsed), needs_reply (summary + expected action), blocking (top-of-preface). Pass reply_to to chain onto an earlier message; the parent's status flips to 'replied' atomically.",
    {
      task_id: z.number().int().positive(),
      session_id: z.string().min(1).describe('your session_id (the sender)'),
      agent: z.string().min(1).describe('your agent name, e.g. claude or codex'),
      to_agent: z.enum(['claude', 'codex', 'any']),
      to_session_id: z
        .string()
        .optional()
        .describe('Optional: target a specific live session. Prefer to_agent for durability.'),
      content: z.string().min(1),
      reply_to: z.number().int().positive().optional(),
      urgency: z.enum(['fyi', 'needs_reply', 'blocking']).optional(),
    },
    async (args) => {
      const thread = new TaskThread(store, args.task_id);
      const id = thread.postMessage({
        from_session_id: args.session_id,
        from_agent: args.agent,
        to_agent: args.to_agent,
        ...(args.to_session_id !== undefined ? { to_session_id: args.to_session_id } : {}),
        content: args.content,
        ...(args.reply_to !== undefined ? { reply_to: args.reply_to } : {}),
        ...(args.urgency !== undefined ? { urgency: args.urgency } : {}),
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ message_observation_id: id, status: 'unread' }),
          },
        ],
      };
    },
  );

  server.tool(
    'task_messages',
    'List messages addressed to you across tasks you participate in (or scoped to task_ids). Compact shape: id, task_id, ts, from_session_id/agent, urgency, status, reply_to, preview. Fetch full bodies via get_observations. Does NOT mark as read — call task_message_mark_read for that.',
    {
      session_id: z.string().min(1),
      agent: z.string().min(1),
      since_ts: z.number().int().nonnegative().optional(),
      task_ids: z.array(z.number().int().positive()).max(100).optional(),
      unread_only: z.boolean().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async (args) => {
      const messages = listMessagesForAgent(store, {
        session_id: args.session_id,
        agent: args.agent,
        ...(args.since_ts !== undefined ? { since_ts: args.since_ts } : {}),
        ...(args.task_ids !== undefined ? { task_ids: args.task_ids } : {}),
        ...(args.unread_only !== undefined ? { unread_only: args.unread_only } : {}),
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
      });
      return { content: [{ type: 'text', text: JSON.stringify(messages) }] };
    },
  );

  server.tool(
    'task_message_mark_read',
    'Mark a message as read. Idempotent: re-marking a read or replied message is a no-op. Returns the resulting status.',
    {
      message_observation_id: z.number().int().positive(),
      session_id: z.string().min(1),
    },
    async ({ message_observation_id, session_id }) => {
      const obs = store.storage.getObservation(message_observation_id);
      if (!obs?.task_id) {
        return mcpErrorResponse(
          TASK_THREAD_ERROR_CODES.OBSERVATION_NOT_ON_TASK,
          'observation is not on a task',
        );
      }
      const thread = new TaskThread(store, obs.task_id);
      try {
        const status = thread.markMessageRead(message_observation_id, session_id);
        return { content: [{ type: 'text', text: JSON.stringify({ status }) }] };
      } catch (err) {
        return mcpError(err);
      }
    },
  );
}
