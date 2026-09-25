/** Queue short bursts instead of rejecting a second topic's video/blog pair. */
export class RequestGate {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private readonly limit: number, private readonly capacity = 16) {}

  async acquire(signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted();
    if (this.active >= this.limit) {
      if (this.waiting.length >= this.capacity) throw new Error("Queue full");
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          this.waiting = this.waiting.filter(item => item !== start);
          reject(signal.reason);
        };
        const start = () => {
          signal.removeEventListener("abort", abort);
          this.active++;
          resolve();
        };
        this.waiting.push(start);
        signal.addEventListener("abort", abort, { once: true });
      });
    } else this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.waiting.shift()?.();
    };
  }
}
