import { FeatureFlagService } from '../src/feature-flag.service';
import { FeatureFlagClientService } from '../src/feature-flag-client.service';

/**
 * Resolution order (user -> household -> default -> registry fallback) and
 * the cache-miss/populate path are the two things most likely to silently
 * regress, so both are pinned down here. See the feature-flags skill for the
 * design this implements.
 */
describe('FeatureFlagService', () => {
  const FLAG = 'monobank-integration'; // registered in libs/contracts registry with enabledDefault: true

  function makeRedis(store: Record<string, string> = {}) {
    const pipelineOps: Array<[string, string]> = [];
    return {
      store,
      mget: jest.fn((...keys: string[]) =>
        Promise.resolve(keys.map((k) => store[k] ?? null)),
      ),
      pipeline: jest.fn(() => ({
        set: jest.fn((key: string, value: string) => {
          pipelineOps.push([key, value]);
          store[key] = value;
        }),
        exec: jest.fn().mockResolvedValue(undefined),
      })),
      pipelineOps,
    };
  }

  function makeClient(response: unknown, shouldFail = false) {
    return {
      fetchState: jest.fn(() =>
        shouldFail
          ? Promise.reject(new Error('unreachable'))
          : Promise.resolve(response),
      ),
    } as unknown as FeatureFlagClientService;
  }

  it('resolves the global default when nothing is cached and no actor is given', async () => {
    const redis = makeRedis();
    const client = makeClient({
      default: true,
      household: 'none',
      user: 'none',
    });
    const svc = new FeatureFlagService(redis as never, client);

    const result = await svc.isEnabled(FLAG);

    expect(result).toBe(true);
    expect(client.fetchState).toHaveBeenCalledWith(FLAG, {});
    expect(redis.store[`flag:${FLAG}:default`]).toBe('1');
  });

  it('serves straight from cache without calling household-service on a full hit', async () => {
    const redis = makeRedis({
      [`flag:${FLAG}:default`]: '1',
      [`flag:${FLAG}:household:h1`]: 'none',
      [`flag:${FLAG}:user:u1`]: 'none',
    });
    const client = makeClient(null);
    const svc = new FeatureFlagService(redis as never, client);

    const result = await svc.isEnabled(FLAG, {
      userId: 'u1',
      householdId: 'h1',
    });

    expect(result).toBe(true);
    expect(client.fetchState).not.toHaveBeenCalled();
  });

  it('a user override wins over a household override and the default', async () => {
    const redis = makeRedis({
      [`flag:${FLAG}:default`]: '1',
      [`flag:${FLAG}:household:h1`]: '1',
      [`flag:${FLAG}:user:u1`]: '0',
    });
    const client = makeClient(null);
    const svc = new FeatureFlagService(redis as never, client);

    const result = await svc.isEnabled(FLAG, {
      userId: 'u1',
      householdId: 'h1',
    });

    expect(result).toBe(false);
  });

  it('a household override wins over the default when the user has none', async () => {
    const redis = makeRedis({
      [`flag:${FLAG}:default`]: '1',
      [`flag:${FLAG}:household:h1`]: '0',
      [`flag:${FLAG}:user:u1`]: 'none',
    });
    const client = makeClient(null);
    const svc = new FeatureFlagService(redis as never, client);

    const result = await svc.isEnabled(FLAG, {
      userId: 'u1',
      householdId: 'h1',
    });

    expect(result).toBe(false);
  });

  it('fetches and populates the cache on a partial miss (household key uncached)', async () => {
    const redis = makeRedis({
      [`flag:${FLAG}:default`]: '1',
    });
    const client = makeClient({
      default: true,
      household: false,
      user: 'none',
    });
    const svc = new FeatureFlagService(redis as never, client);

    const result = await svc.isEnabled(FLAG, { householdId: 'h1' });

    expect(result).toBe(false);
    expect(client.fetchState).toHaveBeenCalledWith(FLAG, { householdId: 'h1' });
    expect(redis.store[`flag:${FLAG}:household:h1`]).toBe('0');
  });

  it('falls back to the registry default when household-service is unreachable', async () => {
    const redis = makeRedis();
    const client = makeClient(null, true);
    const svc = new FeatureFlagService(redis as never, client);

    const result = await svc.isEnabled(FLAG, { householdId: 'h1' });

    // registry default for 'monobank-integration' is enabledDefault: true
    expect(result).toBe(true);
  });
});
