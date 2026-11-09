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
  Put,
} from '@nestjs/common';
import {
  answerSchema,
  AnswerInput,
  assessmentSchema,
  AssessmentInput,
  assignAssessmentSchema,
  AssignAssessmentInput,
  markAttemptSchema,
  MarkAttemptInput,
  questionsSchema,
  QuestionInput,
  updateAssessmentSchema,
  UpdateAssessmentInput,
} from '@hrms/shared';
import { AuditModule } from '../audit/audit.module';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EmployeesModule } from '../employees/employees.module';
import { AssessmentsService } from './assessments.service';

const id = new ParseUUIDPipe();

@Controller('assessments')
class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  // ---------- taking them (anyone signed in) ----------

  @Get('mine')
  mine() {
    return this.assessments.mine();
  }

  @Post(':id/attempts')
  start(@Param('id', id) assessmentId: string) {
    return this.assessments.start(assessmentId);
  }

  @Get('attempts/:id')
  attempt(@Param('id', id) attemptId: string) {
    return this.assessments.attempt(attemptId);
  }

  @Put('attempts/:id/answers')
  answer(@Param('id', id) attemptId: string, @Body(new ZodPipe(answerSchema)) body: AnswerInput) {
    return this.assessments.answer(attemptId, body);
  }

  @Post('attempts/:id/submit')
  @HttpCode(200)
  submit(@Param('id', id) attemptId: string) {
    return this.assessments.submit(attemptId);
  }

  @Post('attempts/:id/mark')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  mark(
    @Param('id', id) attemptId: string,
    @Body(new ZodPipe(markAttemptSchema)) body: MarkAttemptInput,
  ) {
    return this.assessments.mark(attemptId, body);
  }

  // Managers see their team's results; the service narrows it.
  @Get(':id/results')
  results(@Param('id', id) assessmentId: string) {
    return this.assessments.results(assessmentId);
  }

  // ---------- writing and running them (HR) ----------

  @Get()
  @RequirePermissions('assessment.manage')
  list() {
    return this.assessments.list();
  }

  @Post()
  @RequirePermissions('assessment.manage')
  create(@Body(new ZodPipe(assessmentSchema)) body: AssessmentInput) {
    return this.assessments.create(body);
  }

  @Get(':id')
  @RequirePermissions('assessment.manage')
  get(@Param('id', id) assessmentId: string) {
    return this.assessments.get(assessmentId);
  }

  @Patch(':id')
  @RequirePermissions('assessment.manage')
  update(
    @Param('id', id) assessmentId: string,
    @Body(new ZodPipe(updateAssessmentSchema)) body: UpdateAssessmentInput,
  ) {
    return this.assessments.update(assessmentId, body);
  }

  @Put(':id/questions')
  @RequirePermissions('assessment.manage')
  questions(
    @Param('id', id) assessmentId: string,
    @Body(new ZodPipe(questionsSchema)) body: { questions: QuestionInput[] },
  ) {
    return this.assessments.setQuestions(assessmentId, body.questions);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  publish(@Param('id', id) assessmentId: string) {
    return this.assessments.publish(assessmentId);
  }

  @Post(':id/close')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  close(@Param('id', id) assessmentId: string) {
    return this.assessments.close(assessmentId);
  }

  @Post(':id/copy')
  @RequirePermissions('assessment.manage')
  copy(@Param('id', id) assessmentId: string) {
    return this.assessments.copy(assessmentId);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('assessment.manage')
  remove(@Param('id', id) assessmentId: string) {
    return this.assessments.remove(assessmentId);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  assign(
    @Param('id', id) assessmentId: string,
    @Body(new ZodPipe(assignAssessmentSchema)) body: AssignAssessmentInput,
  ) {
    return this.assessments.assign(assessmentId, body);
  }

  @Delete(':id/assign/:employeeId')
  @HttpCode(204)
  @RequirePermissions('assessment.manage')
  unassign(@Param('id', id) assessmentId: string, @Param('employeeId', id) employeeId: string) {
    return this.assessments.unassign(assessmentId, employeeId);
  }
}

@Module({
  imports: [AuditModule, EmployeesModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
})
export class AssessmentsModule {}
