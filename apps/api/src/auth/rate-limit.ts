interface Entry {
  failures: number;
  windowStart: number;
}

/** Counts failed logins per key in a fixed window (in memory: the app runs as one process). */
export class LoginLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #now: () => Date;
  readonly #maxKeys: number;
  readonly #entries = new Map<string, Entry>();

  /** `maxKeys`: a hard cap on remembered keys, so a flood of addresses can't grow memory. */
  constructor(options: { limit: number; windowMs: number; now?: () => Date; maxKeys?: number }) {
    this.#limit = options.limit;
    this.#windowMs = options.windowMs;
    this.#now = options.now ?? (() => new Date());
    this.#maxKeys = options.maxKeys ?? 10_000;
  }

  /** How many keys are remembered. */
  get size(): number {
    return this.#entries.size;
  }

  #current(key: string, now: number): Entry | undefined {
    const entry = this.#entries.get(key);
    if (entry !== undefined && now - entry.windowStart >= this.#windowMs) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry;
  }

  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = this.#now().getTime();
    const entry = this.#current(key, now);
    if (entry === undefined || entry.failures < this.#limit) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const retryAfterSeconds = Math.ceil((entry.windowStart + this.#windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  fail(key: string): void {
    const now = this.#now().getTime();
    const entry = this.#current(key, now);
    if (entry === undefined) {
      if (this.#entries.size >= this.#maxKeys) this.#prune(now);
      // Still full of live entries: forget the oldest (a Map keeps insertion order).
      for (const oldest of this.#entries.keys()) {
        if (this.#entries.size < this.#maxKeys) break;
        this.#entries.delete(oldest);
      }
      this.#entries.set(key, { failures: 1, windowStart: now });
    } else {
      entry.failures += 1;
    }
  }

  /** Takes back one counted failure (an attempt counted up front that turned out fine). */
  release(key: string): void {
    const entry = this.#entries.get(key);
    if (entry === undefined) return;
    entry.failures -= 1;
    if (entry.failures <= 0) this.#entries.delete(key);
  }

  succeed(key: string): void {
    this.#entries.delete(key);
  }

  #prune(now: number): void {
    for (const [key, entry] of this.#entries) {
      if (now - entry.windowStart >= this.#windowMs) this.#entries.delete(key);
    }
  }
}
