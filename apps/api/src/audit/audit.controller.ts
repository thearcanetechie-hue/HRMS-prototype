import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AuditService } from './audit.service';

const querySchema = z.object({
  take: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().uuid().optional(),
});

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  list(@Query(new ZodPipe(querySchema)) q: z.infer<typeof querySchema>) {
    return this.audit.list(q.take, q.cursor);
  }
}
