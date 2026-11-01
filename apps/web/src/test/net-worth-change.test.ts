import { computeSnapshotChanges } from '../lib/net-worth-change';

const rows = [{ id: 'c' }, { id: 'b' }, { id: 'a' }]; // newest first

describe('computeSnapshotChanges (#406)', () => {
  it('compares each row with the chronologically previous one', () => {
    const out = computeSnapshotChanges(
      rows,
      new Map([
        ['a', 1000],
        ['b', 1100],
        ['c', 900],
      ]),
    );
    expect(out.get('b')).toMatchObject({ diff: 100, direction: 'up' });
    expect(out.get('b')!.pct).toBeCloseTo(10);
    expect(out.get('c')).toMatchObject({ diff: -200, direction: 'down' });
    expect(out.get('c')!.pct).toBeCloseTo(-18.18, 1);
  });

  it('first (oldest) row has no predecessor -> placeholder', () => {
    const out = computeSnapshotChanges(
      rows,
      new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]),
    );
    expect(out.get('a')).toBeNull();
  });

  it('zero change is flat', () => {
    const out = computeSnapshotChanges(
      rows,
      new Map([
        ['a', 5],
        ['b', 5],
        ['c', 5],
      ]),
    );
    expect(out.get('b')).toEqual({ diff: 0, pct: 0, direction: 'flat' });
  });

  it('missing value on either side -> placeholder, never a partial number', () => {
    const out = computeSnapshotChanges(
      rows,
      new Map([
        ['a', 1],
        ['b', null],
        ['c', 3],
      ]),
    );
    expect(out.get('b')).toBeNull();
    expect(out.get('c')).toBeNull();
  });

  it('previous value of 0 gives a diff but no percentage', () => {
    const out = computeSnapshotChanges(
      rows,
      new Map([
        ['a', 0],
        ['b', 50],
        ['c', 50],
      ]),
    );
    expect(out.get('b')).toMatchObject({
      diff: 50,
      pct: null,
      direction: 'up',
    });
  });
});
