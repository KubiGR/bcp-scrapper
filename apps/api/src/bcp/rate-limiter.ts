const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Limits both how often tasks start (requestsPerSecond) and how many run at once
 * (maxConcurrency). Keeps our load on BCP polite no matter how many syncs run.
 */
export class RateLimiter {
  readonly #intervalMs: number;
  readonly #maxConcurrency: number;
  #nextStartAt = 0;
  #active = 0;
  readonly #waiting: (() => void)[] = [];

  constructor(options: { requestsPerSecond: number; maxConcurrency: number }) {
    this.#intervalMs = 1000 / options.requestsPerSecond;
    this.#maxConcurrency = options.maxConcurrency;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.#acquireSlot();
    try {
      const waitMs = this.#reserveStartTime();
      if (waitMs > 0) await sleep(waitMs);
      return await task();
    } finally {
      this.#releaseSlot();
    }
  }

  #acquireSlot(): Promise<void> {
    if (this.#active < this.#maxConcurrency) {
      this.#active += 1;
      return Promise.resolve();
    }
    // The slot is handed over directly by #releaseSlot, so #active stays unchanged.
    return new Promise((resolve) => this.#waiting.push(resolve));
  }

  #releaseSlot(): void {
    const next = this.#waiting.shift();
    if (next) next();
    else this.#active -= 1;
  }

  /** Books the next free start time and returns how long to wait for it. */
  #reserveStartTime(): number {
    const now = Date.now();
    const startAt = Math.max(now, this.#nextStartAt);
    this.#nextStartAt = startAt + this.#intervalMs;
    return startAt - now;
  }
}
