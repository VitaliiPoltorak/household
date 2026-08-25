import { lookup } from 'dns/promises';
import { BadRequestException } from '@nestjs/common';

// Any service that fetches a user-supplied URL server-side (e.g. link
// preview metadata) needs this — default-deny for anything that isn't a
// resolvable public address, same "new cross-origin surface defaults to
// deny" principle applied elsewhere (CORS, Socket.IO, bind address).

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)
  ) {
    return true; // malformed — fail closed
  }
  const [a, b] = parts;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local — includes the AWS/GCP/Azure metadata IP 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true; // loopback / unspecified
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // fc00::/7 unique local
  const firstHextet = parseInt(normalized.split(':')[0] || '', 16);
  if (
    !Number.isNaN(firstHextet) &&
    firstHextet >= 0xfe80 &&
    firstHextet <= 0xfebf
  )
    return true; // fe80::/10 link-local
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateOrReservedIpv4(mapped[1]);
  return false;
}

function isPrivateOrReservedIp(ip: string, family: number): boolean {
  return family === 6
    ? isPrivateOrReservedIpv6(ip)
    : isPrivateOrReservedIpv4(ip);
}

const BLOCKED_HOSTNAMES = new Set(['localhost']);

/**
 * Throws BadRequestException unless `rawUrl` is http(s) and resolves only to
 * public IP addresses. Call this before any server-side fetch of a
 * user-supplied URL. Resolves at call time (not cached) since DNS can change
 * between requests — TOCTOU against the actual fetch is a known residual
 * risk (DNS rebinding), acceptable here since the fetch itself has a short
 * timeout and the response body is never proxied back to the client raw.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('URL must use http or https');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new BadRequestException('URL host is not allowed');
  }

  let resolved: { address: string; family: number }[];
  try {
    resolved = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    // Can't verify where this actually points — fail closed rather than
    // fetch blind (distinct from "resolved fine but the fetch itself later
    // times out", which is a non-fatal, soft failure elsewhere).
    throw new BadRequestException('Could not resolve URL host');
  }

  if (
    resolved.length === 0 ||
    resolved.some((r) => isPrivateOrReservedIp(r.address, r.family))
  ) {
    throw new BadRequestException('URL resolves to a disallowed address');
  }
}
