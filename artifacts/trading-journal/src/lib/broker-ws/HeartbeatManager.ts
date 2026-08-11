export interface HeartbeatOptions {
  intervalMs: number;
  timeoutMs: number;
  onPing: () => void;
  onTimeout: () => void;
}

/**
 * Sends periodic pings and tracks pong latency.
 * Calls onTimeout if a pong is not received within timeoutMs.
 */
export class HeartbeatManager {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private pingAt: number | null = null;
  latencyMs: number | null = null;

  constructor(private readonly opts: HeartbeatOptions) {}

  start(): void {
    this.stop();
    // Do NOT send an immediate ping — wait for the first interval to elapse.
    // Sending a ping the instant the socket opens gives the remote no time to
    // establish its own heartbeat cycle, causing the timeout to fire before
    // any pong/heartbeat arrives and triggering an unnecessary reconnect.
    this.intervalHandle = setInterval(() => this.sendPing(), this.opts.intervalMs);
  }

  stop(): void {
    if (this.intervalHandle) { clearInterval(this.intervalHandle); this.intervalHandle = null; }
    this.clearTimeout();
    this.pingAt = null;
  }

  /** Call when a pong is received. Returns round-trip latency. */
  pong(): number | null {
    this.clearTimeout();
    if (this.pingAt === null) return null;
    this.latencyMs = Date.now() - this.pingAt;
    this.pingAt = null;
    return this.latencyMs;
  }

  private sendPing(): void {
    this.clearTimeout();
    this.pingAt = Date.now();
    this.opts.onPing();
    this.timeoutHandle = setTimeout(() => {
      this.pingAt = null;
      this.opts.onTimeout();
    }, this.opts.timeoutMs);
  }

  private clearTimeout(): void {
    if (this.timeoutHandle) { clearTimeout(this.timeoutHandle); this.timeoutHandle = null; }
  }
}
