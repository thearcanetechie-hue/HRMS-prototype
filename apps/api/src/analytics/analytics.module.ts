import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  askReportSchema,
  REPORT_KEYS,
  reportQuerySchema,
  ReportRange,
  savedReportSchema,
  SavedReportInput,
} from '@hrms/shared';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EmployeesModule } from '../employees/employees.module';
import { AnalyticsService } from './analytics.service';

const keyParam = z.enum(REPORT_KEYS);

/** Company-wide reports. Payroll cost additionally needs payroll.manage (checked in the service). */
@Controller('analytics')
@RequirePermissions('analytics.read')
class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('reports')
  catalog() {
    return { keys: this.analytics.catalog() };
  }

  @Get('reports/:key')
  report(
    @Param('key', new ZodPipe(keyParam)) key: z.infer<typeof keyParam>,
    @Query(new ZodPipe(reportQuerySchema)) q: { range: ReportRange },
  ) {
    return this.analytics.report(key, q.range);
  }

  @Post('ask')
  @HttpCode(200)
  ask(@Body(new ZodPipe(askReportSchema)) body: z.infer<typeof askReportSchema>) {
    return this.analytics.ask(body.question, body.range);
  }

  @Get('saved')
  saved() {
    return this.analytics.saved();
  }

  @Post('saved')
  save(@Body(new ZodPipe(savedReportSchema)) body: SavedReportInput) {
    return this.analytics.save(body);
  }

  @Delete('saved/:id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.analytics.remove(id);
  }
}

@Module({
  imports: [EmployeesModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
