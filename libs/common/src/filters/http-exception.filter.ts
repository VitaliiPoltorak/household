import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const raw =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message =
      typeof raw === 'string'
        ? raw
        : (raw as Record<string, unknown> | null)?.message ?? 'Internal server error';

    const error =
      exception instanceof HttpException
        ? (HttpStatus[status] ?? 'Error').replace(/_/g, ' ')
        : 'Internal Server Error';

    // Preserve any extra keys the thrower attached to the exception body
    // (e.g., `impact` on a 409 from category permanent-delete). Excludes
    // fields we set explicitly to avoid double-writing them.
    const extra: Record<string, unknown> = {};
    if (raw && typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (key === 'message' || key === 'error' || key === 'statusCode') continue;
        extra[key] = value;
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      ...extra,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
