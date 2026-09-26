interface Entry {
  failures: number;
  windowStart: number;
}

/** Counts failed logins per key in a fixed window (in memory: the app runs as one process). */
export class LoginLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #now: () => Date;
  readonly #entries = new Map<string, Entry>();

  constructor(options: { limit: number; windowMs: number; now?: () => Date }) {
    this.#limit = options.limit;
    this.#windowMs = options.windowMs;
    this.#now = options.now ?? (() => new Date());
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
      if (this.#entries.size >= 10_000) this.#prune(now);
      this.#entries.set(key, { failures: 1, windowStart: now });
    } else {
      entry.failures += 1;
    }
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
