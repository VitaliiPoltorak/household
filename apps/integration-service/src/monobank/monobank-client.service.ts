import {
  BadGatewayException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MonobankAccount {
  id: string;
  balance: number; // kopecks
  currencyCode: number; // ISO 4217 numeric
  type: string; // black | white | fop | yellow | platinum | iron
  maskedPan: string[];
  iban: string;
}

export interface MonobankClientInfo {
  clientId: string;
  name: string;
  accounts: MonobankAccount[];
}

export interface MonobankStatementItem {
  id: string;
  time: number; // unix seconds
  description: string;
  mcc: number;
  amount: number; // kopecks, negative = expense
  operationAmount: number;
  currencyCode: number;
  balance: number;
  comment?: string;
}

const DEFAULT_BASE_URL = 'https://api.monobank.ua';

/**
 * Thin wrapper over the Monobank Personal API. Callers are responsible for
 * honouring the 1-request/60s-per-token limit on the statement endpoint —
 * this class only translates HTTP responses into typed results/exceptions.
 */
@Injectable()
export class MonobankClientService {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>(
      'MONOBANK_API_BASE_URL',
      DEFAULT_BASE_URL,
    );
  }

  async getClientInfo(token: string): Promise<MonobankClientInfo> {
    const res = await this.request('/personal/client-info', token);
    return res.json() as Promise<MonobankClientInfo>;
  }

  /**
   * Monobank allows at most 31 days + 1 hour per statement request.
   * `fromSeconds`/`toSeconds` are unix seconds; `toSeconds` defaults to now.
   */
  async getStatement(
    token: string,
    account: string,
    fromSeconds: number,
    toSeconds?: number,
  ): Promise<MonobankStatementItem[]> {
    const path = toSeconds
      ? `/personal/statement/${account}/${fromSeconds}/${toSeconds}`
      : `/personal/statement/${account}/${fromSeconds}`;
    const res = await this.request(path, token);
    return res.json() as Promise<MonobankStatementItem[]>;
  }

  private async request(path: string, token: string): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        headers: { 'X-Token': token },
      });
    } catch {
      throw new BadGatewayException('Could not reach Monobank');
    }

    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedException('Invalid or revoked Monobank token');
    }
    if (res.status === 429) {
      throw new BadGatewayException(
        'Monobank rate limit exceeded (1 request/60s per token) — retry shortly',
      );
    }
    if (!res.ok) {
      throw new BadGatewayException(`Monobank request failed (${res.status})`);
    }
    return res;
  }
}
