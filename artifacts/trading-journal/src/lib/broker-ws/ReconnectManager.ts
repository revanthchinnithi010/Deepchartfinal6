export interface ReconnectOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  maxAttempts?: number;
  onReconnect: (attempt: number) => void;
  onMaxAttemptsReached?: () => void;
}

/**
 * Exponential backoff reconnect engine.
 * Caller drives connect(); this class schedules the retry timing.
 */
export class ReconnectManager {
  private handle: ReturnType<typeof setTimeout> | null = null;
  private _attempts = 0;
  private currentDelay: number;

  private readonly initialDelay: number;
  private readonly maxDelay: number;
  private readonly factor: number;
  private readonly maxAttempts: number;

  constructor(private readonly opts: ReconnectOptions) {
    this.initialDelay  = opts.initialDelayMs  ?? 1_000;
    this.maxDelay      = opts.maxDelayMs       ?? 30_000;
    this.factor        = opts.backoffFactor    ?? 1.5;
    this.maxAttempts   = opts.maxAttempts      ?? Infinity;
    this.currentDelay  = this.initialDelay;
  }

  get attempts(): number { return this._attempts; }

  schedule(): void {
    this.cancel();
    if (this._attempts >= this.maxAttempts) {
      this.opts.onMaxAttemptsReached?.();
      return;
    }
    this._attempts += 1;
    const delay = this.currentDelay;
    console.log(`[Reconnect] attempt ${this._attempts} in ${delay}ms`);
    this.handle = setTimeout(() => {
      this.handle = null;
      this.opts.onReconnect(this._attempts);
    }, delay);
    this.currentDelay = Math.min(this.currentDelay * this.factor, this.maxDelay);
  }

  reset(): void {
    this.cancel();
    this._attempts    = 0;
    this.currentDelay = this.initialDelay;
  }

  cancel(): void {
    if (this.handle) { clearTimeout(this.handle); this.handle = null; }
  }
}
