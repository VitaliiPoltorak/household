import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { financeApi, type ExchangeRate } from '../api/finance';

// ──────────────────────────────────────────────
// Shared multi-currency conversion primitives (#80, #160).
//
// Extracted from AccountsPage so DashboardPage — and any future page that
// aggregates money across currencies — can share the exact same behaviour:
// discrete rate-availability state, last-known-good cache with a 7-day cap,
// and a `convert()` that refuses to lie when a required rate is missing.
// ──────────────────────────────────────────────

export const BASE_CURRENCY_KEY = 'accounts:baseCurrency';
export const RATES_CACHE_KEY = 'accounts:ratesCache';
// Cache stays usable for a week — beyond that we prefer "unavailable" to
// showing week-old totals. Rates rarely move enough that day-old cache is
// harmful, but a month-old cache is misleading.
export const RATES_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ──────────────────────────────────────────────
// Exchange rates (proxied through finance-service, which pulls from PrivatBank
// daily and stores each snapshot in exchange_rates for future dynamics).
// ──────────────────────────────────────────────
// Same field names as the raw PrivatBank payload — the backend stores them
// verbatim so the client-side math didn't need to change.
type PBRate = Pick<ExchangeRate, 'ccy' | 'base_ccy' | 'buy' | 'sale'>;

export type RateMap = Record<string, number>;

// Discrete state so the render side never has to guess whether a missing rate
// means "we didn't need one" (all accounts in base) or "rates broke and the
// total is bogus". The old ?? 1 fallback conflated these — a $100 balance
// showed as ₴100 when PrivatBank was down.
export type RatesState =
  | { status: 'not-needed' }
  | { status: 'loading' }
  | { status: 'ready'; rates: RateMap; source: 'live' | 'cache'; at: Date }
  | { status: 'failed' };

interface CachedRates {
  rates: RateMap;
  at: number;
}

function readRatesCache(): CachedRates | null {
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRates;
    if (!parsed?.rates || !parsed.at) return null;
    if (Date.now() - parsed.at > RATES_CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRatesCache(rates: RateMap): void {
  try {
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ rates, at: Date.now() }));
  } catch {
    // localStorage full / disabled — cache is best-effort, don't crash render.
  }
}

function ratesFromPB(pb: PBRate[]): RateMap {
  const rates: RateMap = { UAH: 1 };
  for (const r of pb) {
    const n = parseFloat(r.buy);
    if (Number.isFinite(n) && n > 0) rates[r.ccy] = n;
  }
  return rates;
}

export function useRatesState(needed: boolean): RatesState {
  const { data: pbRates, isLoading, isError, isFetched } = useQuery<PBRate[]>({
    queryKey: ['exchange-rates'],
    // finance-service proxies + persists PrivatBank; no third-party CORS
    // concern from the browser, and rows are preserved for /rates/history.
    queryFn: () => financeApi.getLatestRates(),
    enabled: needed,
    staleTime: 30 * 60 * 1000, // 30 min
    retry: 1,
  });

  // Persist last-known-good so a brief outage doesn't blank the total.
  useEffect(() => {
    if (pbRates && pbRates.length > 0) {
      writeRatesCache(ratesFromPB(pbRates));
    }
  }, [pbRates]);

  if (!needed) return { status: 'not-needed' };

  if (pbRates && pbRates.length > 0) {
    return { status: 'ready', rates: ratesFromPB(pbRates), source: 'live', at: new Date() };
  }

  // No live data yet. Two sub-cases:
  //   1. Still loading → 'loading'
  //   2. Fetched but empty / error → fall back to cache, else 'failed'
  if (isLoading && !isFetched) return { status: 'loading' };

  if (isError || (isFetched && (!pbRates || pbRates.length === 0))) {
    const cached = readRatesCache();
    if (cached) {
      return { status: 'ready', rates: cached.rates, source: 'cache', at: new Date(cached.at) };
    }
    return { status: 'failed' };
  }

  return { status: 'loading' };
}

// Convert amount in fromCcy to toCcy using UAH-based rate map. Returns null
// if any required currency is missing — caller MUST check and refuse to show
// a total in that case, rather than falling back to a silent 1:1 substitution.
export function convert(amount: number, fromCcy: string, toCcy: string, rates: RateMap): number | null {
  if (fromCcy === toCcy) return amount;
  const fromRate = fromCcy === 'UAH' ? 1 : rates[fromCcy];
  const toRate = toCcy === 'UAH' ? 1 : rates[toCcy];
  if (!fromRate || !toRate) return null;
  const fromUAH = amount * fromRate;
  return fromUAH / toRate;
}
