import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { profileSchema, ProfileInput } from '@hrms/shared';
import { ZodPipe } from '../common/zod.pipe';
import { EmployeeAccess } from '../employees/employee-access.service';
import { ProfilesService } from './profiles.service';

@Controller()
export class ProfilesController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly access: EmployeeAccess,
  ) {}

  @Get('me/profile')
  async myProfile() {
    return this.profiles.get(await this.self());
  }

  @Put('me/profile')
  async updateMyProfile(@Body(new ZodPipe(profileSchema)) body: ProfileInput) {
    return this.profiles.update(await this.self(), body);
  }

  @Get('employees/:id/profile')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.profiles.get(id);
  }

  @Put('employees/:id/profile')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(profileSchema)) body: ProfileInput,
  ) {
    return this.profiles.update(id, body);
  }

  private async self() {
    const id = await this.access.selfEmployeeId();
    if (!id) throw new NotFoundException('Your login is not linked to an employee record');
    return id;
  }
}
