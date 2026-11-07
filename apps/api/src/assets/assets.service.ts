import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssetStatusInput,
  AssignAssetInput,
  CreateAssetInput,
  ListAssetsQuery,
  ReturnAssetInput,
  UpdateAssetInput,
} from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { currentContext, requireTenantId } from '../common/request-context';
import { EmployeeAccess } from '../employees/employee-access.service';
import { PrismaService } from '../prisma/prisma.service';

const holderSelect = {
  id: true,
  firstName: true,
  lastName: true,
  employeeCode: true,
  status: true,
  dateOfExit: true,
} satisfies Prisma.EmployeeSelect;

const assetInclude = {
  holder: { select: holderSelect },
  events: { orderBy: { at: 'desc' }, take: 50 },
} satisfies Prisma.AssetInclude;

type AssetRow = Prisma.AssetGetPayload<{ include: typeof assetInclude }>;

const day = (iso?: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);
const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const today = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
const nameOf = (e: { firstName: string; lastName: string }) =>
  `${e.firstName} ${e.lastName}`.trim();

/**
 * The company asset register. Everything here needs `asset.manage` (HR), except reading the
 * assets someone holds, which follows the usual rule for seeing that person's record.
 *
 * Status moves: IN_STOCK → ASSIGNED (assign) → back via return (IN_STOCK, or IN_REPAIR when it
 * comes back damaged); IN_STOCK/ASSIGNED → IN_REPAIR → IN_STOCK; anything not assigned →
 * RETIRED or LOST. Every move is written to the asset's history and the audit log.
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListAssetsQuery) {
    const contains = q.search ? { contains: q.search, mode: 'insensitive' as const } : undefined;
    const rows = await this.prisma.db.asset.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.category ? { category: q.category } : {}),
        ...(q.holderId ? { holderId: q.holderId } : {}),
        ...(contains
          ? {
              OR: [
                { name: contains },
                { tag: contains },
                { serial: contains },
                { holder: { firstName: contains } },
                { holder: { lastName: contains } },
              ],
            }
          : {}),
      },
      include: assetInclude,
      orderBy: [{ tag: 'asc' }],
      take: 1000,
    });
    return rows.map((r) => this.present(r));
  }

  async get(id: string) {
    const row = await this.prisma.db.asset.findUnique({ where: { id }, include: assetInclude });
    if (!row) throw new NotFoundException('Asset not found');
    return this.present(row);
  }

  /** What someone holds; visible to anyone who can see their full record. */
  async heldBy(employeeId: string) {
    if (!this.access.can('asset.manage') && !(await this.access.canSeeFull(employeeId)))
      throw new NotFoundException('Employee not found');
    const rows = await this.prisma.db.asset.findMany({
      where: { holderId: employeeId, status: 'ASSIGNED' },
      include: assetInclude,
      orderBy: { since: 'asc' },
    });
    return rows.map((r) => this.present(r));
  }

  async create(input: CreateAssetInput) {
    const tenantId = requireTenantId();
    // Tags run in order per workspace; retry if two people add at the same moment.
    for (let attempt = 0; attempt < 3; attempt++) {
      const count = await this.prisma.db.asset.count();
      const tag = `AST-${String(count + 1 + attempt).padStart(4, '0')}`;
      try {
        const asset = await this.prisma.db.asset.create({
          data: {
            tenantId,
            tag,
            name: input.name,
            category: input.category,
            serial: input.serial,
            purchasedOn: day(input.purchasedOn),
            cost: input.cost,
            warrantyUntil: day(input.warrantyUntil),
            location: input.location ?? null,
            condition: input.condition,
            notes: input.notes ?? null,
            status: 'IN_STOCK',
            events: {
              create: { tenantId, kind: 'added', text: 'Added to the register', byId: this.by() },
            },
          },
          include: assetInclude,
        });
        await this.audit.record('asset.added', 'Asset', asset.id, {
          tag,
          category: asset.category,
        });
        return this.present(asset);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const target = String(err.meta?.target ?? '');
          if (target.includes('serial'))
            throw new ConflictException('An asset with that serial number is already registered');
          continue;
        }
        throw err;
      }
    }
    throw new ConflictException('Could not number the asset, please try again');
  }

  async update(id: string, input: UpdateAssetInput) {
    await this.get(id);
    const { purchasedOn, warrantyUntil, ...rest } = input;
    const asset = await this.prisma.db.asset.update({
      where: { id },
      data: {
        ...rest,
        ...(purchasedOn !== undefined ? { purchasedOn: day(purchasedOn) } : {}),
        ...(warrantyUntil !== undefined ? { warrantyUntil: day(warrantyUntil) } : {}),
      },
      include: assetInclude,
    });
    await this.event(id, 'updated', 'Details updated');
    await this.audit.record('asset.updated', 'Asset', id, { fields: Object.keys(input) });
    return this.get(asset.id);
  }

  async assign(id: string, input: AssignAssetInput) {
    const asset = await this.get(id);
    if (asset.status !== 'IN_STOCK')
      throw new BadRequestException('Only assets in stock can be assigned');
    const employee = await this.prisma.db.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, firstName: true, lastName: true, status: true },
    });
    if (!employee || employee.status === 'EXITED')
      throw new NotFoundException('Employee not found');
    await this.prisma.db.asset.update({
      where: { id },
      data: { status: 'ASSIGNED', holderId: employee.id, since: today() },
    });
    await this.event(
      id,
      'assigned',
      `Assigned to ${nameOf(employee)}${input.note ? ` · ${input.note}` : ''}`,
      employee.id,
    );
    await this.audit.record('asset.assigned', 'Asset', id, { employeeId: employee.id });
    return this.get(id);
  }

  async returnAsset(id: string, input: ReturnAssetInput) {
    const asset = await this.get(id);
    if (asset.status !== 'ASSIGNED' || !asset.holder)
      throw new BadRequestException('This asset isn’t assigned to anyone');
    const damaged = input.condition === 'DAMAGED';
    await this.prisma.db.asset.update({
      where: { id },
      data: {
        status: damaged ? 'IN_REPAIR' : 'IN_STOCK',
        holderId: null,
        condition: input.condition,
        since: damaged ? today() : null,
      },
    });
    await this.event(
      id,
      'returned',
      `Returned by ${asset.holder.name} · ${input.condition.toLowerCase()}${input.note ? ` · ${input.note}` : ''}`,
      asset.holder.id,
    );
    if (damaged) await this.event(id, 'repair', 'Sent for repair');
    await this.audit.record('asset.returned', 'Asset', id, {
      employeeId: asset.holder.id,
      condition: input.condition,
    });
    return this.get(id);
  }

  async setStatus(id: string, input: AssetStatusInput) {
    const asset = await this.get(id);
    const from = asset.status;
    const allowed: Record<string, string[]> = {
      IN_REPAIR: ['IN_STOCK', 'ASSIGNED'],
      IN_STOCK: ['IN_REPAIR', 'LOST'],
      RETIRED: ['IN_STOCK', 'IN_REPAIR', 'LOST'],
      LOST: ['IN_STOCK', 'ASSIGNED', 'IN_REPAIR'],
    };
    if (!allowed[input.status]!.includes(from))
      throw new BadRequestException(
        `Can’t move an asset from ${label(from)} to ${label(input.status)}`,
      );
    await this.prisma.db.asset.update({
      where: { id },
      data: {
        status: input.status,
        holderId: null,
        since: input.status === 'IN_STOCK' ? null : today(),
        ...(input.status === 'IN_STOCK' && asset.condition === 'DAMAGED'
          ? { condition: 'GOOD' }
          : {}),
      },
    });
    const text = {
      IN_REPAIR: 'Sent for repair',
      IN_STOCK: from === 'IN_REPAIR' ? 'Repaired, back in stock' : 'Back in stock',
      RETIRED: 'Retired',
      LOST: asset.holder ? `Marked as lost (was with ${asset.holder.name})` : 'Marked as lost',
    }[input.status];
    await this.event(
      id,
      input.status === 'IN_REPAIR' ? 'repair' : input.status.toLowerCase(),
      input.note ? `${text} · ${input.note}` : text,
      asset.holder?.id,
    );
    await this.audit.record('asset.status_changed', 'Asset', id, { from, to: input.status });
    return this.get(id);
  }

  private by() {
    return currentContext().userId ?? null;
  }

  private async event(assetId: string, kind: string, text: string, employeeId?: string | null) {
    await this.prisma.db.assetEvent.create({
      data: {
        tenantId: requireTenantId(),
        assetId,
        kind,
        text,
        employeeId: employeeId ?? null,
        byId: this.by(),
      },
    });
  }

  private present(r: AssetRow) {
    const leaving =
      r.holder && r.holder.status === 'ON_NOTICE' && r.holder.dateOfExit
        ? isoDay(r.holder.dateOfExit)
        : null;
    return {
      id: r.id,
      tag: r.tag,
      name: r.name,
      category: r.category,
      serial: r.serial,
      purchasedOn: isoDay(r.purchasedOn),
      cost: r.cost,
      warrantyUntil: isoDay(r.warrantyUntil),
      location: r.location,
      condition: r.condition,
      status: r.status,
      since: isoDay(r.since),
      notes: r.notes,
      holder: r.holder
        ? {
            id: r.holder.id,
            name: nameOf(r.holder),
            code: r.holder.employeeCode,
            leaving,
          }
        : null,
      history: r.events.map((e) => ({ id: e.id, kind: e.kind, text: e.text, at: e.at })),
    };
  }
}

const label = (s: string) => s.replace('_', ' ').toLowerCase();
