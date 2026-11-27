import { msUntilNextRun } from './subscription-jobs.service';

const MIN = 60_000;

describe('msUntilNextRun (00:05 IST)', () => {
  it('waits until tomorrow 00:05 IST when it is already past', () => {
    // 2026-11-27 18:36 UTC = 00:06 IST on the 28th -> next run 00:05 IST on the 29th
    expect(msUntilNextRun(new Date('2026-11-27T18:36:00Z'))).toBe(
      24 * 60 * MIN - MIN,
    );
  });
  it('runs later today when 00:05 IST has not come yet', () => {
    // 18:34 UTC = 00:04 IST
    expect(msUntilNextRun(new Date('2026-11-27T18:34:00Z'))).toBe(MIN);
    // 06:00 UTC = 11:30 IST -> 12h35m
    expect(msUntilNextRun(new Date('2026-11-27T06:00:00Z'))).toBe(
      (12 * 60 + 35) * MIN,
    );
  });
});
