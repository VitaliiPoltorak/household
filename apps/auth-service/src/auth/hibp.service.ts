import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

const DEFAULT_BASE_URL = 'https://api.pwnedpasswords.com/range';
const DEFAULT_TIMEOUT_MS = 500;

export interface HibpResult {
  breached: boolean;
  /** How many times this password appears in the HIBP corpus (0 when not breached). */
  count: number;
}

/**
 * Have-I-Been-Pwned Pwned Passwords API client, using the k-anonymity Range
 * endpoint (https://haveibeenpwned.com/API/v3#PwnedPasswords). We SHA-1 the
 * candidate password, send the first 5 hex chars, and receive up to ~800
 * suffix:count lines back. The plaintext never leaves this process.
 *
 * Policy (docs/security/password-policy.md §2): fail-open. If HIBP is
 * unreachable or times out, allow the registration and log the incident —
 * blocking signup on a third-party outage is a worse UX outcome than the
 * marginal risk of admitting a breached password for one session.
 *
 * HIBP is disabled entirely in tests (HIBP_ENABLED=false) so integration
 * suites don't hit the network. The unit spec covers the real client
 * behaviour against a mocked fetch.
 */
@Injectable()
export class HibpService {
  private readonly logger = new Logger(HibpService.name);
  private readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.enabled = config.get<string>('HIBP_ENABLED', 'true') !== 'false';
    this.baseUrl = config.get<string>('HIBP_BASE_URL', DEFAULT_BASE_URL);
    this.timeoutMs = Number(
      config.get<string>('HIBP_TIMEOUT_MS', String(DEFAULT_TIMEOUT_MS)),
    );
  }

  async check(plaintext: string): Promise<HibpResult> {
    if (!this.enabled) {
      return { breached: false, count: 0 };
    }

    const sha1 = createHash('sha1').update(plaintext).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(
          `HIBP returned HTTP ${res.status} — failing open (allowing registration)`,
        );
        return { breached: false, count: 0 };
      }
      const body = await res.text();
      const count = this.findSuffix(body, suffix);
      return { breached: count > 0, count };
    } catch (err) {
      // Timeout, DNS failure, network error, connection reset — all fail-open.
      // The security posture is: HIBP is a bonus check, not the primary
      // defence. Argon2 + zxcvbn + soft-lock are still in place.
      this.logger.warn(
        `HIBP check failed (${(err as Error).name}: ${(err as Error).message}) — failing open`,
      );
      return { breached: false, count: 0 };
    } finally {
      clearTimeout(timer);
    }
  }

  private findSuffix(body: string, wanted: string): number {
    // Response format: SUFFIX:COUNT\r\n repeated. Suffixes are uppercase hex.
    // Scanning line by line beats a full regex — Range responses can be ~30 KB.
    for (const line of body.split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon <= 0) continue;
      if (line.slice(0, colon).toUpperCase() === wanted) {
        return Number(line.slice(colon + 1));
      }
    }
    return 0;
  }
}
