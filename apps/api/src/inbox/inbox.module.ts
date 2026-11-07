import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  channelSchema,
  ChannelInput,
  messageSchema,
  newConversationSchema,
  NewConversationInput,
} from '@hrms/shared';
import { z } from 'zod';
import { AttendanceModule } from '../attendance/attendance.module';
import { ClaimsModule } from '../claims/claims.module';
import { ZodPipe } from '../common/zod.pipe';
import { EmployeesModule } from '../employees/employees.module';
import { InboxService } from './inbox.service';

const listQuery = z.object({
  folder: z.enum(['all', 'starred', 'sent', 'channels']).default('all'),
  q: z.string().max(100).optional(),
});
const starSchema = z.object({ starred: z.boolean() });
const joinSchema = z.object({ joined: z.boolean() });

@Controller('inbox')
class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get('conversations')
  list(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.inbox.conversations(q.folder, q.q);
  }

  @Post('conversations')
  start(@Body(new ZodPipe(newConversationSchema)) body: NewConversationInput) {
    return this.inbox.start(body);
  }

  @Get('conversations/:id')
  open(@Param('id', ParseUUIDPipe) id: string) {
    return this.inbox.open(id);
  }

  @Post('conversations/:id/messages')
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(messageSchema)) body: z.infer<typeof messageSchema>,
  ) {
    return this.inbox.send(id, body.body);
  }

  @Post('conversations/:id/star')
  @HttpCode(200)
  star(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(starSchema)) body: z.infer<typeof starSchema>,
  ) {
    return this.inbox.star(id, body.starred);
  }

  @Get('channels')
  channels() {
    return this.inbox.channels();
  }

  @Post('channels')
  createChannel(@Body(new ZodPipe(channelSchema)) body: ChannelInput) {
    return this.inbox.createChannel(body);
  }

  @Post('channels/:id/join')
  @HttpCode(200)
  join(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(joinSchema)) body: z.infer<typeof joinSchema>,
  ) {
    return this.inbox.join(id, body.joined);
  }

  @Get('approvals')
  approvals() {
    return this.inbox.approvals();
  }

  @Get('counts')
  counts() {
    return this.inbox.counts();
  }
}

@Module({
  imports: [AttendanceModule, ClaimsModule, EmployeesModule],
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
