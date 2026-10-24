import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common';
import {
  attendancePolicySchema,
  leavePolicySchema,
  payrollPolicySchema,
  type Permission,
  type PolicyKey,
} from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditModule } from '../audit/audit.module';
import { AuditService } from '../audit/audit.service';
import { currentContext, requireTenantId } from '../common/request-context';
import { EmployeesModule } from '../employees/employees.module';
import { EmployeeAccess } from '../employees/employee-access.service';
import { PrismaService } from '../prisma/prisma.service';

/** Each policy, its rules and who may change it. Payroll registers its own entry. */
export const POLICY_DEFS: Partial<Record<PolicyKey, { schema: z.ZodTypeAny; manage: Permission }>> =
  {
    attendance: { schema: attendancePolicySchema, manage: 'attendance.manage' },
    leave: { schema: leavePolicySchema, manage: 'attendance.manage' },
    payroll: { schema: payrollPolicySchema, manage: 'payroll.manage' },
  };

export type PolicyOf<K extends PolicyKey> = K extends 'attendance'
  ? z.infer<typeof attendancePolicySchema>
  : K extends 'leave'
    ? z.infer<typeof leavePolicySchema>
    : z.infer<typeof payrollPolicySchema>;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep-merges HR's change into what's stored, so a partial update keeps other settings. */
function merge(base: unknown, patch: unknown): unknown {
  if (!isObject(base) || !isObject(patch)) return patch === undefined ? base : patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = merge(base[k], v);
  return out;
}

/**
 * Company policies: stored as only what HR changed, read back with every default filled in.
 * Each read is cached for the rest of the request.
 */
@Injectable()
export class PolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly audit: AuditService,
  ) {}

  private def(key: string) {
    const d = POLICY_DEFS[key as PolicyKey];
    if (!d) throw new NotFoundException('Unknown policy');
    return d;
  }

  async get<K extends PolicyKey>(key: K): Promise<PolicyOf<K>> {
    const ctx = currentContext() as { policyCache?: Map<string, unknown> };
    const cache = (ctx.policyCache ??= new Map());
    if (cache.has(key)) return cache.get(key) as PolicyOf<K>;
    const row = await this.prisma.db.policy.findUnique({
      where: { tenantId_key: { tenantId: requireTenantId(), key } },
    });
    // Stored values that no longer fit (an old field, a tightened limit) fall back to defaults.
    const parsed = this.def(key).schema.safeParse(row?.data ?? {});
    const value = parsed.success ? parsed.data : this.def(key).schema.parse({});
    cache.set(key, value);
    return value as PolicyOf<K>;
  }

  async update(key: PolicyKey, patch: unknown) {
    const d = this.def(key);
    if (!this.access.can(d.manage)) throw new ForbiddenException('You can’t change this policy');
    const tenantId = requireTenantId();
    const row = await this.prisma.db.policy.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    const next = merge(row?.data ?? {}, patch);
    const checked = d.schema.safeParse(next);
    if (!checked.success)
      throw new BadRequestException(
        checked.error.issues.map((i: z.ZodIssue) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    await this.prisma.db.policy.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: {
        tenantId,
        key,
        data: next as Prisma.InputJsonValue,
        updatedById: currentContext().userId ?? null,
      },
      update: { data: next as Prisma.InputJsonValue, updatedById: currentContext().userId ?? null },
    });
    (currentContext() as { policyCache?: Map<string, unknown> }).policyCache?.delete(key);
    await this.audit.record('policy.updated', 'Policy', key, { key });
    return checked.data;
  }
}

@Controller('policies')
class PoliciesController {
  constructor(private readonly policies: PolicyService) {}

  @Get(':key')
  get(@Param('key') key: string) {
    if (!POLICY_DEFS[key as PolicyKey]) throw new NotFoundException('Unknown policy');
    return this.policies.get(key as PolicyKey);
  }

  @Put(':key')
  update(@Param('key') key: string, @Body() body: unknown) {
    return this.policies.update(key as PolicyKey, body);
  }
}

@Module({
  imports: [AuditModule, EmployeesModule],
  controllers: [PoliciesController],
  providers: [PolicyService],
  exports: [PolicyService],
})
export class PoliciesModule {}
