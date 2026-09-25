/** Bounded process-local cache. Concurrent readers share work, not cancellation. */
export class DiscoveryCache<T> {
  private values = new Map<string, { value: T; expires: number }>();
  private pending = new Map<string, { controller: AbortController; promise: Promise<T>; readers: number }>();

  constructor(private readonly keep: (value: T) => boolean, private readonly ttl = 600000, private readonly capacity = 100) {}

  async get(key: string, signal: AbortSignal, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    const cached = this.values.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    this.values.delete(key);
    let work = this.pending.get(key);
    if (!work) {
      const controller = new AbortController();
      work = { controller, readers: 0, promise: Promise.resolve().then(() => run(controller.signal)) };
      const entry = work;
      entry.promise = entry.promise.then(value => {
        if (!controller.signal.aborted && this.keep(value)) {
          if (this.values.size >= this.capacity) this.values.delete(this.values.keys().next().value!);
          this.values.set(key, { value, expires: Date.now() + this.ttl });
        }
        return value;
      }).finally(() => { if (this.pending.get(key) === entry) this.pending.delete(key); });
      this.pending.set(key, entry);
    }
    const entry = work;
    entry.readers++;
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const finish = (done: () => void) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener("abort", abort);
        if (--entry.readers === 0 && this.pending.get(key) === entry) {
          this.pending.delete(key);
          entry.controller.abort();
        }
        done();
      };
      const abort = () => finish(() => reject(signal.reason));
      signal.addEventListener("abort", abort, { once: true });
      entry.promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
      if (signal.aborted) abort();
    });
  }
}
