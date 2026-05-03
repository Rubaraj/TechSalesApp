import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from '../../config/logger.js';

/**
 * Concurrency-safe, debounced atomic JSON file store. See plan §4 "JSON
 * repository persistence":
 *
 * - One in-flight write per file, gated by `currentWrite`. New writes await
 *   the previous one — the queue can never be deeper than 1 because the
 *   `dirty` flag collapses any pending requests into the next pass.
 * - Dirty-flag pattern: the writer drains the flag INSIDE the in-flight
 *   write, so an update arriving during the debounce or during the write
 *   itself can never be lost.
 * - Atomic-on-disk: write to `<file>.tmp` then `fs.rename` (atomic on
 *   ext4/NTFS/APFS).
 * - 100ms debounce — the per-file serialization above means longer windows
 *   are pointless.
 * - `JSON_PERSIST=false` ⇒ in-memory only.
 */
export class JsonStore<T> {
  private cache: T;
  private dirty = false;
  private currentWrite: Promise<void> | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly debounceMs: number;
  private readonly persist: boolean;

  constructor(
    private readonly filePath: string,
    initial: T,
    options: { persist?: boolean; debounceMs?: number } = {},
  ) {
    this.cache = initial;
    this.persist = options.persist ?? true;
    this.debounceMs = options.debounceMs ?? 100;
  }

  /** Synchronous read of the in-memory cache. */
  get(): T {
    return this.cache;
  }

  /**
   * Atomically replace the cache and schedule a persist. The mutation is
   * visible to subsequent `get()` calls immediately; the disk write happens
   * after the debounce window.
   */
  set(next: T): void {
    this.cache = next;
    this.dirty = true;
    this.scheduleFlush();
  }

  /** Mutate via callback. Convenience over `set(next(prev))`. */
  update(mutator: (prev: T) => T): void {
    this.set(mutator(this.cache));
  }

  /** Resolves once any pending writes have flushed to disk. */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      // Trigger immediately rather than waiting out the timer.
      this.startWriteLoop();
    }
    if (this.currentWrite) await this.currentWrite;
  }

  private scheduleFlush(): void {
    if (!this.persist) return;
    if (this.debounceTimer) return; // Already pending.
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.startWriteLoop();
    }, this.debounceMs);
  }

  private startWriteLoop(): void {
    if (this.currentWrite) return; // Existing loop will pick up `dirty`.
    this.currentWrite = this.runWriteLoop()
      .catch((err) => {
        logger.error(
          { err, file: this.filePath },
          'JsonStore write loop failed',
        );
      })
      .finally(() => {
        this.currentWrite = null;
      });
  }

  private async runWriteLoop(): Promise<void> {
    // Drain the dirty flag inside the in-flight write — no update can be lost
    // in the debounce window because each pass re-checks `dirty` before exit.
    while (this.dirty) {
      this.dirty = false;
      const snapshot = this.cache;
      await this.writeAtomic(snapshot);
    }
  }

  private async writeAtomic(value: T): Promise<void> {
    const tmp = `${this.filePath}.tmp`;
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const json = JSON.stringify(value, null, 2);
    await fs.writeFile(tmp, json, 'utf8');
    await fs.rename(tmp, this.filePath);
  }

  /**
   * Static factory: read the file (creating it from `defaultValue` if missing).
   * If `persist=false`, the file is never written and `defaultValue` is used as-is.
   */
  static async load<T>(
    filePath: string,
    defaultValue: T,
    options: { persist?: boolean; debounceMs?: number } = {},
  ): Promise<JsonStore<T>> {
    const persist = options.persist ?? true;
    if (!persist) {
      return new JsonStore<T>(filePath, defaultValue, options);
    }
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as T;
      return new JsonStore<T>(filePath, parsed, options);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        const store = new JsonStore<T>(filePath, defaultValue, options);
        store.dirty = true;
        await store.flush();
        return store;
      }
      throw err;
    }
  }
}
