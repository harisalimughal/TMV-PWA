/**
 * Per-phase latency breakdown for a single Chat request.
 *
 * Produces the log line the spec asks for:
 *   { t_auth_ms: 30, t_job_lookup_ms: 100, t_validate_ms: 5, t_enqueue_ms: 80, total_ms: 260 }
 *
 * Safe under concurrency (one instance per request), unlike console.time().
 */
export class PhaseTimer {
  private readonly start = Date.now();
  private last = this.start;
  private readonly phases: Array<[string, number]> = [];

  /** Records elapsed time since the previous mark. */
  mark(phase: string): void {
    const now = Date.now();
    this.phases.push([phase, now - this.last]);
    this.last = now;
  }

  /** Times one awaited step and marks it automatically. */
  async measure<T>(phase: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } finally {
      this.mark(phase);
    }
  }

  get totalMs(): number {
    return Date.now() - this.start;
  }

  /** Flattens into log fields. Never contains credentials or payload data. */
  fields(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [phase, ms] of this.phases) out[`t_${phase}_ms`] = ms;
    out.total_ms = this.totalMs;
    return out;
  }
}
