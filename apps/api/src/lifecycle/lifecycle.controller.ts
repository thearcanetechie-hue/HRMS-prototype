import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  addTaskSchema,
  AddTaskInput,
  CHECKLIST_KINDS,
  createTemplateSchema,
  CreateTemplateInput,
  listChecklistsQuerySchema,
  ListChecklistsQuery,
  startChecklistSchema,
  StartChecklistInput,
  updateTaskSchema,
  UpdateTaskInput,
  updateTemplateSchema,
  UpdateTemplateInput,
} from '@hrms/shared';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { LifecycleService } from './lifecycle.service';

const kindQuery = z.object({ kind: z.enum(CHECKLIST_KINDS).optional() });

@Controller()
export class LifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Get('checklist-templates')
  @RequirePermissions('lifecycle.manage')
  templates(@Query(new ZodPipe(kindQuery)) q: z.infer<typeof kindQuery>) {
    return this.lifecycle.templates(q.kind);
  }

  @Post('checklist-templates')
  @RequirePermissions('lifecycle.manage')
  createTemplate(@Body(new ZodPipe(createTemplateSchema)) body: CreateTemplateInput) {
    return this.lifecycle.createTemplate(body);
  }

  @Patch('checklist-templates/:id')
  @RequirePermissions('lifecycle.manage')
  updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateTemplateSchema)) body: UpdateTemplateInput,
  ) {
    return this.lifecycle.updateTemplate(id, body);
  }

  @Delete('checklist-templates/:id')
  @RequirePermissions('lifecycle.manage')
  @HttpCode(204)
  deleteTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.lifecycle.deleteTemplate(id);
  }

  /** Checklists the caller may see: everyone's for HR, their team's for managers, their own. */
  @Get('checklists')
  list(@Query(new ZodPipe(listChecklistsQuerySchema)) q: ListChecklistsQuery) {
    return this.lifecycle.list(q);
  }

  @Get('checklists/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.lifecycle.get(id);
  }

  @Post('employees/:id/checklists')
  @RequirePermissions('lifecycle.manage')
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(startChecklistSchema)) body: StartChecklistInput,
  ) {
    return this.lifecycle.start(id, body);
  }

  @Post('checklists/:id/cancel')
  @RequirePermissions('lifecycle.manage')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.lifecycle.cancel(id);
  }

  @Post('checklists/:id/tasks')
  @RequirePermissions('lifecycle.manage')
  addTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(addTaskSchema)) body: AddTaskInput,
  ) {
    return this.lifecycle.addTask(id, body);
  }

  @Delete('checklists/:id/tasks/:taskId')
  @RequirePermissions('lifecycle.manage')
  removeTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.lifecycle.removeTask(id, taskId);
  }

  /** Tick or untick a task. Who may tick depends on the task's assignee. */
  @Patch('checklists/:id/tasks/:taskId')
  updateTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body(new ZodPipe(updateTaskSchema)) body: UpdateTaskInput,
  ) {
    return this.lifecycle.updateTask(id, taskId, body);
  }
}
