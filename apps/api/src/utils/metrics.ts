/**
 * Lightweight in-memory metrics counter for single-process PakPrice API.
 * Provides operational visibility without external monitoring dependencies.
 */
export class ApiMetrics {
  private totalRequests = 0;
  private totalErrors = 0;
  private activeRequests = 0;
  private status2xx = 0;
  private status3xx = 0;
  private status4xx = 0;
  private status5xx = 0;
  private totalDurationMs = 0;
  private readonly startTime = Date.now();

  recordRequestStart(): void {
    this.totalRequests++;
    this.activeRequests++;
  }

  recordRequestEnd(statusCode: number, durationMs: number): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.totalDurationMs += durationMs;

    if (statusCode >= 500) {
      this.status5xx++;
      this.totalErrors++;
    } else if (statusCode >= 400) {
      this.status4xx++;
      this.totalErrors++;
    } else if (statusCode >= 300) {
      this.status3xx++;
    } else if (statusCode >= 200) {
      this.status2xx++;
    }
  }

  getSnapshot() {
    const avgDurationMs = this.totalRequests > 0
      ? Math.round(this.totalDurationMs / this.totalRequests)
      : 0;

    return {
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      totalRequests: this.totalRequests,
      activeRequests: this.activeRequests,
      totalErrors: this.totalErrors,
      requestsByStatus: {
        '2xx': this.status2xx,
        '3xx': this.status3xx,
        '4xx': this.status4xx,
        '5xx': this.status5xx,
      },
      avgDurationMs,
    };
  }

  reset(): void {
    this.totalRequests = 0;
    this.totalErrors = 0;
    this.activeRequests = 0;
    this.status2xx = 0;
    this.status3xx = 0;
    this.status4xx = 0;
    this.status5xx = 0;
    this.totalDurationMs = 0;
  }
}

export const apiMetrics = new ApiMetrics();
