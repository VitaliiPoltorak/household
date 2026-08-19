import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as en from '@zxcvbn-ts/language-en';

export interface ComplexityResult {
  score: 0 | 1 | 2 | 3 | 4;
  ok: boolean;
  warning?: string;
  suggestions: string[];
}

/**
 * Strength check on top of @zxcvbn-ts/core. zxcvbn measures actual guess
 * resistance (dictionary matches, keyboard walks, common substitutions, name
 * patterns) rather than character-class arithmetic, which per NIST SP
 * 800-63B §5.1.1.2 (2017) is the correct posture — char-class rules push
 * users toward "P@ssw0rd1" and are counter-recommended.
 *
 * Threshold is 3 out of 4 ("safely unguessable — moderate protection from
 * offline slow-hash scenario"). English dictionaries only for now; the
 * user's own displayName / email should be passed via `userInputs` so
 * `alice@example.com` with password `alice` scores 0 rather than 2.
 *
 * Configurable min score via ZXCVBN_MIN_SCORE for future policy tuning.
 */
@Injectable()
export class PasswordComplexityService {
  private readonly logger = new Logger(PasswordComplexityService.name);
  private readonly zxcvbn: ZxcvbnFactory;
  private readonly minScore: 0 | 1 | 2 | 3 | 4;

  constructor(config: ConfigService) {
    this.zxcvbn = new ZxcvbnFactory({
      translations: en.translations,
      graphs: common.adjacencyGraphs,
      dictionary: { ...common.dictionary, ...en.dictionary },
    });
    const raw = Number(config.get<string>('ZXCVBN_MIN_SCORE', '3'));
    if (!Number.isInteger(raw) || raw < 0 || raw > 4) {
      throw new Error(
        `ZXCVBN_MIN_SCORE must be an integer 0..4 (got ${config.get('ZXCVBN_MIN_SCORE')}).`,
      );
    }
    this.minScore = raw as 0 | 1 | 2 | 3 | 4;
  }

  check(password: string, userInputs: string[] = []): ComplexityResult {
    // userInputs primes zxcvbn's dictionary — passwords derived from the
    // user's own email / displayName score much lower this way. Filter empty
    // strings so undefined fields don't seed noise.
    const inputs = userInputs.filter((v): v is string => typeof v === 'string' && v.length > 0);
    const result = this.zxcvbn.check(password, inputs);
    const score = result.score as 0 | 1 | 2 | 3 | 4;
    const ok = score >= this.minScore;

    return {
      score,
      ok,
      warning: result.feedback?.warning ?? undefined,
      suggestions: result.feedback?.suggestions ?? [],
    };
  }
}
