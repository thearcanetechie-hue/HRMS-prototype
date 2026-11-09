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
  Put,
  Query,
} from '@nestjs/common';
import {
  customFieldSchema,
  CustomFieldInput,
  customFieldValuesSchema,
  updateCustomFieldSchema,
  UpdateCustomFieldInput,
} from '@hrms/shared';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CustomFieldsService } from './custom-fields.service';

@Controller()
export class CustomFieldsController {
  constructor(private readonly fields: CustomFieldsService) {}

  /** The fields to show on forms; anyone signed in, narrowed to what they may see. */
  @Get('custom-fields')
  list(@Query('archived') archived?: string) {
    return this.fields.list(archived === 'true');
  }

  @Post('custom-fields')
  @RequirePermissions('employee.manage')
  create(@Body(new ZodPipe(customFieldSchema)) body: CustomFieldInput) {
    return this.fields.create(body);
  }

  @Patch('custom-fields/:id')
  @RequirePermissions('employee.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateCustomFieldSchema)) body: UpdateCustomFieldInput,
  ) {
    return this.fields.update(id, body);
  }

  @Delete('custom-fields/:id')
  @HttpCode(204)
  @RequirePermissions('employee.manage')
  async archive(@Param('id', ParseUUIDPipe) id: string) {
    await this.fields.archive(id);
  }

  /** HR sets any field; a person sets their own self-editable ones (checked in the service). */
  @Put('employees/:id/custom-fields')
  setValues(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(customFieldValuesSchema)) body: { values: Record<string, unknown> },
  ) {
    return this.fields.setValues(id, body.values);
  }
}
