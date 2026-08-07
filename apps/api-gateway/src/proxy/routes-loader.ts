import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import defaultRoutes from './routes.default.json';

export interface ProxyRoute {
  prefix: string;
  envKey: string;
  defaultUrl: string;
  rewrites: Record<string, string>;
}

/**
 * Precedence: PROXY_ROUTES_JSON (inline) > PROXY_ROUTES_PATH (file) > bundled
 * default. Inline env wins so a deployment can override without rebuilding
 * the image; the file path is convenient for k8s configmap mounts; the
 * bundled default keeps dev zero-config.
 */
export function loadProxyRoutes(config: ConfigService): ProxyRoute[] {
  const inline = config.get<string>('PROXY_ROUTES_JSON');
  if (inline) return parseAndValidate(inline, 'PROXY_ROUTES_JSON');

  const filePath = config.get<string>('PROXY_ROUTES_PATH');
  if (filePath) {
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      throw new Error(
        `Failed to read PROXY_ROUTES_PATH=${filePath}: ${(err as Error).message}`,
      );
    }
    return parseAndValidate(raw, filePath);
  }

  return validate(defaultRoutes as unknown, 'routes.default.json');
}

function parseAndValidate(raw: string, source: string): ProxyRoute[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${source}: invalid JSON — ${(err as Error).message}`);
  }
  return validate(parsed, source);
}

function validate(value: unknown, source: string): ProxyRoute[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${source}: expected a non-empty array of proxy routes`);
  }
  const seenPrefixes = new Set<string>();
  value.forEach((route, i) => {
    const r = route as Partial<ProxyRoute>;
    if (typeof r.prefix !== 'string' || !r.prefix) {
      throw new Error(`${source}: route[${i}] missing string 'prefix'`);
    }
    if (typeof r.envKey !== 'string' || !r.envKey) {
      throw new Error(`${source}: route[${i}] missing string 'envKey'`);
    }
    if (typeof r.defaultUrl !== 'string' || !r.defaultUrl) {
      throw new Error(`${source}: route[${i}] missing string 'defaultUrl'`);
    }
    if (r.rewrites === null || typeof r.rewrites !== 'object' || Array.isArray(r.rewrites)) {
      throw new Error(`${source}: route[${i}] missing object 'rewrites'`);
    }
    if (seenPrefixes.has(r.prefix)) {
      throw new Error(`${source}: duplicate prefix '${r.prefix}' at route[${i}]`);
    }
    seenPrefixes.add(r.prefix);
  });
  return value as ProxyRoute[];
}
