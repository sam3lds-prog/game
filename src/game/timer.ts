/** Counts only active play time: running while the board is on screen, the app is in front, and no sheet covers it. */
export class ActiveTimer {
  private accumulated: number;
  private since: number | null = null;
  constructor(
    initialMs = 0,
    private now: () => number = () => Date.now(),
  ) {
    this.accumulated = initialMs;
  }
  get running(): boolean {
    return this.since !== null;
  }
  start(): void {
    if (this.since === null) this.since = this.now();
  }
  stop(): void {
    if (this.since !== null) {
      this.accumulated += Math.max(0, this.now() - this.since);
      this.since = null;
    }
  }
  elapsedMs(): number {
    return this.accumulated + (this.since !== null ? Math.max(0, this.now() - this.since) : 0);
  }
}
