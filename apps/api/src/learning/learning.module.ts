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
} from '@nestjs/common';
import {
  courseSchema,
  CourseInput,
  courseSessionSchema,
  CourseSessionInput,
  enrollSchema,
  progressSchema,
  updateCourseSchema,
  UpdateCourseInput,
} from '@hrms/shared';
import { z } from 'zod';
import { AuditModule } from '../audit/audit.module';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EmployeesModule } from '../employees/employees.module';
import { LearningService } from './learning.service';

@Controller('learning')
class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('overview')
  overview() {
    return this.learning.overview();
  }

  @Get('employees/:id')
  forEmployee(@Param('id', ParseUUIDPipe) id: string) {
    return this.learning.forEmployee(id);
  }

  @Post('courses')
  @RequirePermissions('learning.manage')
  create(@Body(new ZodPipe(courseSchema)) body: CourseInput) {
    return this.learning.createCourse(body);
  }

  @Patch('courses/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateCourseSchema)) body: UpdateCourseInput,
  ) {
    return this.learning.updateCourse(id, body);
  }

  @Delete('courses/:id')
  @RequirePermissions('learning.manage')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.learning.deleteCourse(id);
  }

  @Get('courses/:id/learners')
  learners(@Param('id', ParseUUIDPipe) id: string) {
    return this.learning.learners(id);
  }

  @Post('courses/:id/sessions')
  addSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(courseSessionSchema)) body: CourseSessionInput,
  ) {
    return this.learning.addSession(id, body);
  }

  @Delete('courses/:id/sessions/:sessionId')
  @HttpCode(204)
  deleteSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.learning.deleteSession(id, sessionId);
  }

  @Post('courses/:id/enrol')
  @HttpCode(200)
  enrol(@Param('id', ParseUUIDPipe) id: string) {
    return this.learning.enrolSelf(id);
  }

  @Delete('courses/:id/enrol')
  @HttpCode(204)
  leave(@Param('id', ParseUUIDPipe) id: string) {
    return this.learning.leave(id);
  }

  @Post('courses/:id/assign')
  @HttpCode(200)
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(enrollSchema)) body: z.infer<typeof enrollSchema>,
  ) {
    return this.learning.assign(id, body.employeeIds);
  }

  @Patch('enrolments/:id')
  progress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(progressSchema)) body: z.infer<typeof progressSchema>,
  ) {
    return this.learning.setProgress(id, body.progress);
  }
}

@Module({
  imports: [AuditModule, EmployeesModule],
  controllers: [LearningController],
  providers: [LearningService],
  exports: [LearningService],
})
export class LearningModule {}
