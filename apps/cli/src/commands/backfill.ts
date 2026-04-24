import { join } from 'node:path';
import { loadSettings, resolveDataDir } from '@colony/config';
import { inferIdeFromSessionId } from '@colony/core';
import { Storage } from '@colony/storage';
import type { Command } from 'commander';

/**
 * `colony backfill ide` heals sessions rows whose stored ide is `'unknown'`
 * by re-running the same session-id prefix inference that the hooks now
 * apply on write. It exists because ensureSession used to hardcode
 * `ide = 'unknown'` for on-demand-materialised rows, which left a long
 * trail of orphan `codex-*` and `agent/codex/*` sessions in the viewer.
 *
 * The command is idempotent: rows that already have a known ide are
 * skipped, and re-running it only writes rows the inferrer can actually
 * classify. No-op when every row already has a concrete owner.
 */
export function registerBackfillCommand(program: Command): void {
  const backfill = program
    .command('backfill')
    .description('Heal historical rows that predate newer inference logic.');

  backfill
    .command('ide')
    .description('Re-infer the ide column for sessions stored as unknown.')
    .action(async () => {
      const settings = loadSettings();
      const storage = new Storage(join(resolveDataDir(settings.dataDir), 'data.db'));
      try {
        const { scanned, updated } = storage.backfillUnknownIde((id) =>
          inferIdeFromSessionId(id),
        );
        process.stdout.write(
          `backfill ide: scanned=${scanned} updated=${updated} remaining=${scanned - updated}\n`,
        );
      } finally {
        storage.close();
      }
    });
}
