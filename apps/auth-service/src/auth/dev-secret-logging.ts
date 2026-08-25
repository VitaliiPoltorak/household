import { ConfigService } from '@nestjs/config';

/**
 * Bootstrap-time helper — mirrors requireSigningSecret()/requireStrongJwtSecret()
 * in libs/common. AUTH_DEV_LOG_SECRETS logs plaintext verification codes and
 * unlock tokens (see shouldLogDevSecrets); refuse to start rather than let
 * that flag reach a production deploy.
 */
export function requireNoDevSecretLoggingInProduction(
  config: ConfigService,
): void {
  if (config.get<string>('NODE_ENV') !== 'production') return;
  if (shouldLogDevSecrets(config)) {
    throw new Error(
      'AUTH_DEV_LOG_SECRETS must not be enabled in production (NODE_ENV=production) — it logs verification codes and unlock tokens. Refusing to start.',
    );
  }
}

export function shouldLogDevSecrets(config: ConfigService): boolean {
  return config.get<string>('AUTH_DEV_LOG_SECRETS', 'false') === 'true';
}
