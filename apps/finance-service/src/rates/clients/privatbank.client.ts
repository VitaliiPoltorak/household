import { Injectable, Logger } from '@nestjs/common';

export interface PrivatBankRate {
  ccy: string;
  base_ccy: string;
  buy: string;
  sale: string;
}

const PRIVATBANK_URL = 'https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=5';

@Injectable()
export class PrivatBankClient {
  private readonly logger = new Logger(PrivatBankClient.name);

  async fetchRates(): Promise<PrivatBankRate[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(PRIVATBANK_URL, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`PrivatBank HTTP ${res.status}`);
      }
      const data = (await res.json()) as PrivatBankRate[];
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('PrivatBank returned empty rates array');
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }
}
