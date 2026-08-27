import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  computeSignature,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from '@household/common';

export interface CreateFinanceTransactionPayload {
  accountId: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  categoryId?: string;
  description?: string;
  date: string;
  externalId: string;
}

/**
 * Calls finance-service's POST /transactions directly — not through the
 * public gateway, but signed with the same GATEWAY_SIGNING_SECRET/
 * computeSignature the gateway's proxy uses. finance-service's trust-header
 * middleware can't tell the difference between "the gateway signed this"
 * and "another internal service signed this with the shared secret", which
 * is the point: this is the same trust boundary, just a second caller,
 * rather than a new ad-hoc integration pattern.
 */
@Injectable()
export class FinanceClientService {
  constructor(private readonly config: ConfigService) {}

  async createTransaction(
    context: { userId: string; householdId: string },
    payload: CreateFinanceTransactionPayload,
  ): Promise<{ id: string }> {
    const baseUrl = this.config.get<string>(
      'FINANCE_SERVICE_URL',
      'http://localhost:3003',
    );
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-User-Id': context.userId,
      'X-Household-Id': context.householdId,
    };

    const secret = this.config.get<string>('GATEWAY_SIGNING_SECRET');
    if (secret) {
      const timestamp = Date.now().toString();
      headers[SIGNATURE_HEADER] = computeSignature(
        { userId: context.userId, householdId: context.householdId },
        timestamp,
        secret,
      );
      headers[TIMESTAMP_HEADER] = timestamp;
    }

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    } catch {
      throw new BadGatewayException('Could not reach finance-service');
    }

    if (res.status >= 400 && res.status < 500) {
      const body = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new BadRequestException(
        body?.message ?? `finance-service rejected the request (${res.status})`,
      );
    }
    if (!res.ok) {
      throw new BadGatewayException(
        `finance-service is unavailable (${res.status})`,
      );
    }
    return res.json() as Promise<{ id: string }>;
  }
}
