export interface ReadingCache<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T, ttlMs: number): Promise<void>;
}

interface Options<T> {
  now: () => Date;
  freshForMs: number;
  retryAfterMs: number;
  cache?: ReadingCache<T> | undefined;
}

/**
 * Bounds RPC spend whatever the traffic: a reading is shared in memory and
 * through the cache, concurrent callers wait on one read, and a failed read
 * isn't retried until `retryAfterMs` has passed.
 */
export class CachedReader<T extends { observedAt: string }> {
  private readonly held = new Map<string, { value?: T; until: number }>();
  private readonly inFlight = new Map<string, Promise<T | undefined>>();

  constructor(private readonly options: Options<T>) {}

  private remember(key: string, value: T | undefined, forMs: number): T | undefined {
    this.held.set(key, { ...(value ? { value } : {}), until: this.options.now().getTime() + forMs });
    return value;
  }

  private async load(key: string, read: () => Promise<T | undefined>): Promise<T | undefined> {
    const { cache, now, freshForMs, retryAfterMs } = this.options;
    const shared = await cache?.get(key).catch(() => null);
    if (shared) {
      const age = now().getTime() - new Date(shared.observedAt).getTime();
      if (age < freshForMs) return this.remember(key, shared, freshForMs - age);
    }
    const value = await read();
    if (!value) return this.remember(key, undefined, retryAfterMs);
    await cache?.set(key, value, freshForMs).catch(() => undefined);
    return this.remember(key, value, freshForMs);
  }

  /** `read` resolves to undefined on failure, and must not reject. */
  get(key: string, read: () => Promise<T | undefined>): Promise<T | undefined> {
    const held = this.held.get(key);
    if (held && held.until > this.options.now().getTime()) return Promise.resolve(held.value);
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.load(key, read).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, pending);
    }
    return pending;
  }
}
