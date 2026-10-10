import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProfileInput, SENSITIVE_PROFILE_FIELDS, SensitiveProfileField } from '@hrms/shared';
import { EmployeeProfile, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { requireTenantId } from '../common/request-context';
import { FieldCrypto } from '../crypto/field-crypto';
import { EmployeeAccess } from '../employees/employee-access.service';
import { PrismaService } from '../prisma/prisma.service';

type Identifier = { last4: string | null; value?: string | null };

const encCol = (f: SensitiveProfileField) => `${f}Enc` as const;
const last4Col = (f: SensitiveProfileField) => `${f}Last4` as const;

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
  ) {}

  /**
   * Readable by anyone who can see the employee in full. Identifiers come back
   * unmasked only to the employee themselves and to `employee.sensitive.read`.
   */
  async get(employeeId: string) {
    if (!(await this.access.canSeeFull(employeeId)))
      throw new NotFoundException('Employee not found');
    const profile = await this.prisma.db.employeeProfile.findUnique({ where: { employeeId } });
    const unmask =
      this.access.can('employee.sensitive.read') || (await this.access.isSelf(employeeId));
    return this.present(employeeId, profile, unmask);
  }

  /** Editable by the employee themselves and by `employee.manage`. Keys left out stay as they are; null clears. */
  async update(employeeId: string, input: ProfileInput) {
    const isSelf = await this.access.isSelf(employeeId);
    if (!isSelf && !this.access.can('employee.manage')) {
      if (await this.access.canSeeFull(employeeId))
        throw new ForbiddenException('You can view but not edit this profile');
      throw new NotFoundException('Employee not found');
    }
    const employee = await this.prisma.db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const tenantId = requireTenantId();
    const { emergencyContacts, currentAddress, permanentAddress, ...rest } = input;
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined) continue;
      if ((SENSITIVE_PROFILE_FIELDS as readonly string[]).includes(key)) {
        const field = key as SensitiveProfileField;
        data[encCol(field)] =
          value === null ? null : this.crypto.encrypt(tenantId, field, String(value));
        data[last4Col(field)] = value === null ? null : String(value).slice(-4);
      } else {
        data[key] = value;
      }
    }
    if (emergencyContacts !== undefined)
      data.emergencyContacts = emergencyContacts as Prisma.InputJsonValue;
    if (currentAddress !== undefined) data.currentAddress = currentAddress ?? Prisma.DbNull;
    if (permanentAddress !== undefined) data.permanentAddress = permanentAddress ?? Prisma.DbNull;

    const profile = await this.prisma.db.employeeProfile.upsert({
      where: { employeeId },
      create: { ...(data as Prisma.EmployeeProfileUncheckedCreateInput), tenantId, employeeId },
      update: data,
    });
    // Field names only: values (especially identifiers) never go into the audit log.
    await this.audit.record('employee.profile_updated', 'Employee', employeeId, {
      fields: Object.keys(input).filter((k) => input[k as keyof ProfileInput] !== undefined),
      bySelf: isSelf,
    });
    const unmask = isSelf || this.access.can('employee.sensitive.read');
    return this.present(employeeId, profile, unmask);
  }

  private present(employeeId: string, p: EmployeeProfile | null, unmask: boolean) {
    const tenantId = requireTenantId();
    const identifiers = {} as Record<SensitiveProfileField, Identifier>;
    for (const field of SENSITIVE_PROFILE_FIELDS) {
      const stored = p?.[encCol(field)] ?? null;
      identifiers[field] = {
        last4: p?.[last4Col(field)] ?? null,
        ...(unmask ? { value: stored ? this.crypto.decrypt(tenantId, field, stored) : null } : {}),
      };
    }
    return {
      employeeId,
      dateOfBirth: p?.dateOfBirth ?? null,
      gender: p?.gender ?? null,
      maritalStatus: p?.maritalStatus ?? null,
      bloodGroup: p?.bloodGroup ?? null,
      personalEmail: p?.personalEmail ?? null,
      personalPhone: p?.personalPhone ?? null,
      currentAddress: p?.currentAddress ?? null,
      permanentAddress: p?.permanentAddress ?? null,
      emergencyContacts: p?.emergencyContacts ?? [],
      bankIfsc: p?.bankIfsc ?? null,
      bankName: p?.bankName ?? null,
      bankAccountHolder: p?.bankAccountHolder ?? null,
      identifiers,
      unmasked: unmask,
      updatedAt: p?.updatedAt ?? null,
    };
  }
}
