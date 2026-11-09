import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomFieldInput, fieldKey, UpdateCustomFieldInput } from '@hrms/shared';
import { CustomFieldDef, FieldVisibility, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { requireTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeAccess } from './employee-access.service';

type Values = Record<string, unknown>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Checks one value against its field. Returns the stored form, or an error message. */
export function checkValue(
  def: Pick<CustomFieldDef, 'type' | 'options'>,
  raw: unknown,
): { value: unknown } | { error: string } {
  switch (def.type) {
    case 'TEXT':
    case 'LONG_TEXT': {
      const s = String(raw).trim();
      const max = def.type === 'TEXT' ? 200 : 4000;
      return s.length > max ? { error: `Keep it under ${max} characters` } : { value: s };
    }
    case 'NUMBER': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
      return Number.isFinite(n) ? { value: n } : { error: 'Enter a number' };
    }
    case 'DATE': {
      const s = String(raw).slice(0, 10);
      // A round trip catches dates that don't exist, like 30 February.
      const real = DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
      return real ? { value: s } : { error: 'Enter a date' };
    }
    case 'BOOLEAN':
      if (typeof raw === 'boolean') return { value: raw };
      if (['yes', 'true', '1'].includes(String(raw).toLowerCase())) return { value: true };
      if (['no', 'false', '0'].includes(String(raw).toLowerCase())) return { value: false };
      return { error: 'Choose yes or no' };
    case 'SELECT': {
      const s = String(raw).trim();
      const hit = def.options.find((o) => o.toLowerCase() === s.toLowerCase());
      return hit ? { value: hit } : { error: `Pick one of: ${def.options.join(', ')}` };
    }
    case 'MULTI_SELECT': {
      const list = Array.isArray(raw) ? raw.map(String) : String(raw).split(/[;,]/);
      const picked: string[] = [];
      for (const item of list.map((x) => x.trim()).filter(Boolean)) {
        const hit = def.options.find((o) => o.toLowerCase() === item.toLowerCase());
        if (!hit) return { error: `“${item}” isn’t one of the choices` };
        if (!picked.includes(hit)) picked.push(hit);
      }
      return { value: picked };
    }
    case 'EMAIL': {
      const s = String(raw).trim().toLowerCase();
      return EMAIL.test(s) ? { value: s } : { error: 'Enter a valid email' };
    }
    case 'PHONE': {
      const s = String(raw).trim();
      return PHONE.test(s) ? { value: s } : { error: 'Enter a valid phone number' };
    }
    case 'URL': {
      const s = String(raw).trim();
      try {
        const u = new URL(s);
        return ['http:', 'https:'].includes(u.protocol)
          ? { value: u.toString() }
          : { error: 'Enter a web address' };
      } catch {
        return { error: 'Enter a web address, starting with https://' };
      }
    }
  }
}

const empty = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

/**
 * Extra employee fields each workspace defines (blood group, T-shirt size, laptop serial…).
 * Values sit in Employee.customFields by key, are checked against their field's type, and are
 * shown only to the people the field allows: HR always; the person and their managers for
 * MANAGERS and EVERYONE fields.
 */
@Injectable()
export class CustomFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly audit: AuditService,
  ) {}

  /** Live fields in form order. People who don't manage employees don't see HR-only ones. */
  async list(includeArchived = false) {
    const hr = this.access.can('employee.read');
    return this.prisma.db.customFieldDef.findMany({
      where: {
        ...(includeArchived && this.access.can('employee.manage') ? {} : { archived: false }),
        ...(hr ? {} : { visibility: { not: 'HR_ONLY' } }),
      },
      orderBy: [{ section: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(input: CustomFieldInput) {
    const key = input.key ?? fieldKey(input.label);
    if (
      await this.prisma.db.customFieldDef.findUnique({
        where: { tenantId_key: { tenantId: requireTenantId(), key } },
      })
    )
      throw new ConflictException(`There’s already a field called “${key}”`);
    const def = await this.prisma.db.customFieldDef.create({
      data: { ...input, key, tenantId: requireTenantId() },
    });
    await this.audit.record('custom_field.created', 'CustomFieldDef', def.id, {
      key,
      type: def.type,
    });
    return def;
  }

  async update(id: string, input: UpdateCustomFieldInput) {
    const def = await this.prisma.db.customFieldDef.findUnique({ where: { id } });
    if (!def) throw new NotFoundException('Field not found');
    if (input.options && ['SELECT', 'MULTI_SELECT'].includes(def.type) && !input.options.length)
      throw new BadRequestException('Keep at least one choice');
    const row = await this.prisma.db.customFieldDef.update({ where: { id }, data: input });
    await this.audit.record('custom_field.updated', 'CustomFieldDef', id, {
      fields: Object.keys(input),
    });
    return row;
  }

  /** Archiving hides the field but keeps its values, so turning it back on restores them. */
  async archive(id: string) {
    return this.update(id, { archived: true });
  }

  /**
   * Cleans values for saving: unknown keys and wrong types are rejected with an error per field.
   * `required` is checked against the record as it will be after the change, unless `skipRequired`
   * (imports and quick adds fill these in later).
   */
  async validate(
    values: Values,
    existing: Values = {},
    opts: { skipRequired?: boolean; selfOnly?: boolean } = {},
  ) {
    const defs = await this.prisma.db.customFieldDef.findMany({ where: { archived: false } });
    const byKey = new Map(defs.map((d) => [d.key, d]));
    const errors: Record<string, string[]> = {};
    const out: Values = { ...existing };
    for (const [key, raw] of Object.entries(values)) {
      const def = byKey.get(key);
      if (!def) {
        errors[key] = ['There’s no such field'];
        continue;
      }
      if (opts.selfOnly && !def.selfEditable) {
        errors[key] = ['Only HR can change this'];
        continue;
      }
      if (empty(raw)) {
        delete out[key];
        continue;
      }
      const r = checkValue(def, raw);
      if ('error' in r) errors[key] = [r.error];
      else out[key] = r.value;
    }
    if (!opts.skipRequired)
      for (const d of defs)
        if (d.required && empty(out[d.key]) && !(opts.selfOnly && !d.selfEditable))
          errors[d.key] ??= [`${d.label} is required`];
    if (Object.keys(errors).length)
      throw new BadRequestException({
        message: 'Validation failed',
        errors: Object.fromEntries(
          Object.entries(errors).map(([k, v]) => [`customFields.${k}`, v]),
        ),
      });
    return out;
  }

  /** Which visibilities the caller can see on this person's record. */
  private async levels(employeeId: string): Promise<FieldVisibility[]> {
    if (this.access.can('employee.read')) return ['HR_ONLY', 'MANAGERS', 'EVERYONE'];
    if (
      (await this.access.canSeeFull(employeeId)) ||
      (await this.access.selfEmployeeId()) === employeeId
    )
      return ['MANAGERS', 'EVERYONE'];
    return ['EVERYONE'];
  }

  /** Drops values the caller isn't allowed to see (and those of archived fields). */
  async visible<T extends { id: string; customFields: Prisma.JsonValue }>(employee: T): Promise<T> {
    const levels = await this.levels(employee.id);
    const defs = await this.prisma.db.customFieldDef.findMany({
      where: { archived: false, visibility: { in: levels } },
      select: { key: true },
    });
    const keys = new Set(defs.map((d) => d.key));
    const values = (employee.customFields ?? {}) as Values;
    return {
      ...employee,
      customFields: Object.fromEntries(Object.entries(values).filter(([k]) => keys.has(k))),
    };
  }

  /** HR sets any field; people set their own self-editable ones. */
  async setValues(employeeId: string, values: Values) {
    const self = (await this.access.selfEmployeeId()) === employeeId;
    const hr = this.access.can('employee.manage');
    if (!hr && !self) throw new ForbiddenException('You can’t change this person’s details');
    const e = await this.prisma.db.employee.findUnique({
      where: { id: employeeId },
      select: { customFields: true },
    });
    if (!e) throw new NotFoundException('Employee not found');
    const next = await this.validate(values, (e.customFields ?? {}) as Values, { selfOnly: !hr });
    const row = await this.prisma.db.employee.update({
      where: { id: employeeId },
      data: { customFields: next as Prisma.InputJsonValue },
      select: { id: true, customFields: true },
    });
    await this.audit.record('employee.updated', 'Employee', employeeId, {
      fields: Object.keys(values).map((k) => `customFields.${k}`),
      bySelf: !hr,
    });
    return this.visible(row);
  }
}
