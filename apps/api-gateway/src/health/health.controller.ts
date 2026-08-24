import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../decorators/public.decorator';

// SkipThrottle is required, not cosmetic: ThrottlerBehindProxyGuard is a
// global APP_GUARD, so without this every hit here (including Docker's own
// healthcheck probe, #205) counts against the same client's general rate
// budget. Under real traffic — or just a busy dev session hitting the
// gateway a lot — that budget can run out, which then makes the health
// endpoint itself start returning 429 and the container gets marked
// unhealthy even though the app is completely fine. An orchestration signal
// must never be subject to the same limits as application traffic.
@ApiTags('System')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'api-gateway',
    };
  }
}
