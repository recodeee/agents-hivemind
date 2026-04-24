import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type ExtractedShape, extract, readCapped } from './extractor.js';
import { DEFAULT_SCAN_LIMITS, type FoodSource, type ScanLimits } from './types.js';

export interface ScanFsOptions {
  repo_root: string;
  limits?: Partial<ScanLimits>;
}

export interface ScanFsResult {
  scanned: FoodSource[];
}

/**
 * Discover food sources on disk without touching storage. Storage-aware
 * `scanExamples` (next PR) wraps this and decides which of the returned
 * sources to actually index based on `storage.getExample` hashes.
 *
 * Decoupling is deliberate: (a) the fs walk is pure and easy to test in
 * isolation, (b) the storage-aware wrapper can stay a thin orchestrator
 * with no fs logic of its own.
 */
export function scanExamplesFs(opts: ScanFsOptions): ScanFsResult {
  const limits = mergeLimits(opts.limits);
  const examplesDir = join(opts.repo_root, 'examples');

  let names: string[];
  try {
    names = readdirSync(examplesDir);
  } catch {
    return { scanned: [] };
  }
  names.sort();

  const scanned: FoodSource[] = [];
  for (const example_name of names) {
    const abs_path = join(examplesDir, example_name);
    let isDir = false;
    try {
      isDir = statSync(abs_path).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    const shape = extract(abs_path, limits);
    const content_hash = computeContentHash(abs_path, shape, limits);
    scanned.push({
      repo_root: opts.repo_root,
      example_name,
      abs_path,
      manifest_kind: shape.manifest_kind,
      manifest_path: shape.manifest_path,
      readme_path: shape.readme_path,
      entrypoints: shape.entrypoints,
      content_hash,
    });
  }
  return { scanned };
}

/**
 * Stable hash of (manifest bytes, sorted {path,size} pairs). Chosen
 * over "hash every file" because the hash runs on every SessionStart
 * and must finish in milliseconds. Size + path shifts are a sufficient
 * change signal: an edit to any tracked file moves the size, a rename
 * moves the path, a new file moves the set. A pure content-preserving
 * edit (touch, whitespace-only, etc.) will miss — acceptable since the
 * cached observations already encode the meaningful content.
 */
function computeContentHash(abs_path: string, shape: ExtractedShape, limits: ScanLimits): string {
  const hash = createHash('sha256');
  if (shape.manifest_path) {
    const manifest = readCapped(join(abs_path, shape.manifest_path), limits.max_file_bytes);
    if (manifest !== null) {
      hash.update(`manifest:${shape.manifest_path}\n`);
      hash.update(manifest);
      hash.update('\n');
    }
  }
  hash.update('filetree:\n');
  for (const f of shape.file_tree.slice().sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(`${f.path}\t${f.size}\n`);
  }
  return hash.digest('hex');
}

function mergeLimits(partial?: Partial<ScanLimits>): ScanLimits {
  return {
    max_depth: partial?.max_depth ?? DEFAULT_SCAN_LIMITS.max_depth,
    max_file_bytes: partial?.max_file_bytes ?? DEFAULT_SCAN_LIMITS.max_file_bytes,
    max_files_per_source: partial?.max_files_per_source ?? DEFAULT_SCAN_LIMITS.max_files_per_source,
  };
}
