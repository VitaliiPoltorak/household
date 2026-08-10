import { Module, DynamicModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';

/**
 * Registers the audit_log entity for TypeORM, exposes AuditService, and
 * installs the AuditInterceptor globally so any @Audit()-decorated route
 * writes a row on success. Call AuditModule.register() from your app module.
 */
@Module({})
export class AuditModule {
  static register(): DynamicModule {
    return {
      module: AuditModule,
      imports: [TypeOrmModule.forFeature([AuditLog])],
      providers: [
        AuditService,
        { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
      ],
      exports: [AuditService],
    };
  }
}
