import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  GOAL_SCOPES,
  goalSchema,
  GoalInput,
  kudosSchema,
  KudosInput,
  reviewCycleSchema,
  ReviewCycleInput,
  reviewInputSchema,
  ReviewInput,
  updateGoalSchema,
  UpdateGoalInput,
} from '@hrms/shared';
import { z } from 'zod';
import { AuditModule } from '../audit/audit.module';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EmployeesModule } from '../employees/employees.module';
import { PerformanceService } from './performance.service';

const goalsQuery = z.object({
  scope: z.enum(GOAL_SCOPES).optional(),
  ownerId: z.string().uuid().optional(),
});
const reviewsQuery = z.object({ cycleId: z.string().uuid().optional() });
const shareSchema = z.object({ finalRating: z.number().int().min(1).max(5) });

@Controller('performance')
class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Get('overview')
  overview() {
    return this.performance.overview();
  }

  @Get('goals')
  goals(@Query(new ZodPipe(goalsQuery)) q: z.infer<typeof goalsQuery>) {
    return this.performance.goals(q.scope, q.ownerId);
  }

  @Post('goals')
  createGoal(@Body(new ZodPipe(goalSchema)) body: GoalInput) {
    return this.performance.createGoal(body);
  }

  @Patch('goals/:id')
  updateGoal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateGoalSchema)) body: UpdateGoalInput,
  ) {
    return this.performance.updateGoal(id, body);
  }

  @Delete('goals/:id')
  @HttpCode(204)
  deleteGoal(@Param('id', ParseUUIDPipe) id: string) {
    return this.performance.deleteGoal(id);
  }

  @Get('cycles')
  cycles() {
    return this.performance.cycles();
  }

  @Post('cycles')
  @RequirePermissions('performance.manage')
  startCycle(@Body(new ZodPipe(reviewCycleSchema)) body: ReviewCycleInput) {
    return this.performance.startCycle(body);
  }

  @Post('cycles/:id/close')
  @RequirePermissions('performance.manage')
  @HttpCode(200)
  closeCycle(@Param('id', ParseUUIDPipe) id: string) {
    return this.performance.closeCycle(id);
  }

  @Get('reviews')
  reviews(@Query(new ZodPipe(reviewsQuery)) q: z.infer<typeof reviewsQuery>) {
    return this.performance.reviews(q.cycleId);
  }

  @Post('reviews/:id/self')
  @HttpCode(200)
  writeSelf(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reviewInputSchema)) body: ReviewInput,
  ) {
    return this.performance.writeSelf(id, body);
  }

  @Post('reviews/:id/manager')
  @HttpCode(200)
  writeManager(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reviewInputSchema)) body: ReviewInput,
  ) {
    return this.performance.writeManager(id, body);
  }

  @Post('reviews/:id/share')
  @RequirePermissions('performance.manage')
  @HttpCode(200)
  share(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(shareSchema)) body: z.infer<typeof shareSchema>,
  ) {
    return this.performance.share(id, body.finalRating);
  }

  @Get('kudos')
  kudos() {
    return this.performance.kudos();
  }

  @Post('kudos')
  giveKudos(@Body(new ZodPipe(kudosSchema)) body: KudosInput) {
    return this.performance.giveKudos(body);
  }
}

@Module({
  imports: [AuditModule, EmployeesModule],
  controllers: [PerformanceController],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
