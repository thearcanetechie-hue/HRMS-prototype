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
  commentSchema,
  pollSchema,
  PollInput,
  postSchema,
  PostInput,
  pulseResponseSchema,
  PulseResponseInput,
  pulseSurveySchema,
  PulseSurveyInput,
  rsvpSchema,
} from '@hrms/shared';
import { z } from 'zod';
import { AuditModule } from '../audit/audit.module';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EmployeesModule } from '../employees/employees.module';
import { EngagementService } from './engagement.service';

const feedQuery = z.object({
  tab: z.enum(['all', 'announcements', 'kudos', 'team']).default('all'),
  before: z.string().datetime().optional(),
});
const pinSchema = z.object({ pinned: z.boolean() });
const voteSchema = z.object({ optionId: z.string().uuid() });

@Controller('engagement')
class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get('feed')
  feed(@Query(new ZodPipe(feedQuery)) q: z.infer<typeof feedQuery>) {
    return this.engagement.feed(q.tab, q.before);
  }

  @Get('sidebar')
  sidebar() {
    return this.engagement.sidebar();
  }

  @Post('posts')
  post(@Body(new ZodPipe(postSchema)) body: PostInput) {
    return this.engagement.createPost(body);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.engagement.deletePost(id);
  }

  @Post('posts/:id/pin')
  @RequirePermissions('engagement.manage')
  @HttpCode(200)
  pin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(pinSchema)) body: z.infer<typeof pinSchema>,
  ) {
    return this.engagement.pin(id, body.pinned);
  }

  @Post('posts/:id/react')
  @HttpCode(200)
  react(@Param('id', ParseUUIDPipe) id: string) {
    return this.engagement.toggleReaction(id);
  }

  @Get('posts/:id/comments')
  comments(@Param('id', ParseUUIDPipe) id: string) {
    return this.engagement.comments(id);
  }

  @Post('posts/:id/comments')
  comment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(commentSchema)) body: z.infer<typeof commentSchema>,
  ) {
    return this.engagement.comment(id, body.body);
  }

  @Delete('posts/:id/comments/:commentId')
  @HttpCode(204)
  deleteComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    return this.engagement.deleteComment(id, commentId);
  }

  @Post('posts/:id/rsvp')
  @HttpCode(200)
  rsvp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(rsvpSchema)) body: z.infer<typeof rsvpSchema>,
  ) {
    return this.engagement.rsvp(id, body.answer);
  }

  @Post('polls')
  @RequirePermissions('engagement.manage')
  createPoll(@Body(new ZodPipe(pollSchema)) body: PollInput) {
    return this.engagement.createPoll(body);
  }

  @Post('polls/:id/vote')
  @HttpCode(200)
  vote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(voteSchema)) body: z.infer<typeof voteSchema>,
  ) {
    return this.engagement.vote(id, body.optionId);
  }

  @Post('pulse')
  @RequirePermissions('engagement.manage')
  startPulse(@Body(new ZodPipe(pulseSurveySchema)) body: PulseSurveyInput) {
    return this.engagement.startPulse(body);
  }

  @Post('pulse/:id/close')
  @RequirePermissions('engagement.manage')
  @HttpCode(200)
  closePulse(@Param('id', ParseUUIDPipe) id: string) {
    return this.engagement.closePulse(id);
  }

  @Post('pulse/:id/respond')
  @HttpCode(200)
  respond(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(pulseResponseSchema)) body: PulseResponseInput,
  ) {
    return this.engagement.respond(id, body);
  }
}

@Module({
  imports: [AuditModule, EmployeesModule],
  controllers: [EngagementController],
  providers: [EngagementService],
})
export class EngagementModule {}
