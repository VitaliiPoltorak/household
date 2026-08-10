import { AuditService } from '../src/audit.service';

/**
 * The service is intentionally forgiving — audit must never break a business
 * action. These tests pin down the two subtle behaviours: metadata truncation
 * for oversized payloads and error swallowing when the DB write fails.
 */
describe('AuditService', () => {
  const makeRepo = () => ({
    create: jest.fn((o: unknown) => o),
    save: jest.fn().mockResolvedValue(undefined),
  });

  it('persists an audit row with the provided fields', async () => {
    const repo = makeRepo();
    const svc = new AuditService(repo as never);

    await svc.record({
      actorUserId: 'u1',
      householdId: 'h1',
      action: 'test.action',
      resourceType: 'thing',
      resourceId: 't1',
      metadata: { k: 'v' },
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'u1',
        householdId: 'h1',
        action: 'test.action',
        resourceType: 'thing',
        resourceId: 't1',
        metadata: { k: 'v' },
      }),
    );
  });

  it('truncates metadata larger than 8 KiB and marks it as truncated', async () => {
    const repo = makeRepo();
    const svc = new AuditService(repo as never);
    const big = { blob: 'x'.repeat(10 * 1024) };

    await svc.record({ action: 'test.big', metadata: big });

    const saved = repo.save.mock.calls[0][0] as { metadata: unknown };
    expect(saved.metadata).toEqual(
      expect.objectContaining({ _truncated: true }),
    );
  });

  it('swallows persistence errors so the business action keeps working', async () => {
    const repo = makeRepo();
    repo.save.mockRejectedValueOnce(new Error('DB down'));
    const svc = new AuditService(repo as never);

    await expect(svc.record({ action: 'test.oops' })).resolves.toBeUndefined();
  });
});
