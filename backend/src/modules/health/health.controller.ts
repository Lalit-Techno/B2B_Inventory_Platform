import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import type { Connection } from 'mongoose';
import { Public } from '../../common/rbac/authorize.decorator';

@ApiTags('health')
@Controller('healthz')
export class HealthController {
  constructor(@InjectConnection() private readonly db: Connection) {}

  @Public()
  @Get()
  async check() {
    let database: 'connected' | 'down' = 'connected';
    try {
      await this.db.db!.admin().ping();
    } catch {
      database = 'down';
    }
    return { api: 'ok', database };
  }
}
