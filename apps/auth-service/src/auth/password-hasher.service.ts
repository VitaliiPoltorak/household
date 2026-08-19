import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from '@node-rs/argon2';

interface Argon2Params {
  memoryCost: number; // KiB
  timeCost: number;   // iterations
  parallelism: number;
}

const ARGON2ID = 2;

/**
 * Password hashing on top of Argon2id via @node-rs/argon2 (Rust binding with
 * prebuilt binaries — no node-gyp toolchain needed on the build host).
 *
 * Argon2id is OWASP's first-choice password hash and the winner of the
 * Password Hashing Competition. It's memory-hard (unlike bcrypt/scrypt),
 * which makes GPU / FPGA / ASIC attacks substantially more expensive at
 * equivalent CPU cost. See docs/security/password-policy.md.
 *
 * Production defaults meet OWASP 2024 recommendations:
 *   memory: 19 MiB (19456 KiB)
 *   iterations: 2
 *   parallelism: 1
 *   hashLength: 32
 *   saltLength: 16 (default from the binding)
 *
 * Env overrides let integration tests drop cost so the suite doesn't spend
 * minutes hashing. Production values MUST NOT be set below the defaults —
 * this is validated at startup and refuses to boot on regression.
 */
@Injectable()
export class PasswordHasherService {
  private readonly logger = new Logger(PasswordHasherService.name);
  private readonly currentParams: Argon2Params;
  private readonly hashLength = 32;
  private readonly dummyHashPromise: Promise<string>;

  static readonly PROD_MIN: Argon2Params = {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  };

  constructor(config: ConfigService) {
    this.currentParams = {
      memoryCost: Number(
        config.get<string>('ARGON2_MEMORY_KIB', String(PasswordHasherService.PROD_MIN.memoryCost)),
      ),
      timeCost: Number(
        config.get<string>('ARGON2_ITERATIONS', String(PasswordHasherService.PROD_MIN.timeCost)),
      ),
      parallelism: Number(
        config.get<string>('ARGON2_PARALLELISM', String(PasswordHasherService.PROD_MIN.parallelism)),
      ),
    };
    this.assertParamsSaneOrThrow(this.currentParams, config);

    // Fire-and-remember: precomputing the dummy hash at boot means the very
    // first "user not found" login on a cold process doesn't pay a 20 ms
    // penalty over subsequent ones. Every compareDummy call awaits the same
    // promise.
    this.dummyHashPromise = this.rawHash('!never-a-real-password-shape!');
    this.logger.log(
      `Argon2id initialised (memory=${this.currentParams.memoryCost}KiB, iterations=${this.currentParams.timeCost}, parallelism=${this.currentParams.parallelism})`,
    );
  }

  hash(plaintext: string): Promise<string> {
    return this.rawHash(plaintext);
  }

  async compare(plaintext: string, storedHash: string): Promise<boolean> {
    try {
      return await verify(storedHash, plaintext);
    } catch (err) {
      // Malformed hash on disk shouldn't crash a login endpoint — treat it
      // as "wrong credentials" and log for follow-up.
      this.logger.warn(
        `verify() rejected the stored hash: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Same shape as compare() but pointed at a hash that no real password
   * will ever match. Used on the "user not found" / "OAuth-only account"
   * branches of login so the response latency doesn't leak account
   * existence via timing.
   */
  async compareDummy(plaintext: string): Promise<void> {
    const dummy = await this.dummyHashPromise;
    await verify(dummy, plaintext).catch(() => false);
  }

  /**
   * True when the stored hash was produced with parameters weaker than what
   * we run today (or with a different algorithm/version). Callers should
   * rehash on next successful login so users migrate to stronger parameters
   * over time — this is why the policy doc mandates Argon2's needsRehash
   * behaviour even though the crate doesn't ship a helper.
   */
  needsRehash(storedHash: string): boolean {
    const parsed = this.parseArgon2Hash(storedHash);
    if (!parsed) {
      // Unparseable hash → we can't be sure it's current. Rehash to be safe.
      return true;
    }
    if (parsed.algorithm !== 'argon2id') return true;
    if (parsed.memoryCost < this.currentParams.memoryCost) return true;
    if (parsed.timeCost < this.currentParams.timeCost) return true;
    if (parsed.parallelism < this.currentParams.parallelism) return true;
    return false;
  }

  private rawHash(plaintext: string): Promise<string> {
    return hash(plaintext, {
      algorithm: ARGON2ID,
      memoryCost: this.currentParams.memoryCost,
      timeCost: this.currentParams.timeCost,
      parallelism: this.currentParams.parallelism,
      outputLen: this.hashLength,
    });
  }

  private parseArgon2Hash(
    raw: string,
  ): (Argon2Params & { algorithm: string }) | null {
    // Format: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
    const match = /^\$argon2(id|i|d)\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$/i.exec(raw);
    if (!match) return null;
    return {
      algorithm: `argon2${match[1].toLowerCase()}`,
      memoryCost: Number(match[3]),
      timeCost: Number(match[4]),
      parallelism: Number(match[5]),
    };
  }

  private assertParamsSaneOrThrow(params: Argon2Params, config: ConfigService): void {
    const nodeEnv = (config.get<string>('NODE_ENV') || '').toLowerCase();
    const isProdLike = nodeEnv === 'production' || nodeEnv === 'staging';

    // Anything under the OWASP baseline is a footgun. Test envs are allowed
    // to drop below (jest.env.js sets small values) but production must not.
    if (isProdLike) {
      const min = PasswordHasherService.PROD_MIN;
      if (
        params.memoryCost < min.memoryCost ||
        params.timeCost < min.timeCost ||
        params.parallelism < min.parallelism
      ) {
        throw new Error(
          `Argon2 params below OWASP baseline in ${nodeEnv} (got m=${params.memoryCost},t=${params.timeCost},p=${params.parallelism}; need ≥ m=${min.memoryCost},t=${min.timeCost},p=${min.parallelism}). Refusing to start.`,
        );
      }
    }

    // Even in test, values must be positive integers.
    if (
      !Number.isInteger(params.memoryCost) || params.memoryCost < 8 ||
      !Number.isInteger(params.timeCost) || params.timeCost < 1 ||
      !Number.isInteger(params.parallelism) || params.parallelism < 1
    ) {
      throw new Error(
        `Invalid Argon2 params (m=${params.memoryCost},t=${params.timeCost},p=${params.parallelism}). All values must be positive integers.`,
      );
    }
  }
}
