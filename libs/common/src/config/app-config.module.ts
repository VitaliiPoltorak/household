import { Module, DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({})
export class AppConfigModule {
  static forRoot(): DynamicModule {
    return {
      module: AppConfigModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '../../.env',
        }),
      ],
      exports: [ConfigModule],
    };
  }
}
