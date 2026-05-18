import { loadSettings } from '@colony/config';
import type { Command } from 'commander';
import kleur from 'kleur';
import { withStore } from '../util/store.js';

/**
 * ICM slice 3 — `colony memory prune` removes near-zero-weight medium/low
 * observations. Critical/high are never affected. Opt-in only; not called
 * automatically by any code path.
 *
 *   colony memory prune --min-weight 0.1
 *   colony memory prune --dry-run
 */
export function registerMemoryCommand(program: Command): void {
  const memory = program
    .command('memory')
    .description('Inspect and maintain compressed observation memory.');

  memory
    .command('prune')
    .description(
      'Delete near-zero-weight medium/low observations. Critical/high are never touched.',
    )
    .option(
      '--min-weight <n>',
      'delete medium/low rows whose weight is strictly less than this value',
      '0.1',
    )
    .option('--dry-run', 'count candidate rows without deleting', false)
    .action(async (opts: { minWeight: string; dryRun: boolean }) => {
      const minWeight = Number.parseFloat(opts.minWeight);
      if (!Number.isFinite(minWeight) || minWeight < 0) {
        process.stderr.write(
          `${kleur.red('error:')} --min-weight must be a non-negative number, got ${kleur.yellow(opts.minWeight)}\n`,
        );
        process.exit(1);
      }
      const settings = loadSettings();
      await withStore(
        settings,
        async (store) => {
          if (opts.dryRun) {
            const count = store.storage.countLowDecayCandidates(minWeight);
            process.stdout.write(
              `would delete ${kleur.cyan(String(count))} rows (importance in medium/low, weight < ${minWeight})\n`,
            );
            return;
          }
          const deleted = store.pruneLowDecay({ minWeight });
          process.stdout.write(
            `deleted ${kleur.cyan(String(deleted))} rows (importance in medium/low, weight < ${minWeight})\n`,
          );
        },
        { readonly: opts.dryRun },
      );
    });
}
