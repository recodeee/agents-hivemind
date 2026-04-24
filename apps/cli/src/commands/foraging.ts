import { join } from 'node:path';
import { loadSettings, resolveDataDir } from '@colony/config';
import { MemoryStore } from '@colony/core';
import { scanExamples } from '@colony/foraging';
import type { Command } from 'commander';
import kleur from 'kleur';

const FORAGING_SESSION_ID = 'foraging';

/**
 * The foraging session owns every `foraged-pattern` observation. It's a
 * fixed session id (not per-invocation) so repeat scans land on the same
 * row and session-wide cleanups ("drop everything foraging ever wrote")
 * stay trivial.
 */
function ensureForagingSession(store: MemoryStore): void {
  store.startSession({
    id: FORAGING_SESSION_ID,
    ide: 'foraging',
    cwd: process.cwd(),
  });
}

export function registerForagingCommand(program: Command): void {
  const group = program
    .command('foraging')
    .description('Index and query <repo_root>/examples food sources');

  group
    .command('scan')
    .description('Scan <cwd>/examples for changed food sources and re-index them')
    .option('--cwd <path>', 'Repo root to scan (defaults to process.cwd())')
    .action(async (opts: { cwd?: string }) => {
      const settings = loadSettings();
      if (!settings.foraging.enabled) {
        process.stdout.write(`${kleur.yellow('foraging disabled')} — set foraging.enabled true\n`);
        return;
      }
      const repo_root = opts.cwd ?? process.cwd();
      const dbPath = join(resolveDataDir(settings.dataDir), 'data.db');
      const store = new MemoryStore({ dbPath, settings });
      try {
        ensureForagingSession(store);
        const result = scanExamples({
          repo_root,
          store,
          session_id: FORAGING_SESSION_ID,
          limits: {
            max_depth: settings.foraging.maxDepth,
            max_file_bytes: settings.foraging.maxFileBytes,
            max_files_per_source: settings.foraging.maxFilesPerSource,
          },
          extra_secret_env_names: settings.foraging.extraSecretEnvNames,
        });
        const changed = result.scanned.length - result.skipped_unchanged;
        process.stdout.write(
          `${kleur.green('✓')} foraging: ${result.scanned.length} source(s), ${changed} re-indexed, ${result.skipped_unchanged} skipped (unchanged), ${result.indexed_observations} observation(s)\n`,
        );
      } finally {
        store.close();
      }
    });

  group
    .command('list')
    .description('List indexed example food sources')
    .option('--cwd <path>', 'Repo root to list (defaults to process.cwd())')
    .action(async (opts: { cwd?: string }) => {
      const settings = loadSettings();
      const repo_root = opts.cwd ?? process.cwd();
      const dbPath = join(resolveDataDir(settings.dataDir), 'data.db');
      const store = new MemoryStore({ dbPath, settings });
      try {
        const rows = store.storage.listExamples(repo_root);
        if (rows.length === 0) {
          process.stdout.write(
            `${kleur.gray('no indexed examples — run `colony foraging scan`')}\n`,
          );
          return;
        }
        for (const r of rows) {
          const when = new Date(r.last_scanned_at).toISOString().slice(0, 19).replace('T', ' ');
          process.stdout.write(
            `  ${kleur.cyan(r.example_name.padEnd(28))} ${kleur.dim((r.manifest_kind ?? 'unknown').padEnd(8))} ${r.observation_count} obs  ${kleur.dim(when)}\n`,
          );
        }
      } finally {
        store.close();
      }
    });

  group
    .command('clear')
    .description('Delete indexed example rows (and their foraged observations)')
    .option('--cwd <path>', 'Repo root to clear (defaults to process.cwd())')
    .option('--example <name>', 'Clear a single example rather than all of them')
    .action(async (opts: { cwd?: string; example?: string }) => {
      const settings = loadSettings();
      const repo_root = opts.cwd ?? process.cwd();
      const dbPath = join(resolveDataDir(settings.dataDir), 'data.db');
      const store = new MemoryStore({ dbPath, settings });
      try {
        const targets = opts.example
          ? store.storage.listExamples(repo_root).filter((r) => r.example_name === opts.example)
          : store.storage.listExamples(repo_root);
        if (targets.length === 0) {
          process.stdout.write(`${kleur.gray('nothing to clear')}\n`);
          return;
        }
        let dropped = 0;
        for (const row of targets) {
          dropped += store.storage.deleteForagedObservations(repo_root, row.example_name);
          store.storage.deleteExample(repo_root, row.example_name);
        }
        process.stdout.write(
          `${kleur.green('✓')} cleared ${targets.length} example(s), dropped ${dropped} observation(s)\n`,
        );
      } finally {
        store.close();
      }
    });
}
