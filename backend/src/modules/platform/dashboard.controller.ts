import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Authorize } from '../../common/rbac/authorize.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('platform')
@Controller('super/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Authorize('PLT-11')
  @Get()
  summary() {
    return this.dashboard.summary();
  }
}
