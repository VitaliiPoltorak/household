import { ConflictException } from '@nestjs/common';

/**
 * A withdrawal was refused because it would drive an account below zero and
 * that account does not allow a negative balance (#326).
 *
 * 409 rather than 400: the request is well-formed and would have been valid a
 * moment earlier — it conflicts with the account's current state. This matches
 * the existing precedent for a state conflict in this service (category
 * permanent-delete, which returns 409 with an `impact` payload).
 *
 * The extra keys survive to the client untouched: HttpExceptionFilter copies
 * every field other than message/error/statusCode onto the response body. The
 * web client branches on `code` and renders `available` against the amount
 * field, so it can say how much there actually is rather than only that the
 * write failed.
 */
export class InsufficientFundsException extends ConflictException {
  constructor(params: {
    accountId: string;
    accountName: string;
    available: number;
    requested: number;
    currency: string;
  }) {
    super({
      code: 'INSUFFICIENT_FUNDS',
      message:
        `"${params.accountName}" holds ${params.available} ${params.currency}, ` +
        `which does not cover a withdrawal of ${params.requested} ${params.currency}. ` +
        `Allow a negative balance on this account if it is meant to go overdrawn.`,
      accountId: params.accountId,
      available: params.available,
      requested: params.requested,
      currency: params.currency,
    });
  }
}
