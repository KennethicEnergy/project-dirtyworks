/**
 * Estimates the offset between local time and the table's server clock from timestamps carried
 * in state patches. Keeps the lowest observed delay (least queued sample) and relaxes slowly
 * toward newer delays so a changed network path is eventually adopted.
 */
const RELAX = 0.002;

export class ServerClock {
  private offset = 0;
  private seen = false;

  get ready(): boolean {
    return this.seen;
  }

  observe(serverMs: number, localMs: number): void {
    const sample = localMs - serverMs;
    if (!this.seen || sample < this.offset) {
      this.offset = sample;
      this.seen = true;
    } else {
      this.offset += (sample - this.offset) * RELAX;
    }
  }

  toServer(localMs: number): number {
    return localMs - this.offset;
  }
}
