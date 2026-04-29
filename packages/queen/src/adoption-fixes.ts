import { type QueenOrderedPlanInput, orderedPlanFromWaves } from './decompose.js';

export const colonyAdoptionFixesPlanInput: QueenOrderedPlanInput = {
  slug: 'colony-adoption-fixes',
  title: 'Colony adoption fixes',
  problem:
    'Queen should publish the current Colony adoption fixes as claimable ordered waves so agents pull work through task_ready_for_agent and task_plan_claim_subtask instead of direct runtime assignment.',
  acceptance_criteria: [
    'Wave 1 exposes auto-claim, warning fallback, and the hivemind_context to attention_inbox funnel as immediately claimable work.',
    'Wave 2 unlocks notepad routing, bridge status, and health telemetry after Wave 1 completes.',
    'Wave 3 unlocks docs and tests finalization after Wave 2 completes.',
    'Queen publishes structure only; agents pull and claim subtasks themselves.',
  ],
  waves: [
    {
      id: 'wave-1',
      title: 'Claim and inbox funnel',
      subtasks: [
        {
          title: 'Auto-claim before Edit/Write',
          description:
            'Auto-claim touched files before Edit/Write-like tool calls so claim-before-edit improves before mutation.',
          file_scope: [
            'packages/hooks/src/auto-claim.ts',
            'packages/hooks/test/auto-claim.test.ts',
          ],
          capability_hint: 'infra_work',
        },
        {
          title: 'Add claim-before-edit warning fallback',
          description:
            'Warn when auto-claim cannot claim a touched file before a write-like tool continues.',
          file_scope: [
            'packages/hooks/src/handlers/pre-tool-use.ts',
            'packages/hooks/test/session-start-conflicts.test.ts',
          ],
          capability_hint: 'infra_work',
        },
        {
          title: 'Strengthen hivemind_context to attention_inbox funnel',
          description:
            'Keep hivemind_context routing agents through attention_inbox before task_ready_for_agent work selection.',
          file_scope: [
            'apps/mcp-server/src/tools/shared.ts',
            'apps/mcp-server/test/server.test.ts',
          ],
          capability_hint: 'api_work',
        },
      ],
    },
    {
      id: 'wave-2',
      title: 'OMX bridge and health telemetry',
      subtasks: [
        {
          title: 'Route OMX notepad writes to task_note_working',
          description:
            'Prefer task_note_working for OMX working-state writes and keep notepad fallback as the compact pointer path.',
          file_scope: [
            'apps/mcp-server/src/tools/task.ts',
            'apps/mcp-server/test/task-threads.test.ts',
          ],
          capability_hint: 'api_work',
        },
        {
          title: 'Expose bridge status for OMX display',
          description: 'Surface compact Colony bridge status for OMX HUD and status consumers.',
          file_scope: [
            'apps/mcp-server/src/tools/bridge.ts',
            'apps/mcp-server/test/bridge-status.test.ts',
          ],
          capability_hint: 'api_work',
        },
        {
          title: 'Improve health telemetry for adoption targets',
          description:
            'Show active plans, ready-to-claim subtasks, task_plan_claim_subtask usage, and loop conversion health.',
          file_scope: ['apps/cli/src/commands/health.ts', 'apps/cli/test/health.test.ts'],
          capability_hint: 'test_work',
        },
      ],
    },
    {
      id: 'wave-3',
      title: 'Docs and tests finalization',
      subtasks: [
        {
          title: 'Finalize adoption docs and tests',
          description:
            'Document and test the full Colony adoption loop after the claim, bridge, and health waves land.',
          file_scope: [
            'docs/QUEEN.md',
            'apps/mcp-server/test/coordination-loop.test.ts',
            'packages/queen/test/decompose.test.ts',
          ],
          capability_hint: 'test_work',
        },
      ],
    },
  ],
};

export const colonyAdoptionFixesPlan = orderedPlanFromWaves(colonyAdoptionFixesPlanInput);
