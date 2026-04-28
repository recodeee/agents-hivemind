import { join } from 'node:path';
import { loadSettings, resolveDataDir } from '@colony/config';
import { Storage } from '@colony/storage';
import type { Command } from 'commander';
import kleur from 'kleur';

/**
 * Refresh cadence. Three seconds is a compromise: fast enough that new
 * claims show up while you're still looking at the screen, slow enough
 * that the redraw flicker isn't distracting in peripheral vision.
 */
const REFRESH_MS = 3000;

const OBSERVATION_LIMIT = 50;

interface RecentObservationRow {
  id: number;
  session_id: string;
  kind: string;
  content: string;
  ts: number;
}

export function renderFrame(storage: Storage): string {
  return readRecentObservations(storage, OBSERVATION_LIMIT)
    .map((row) => {
      const ts = new Date(row.ts).toISOString().slice(11, 19);
      const session = colorSession(row.session_id)(row.session_id.slice(0, 8).padEnd(8));
      const kind = row.kind.padEnd(15);
      const snippet = row.content.replace(/\s+/g, ' ').trim().slice(0, 50);
      return `${kleur.dim(ts)}  ${session}  ${kind} ${snippet}`;
    })
    .join('\n');
}

function readRecentObservations(storage: Storage, limit: number): RecentObservationRow[] {
  const storageWithMethod = storage as Storage & {
    recentObservations?: (limit?: number) => RecentObservationRow[];
  };
  if (typeof storageWithMethod.recentObservations === 'function') {
    return storageWithMethod.recentObservations(limit);
  }

  const rawDb = (
    storage as unknown as {
      db?: { prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] } };
    }
  ).db;
  if (!rawDb) return [];
  return rawDb
    .prepare(
      `SELECT o.id, o.session_id, o.kind, o.content, o.ts
       FROM observations o
       JOIN sessions s ON s.id = o.session_id
       ORDER BY o.ts DESC, o.id DESC
       LIMIT ?`,
    )
    .all(limit)
    .filter(isRecentObservationRow);
}

function isRecentObservationRow(row: unknown): row is RecentObservationRow {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.id === 'number' &&
    typeof r.session_id === 'string' &&
    typeof r.kind === 'string' &&
    typeof r.content === 'string' &&
    typeof r.ts === 'number'
  );
}

function colorSession(sessionId: string): (value: string) => string {
  const palette = [kleur.cyan, kleur.magenta, kleur.yellow, kleur.green, kleur.blue, kleur.red];
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length] ?? kleur.white;
}

export function registerObserveCommand(program: Command): void {
  program
    .command('observe')
    .description('Live dashboard of collaboration state. Run in a spare terminal during a session.')
    .option('--interval <ms>', 'Refresh interval in milliseconds', String(REFRESH_MS))
    .action((opts: { interval: string }) => {
      const settings = loadSettings();
      const dbPath = join(resolveDataDir(settings.dataDir), 'data.db');
      const storage = new Storage(dbPath);
      const intervalMs = Math.max(500, Number(opts.interval));

      // \x1b[3J clears scrollback where supported, \x1b[2J clears the
      // visible screen, and \x1b[H sends the cursor home. Minimal
      // cross-platform approach — avoids heavyweight `blessed`/`ink` deps
      // for what is ultimately a glorified printf loop.
      const paint = () => {
        process.stdout.write('\x1b[3J\x1b[H\x1b[2J');
        process.stdout.write(renderFrame(storage));
        process.stdout.write(`\n\n${kleur.dim(`refresh ${intervalMs}ms · ctrl-c to exit`)}\n`);
      };

      paint();
      const handle = setInterval(paint, intervalMs);

      const stop = () => {
        clearInterval(handle);
        storage.close();
        process.exit(0);
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    });
}
