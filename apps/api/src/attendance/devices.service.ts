import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DeviceInput, PunchBatchInput, UpdateDeviceInput } from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { requestContext, requireTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from './attendance.service';
import { isoDay, todayIst, toDate } from './days';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const IST_MS = 5.5 * 3_600_000;
/** The calendar day in India a punch belongs to. */
const istDay = (t: Date) => new Date(t.getTime() + IST_MS).toISOString().slice(0, 10);

export interface IncomingPunch {
  userId: string;
  time: Date;
  direction: 'IN' | 'OUT' | 'UNKNOWN';
}

/**
 * Biometric devices and the punches they send.
 *
 * Devices reach us two ways: the punch API with a per-device key (for bridges and newer
 * devices), or the ZKTeco/eSSL "ADMS" push protocol, where the device is known by its serial
 * number. Punches are stored as received, matched to employees by their biometric user number,
 * and each affected day's check-in and check-out become the first and last punch.
 */
@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly audit: AuditService,
  ) {}

  // ---------- managing devices (HR) ----------

  async list() {
    const today = toDate(todayIst());
    const devices = await this.prisma.db.biometricDevice.findMany({
      include: { location: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const [todayCounts, unmatched] = await Promise.all([
      this.prisma.db.punch.groupBy({
        by: ['deviceId'],
        where: { punchedAt: { gte: new Date(today.getTime() - IST_MS) } },
        _count: true,
      }),
      this.prisma.db.punch.groupBy({ by: ['deviceId'], where: { employeeId: null }, _count: true }),
    ]);
    return devices.map(({ keyHash, ...d }) => ({
      ...d,
      hasKey: Boolean(keyHash),
      punchesToday: todayCounts.find((c) => c.deviceId === d.id)?._count ?? 0,
      unmatched: unmatched.find((c) => c.deviceId === d.id)?._count ?? 0,
    }));
  }

  private newKey() {
    const key = `hrd_${randomBytes(24).toString('base64url')}`;
    return { key, keyHash: sha256(key), keyPrefix: key.slice(0, 8) };
  }

  /** Registers a device. The API key is returned once and only its hash is kept. */
  async create(input: DeviceInput) {
    const { key, ...hashed } = this.newKey();
    try {
      const device = await this.prisma.db.biometricDevice.create({
        data: {
          tenantId: requireTenantId(),
          name: input.name,
          serialNumber: input.serialNumber.toUpperCase(),
          locationId: input.locationId ?? null,
          ...hashed,
        },
      });
      await this.audit.record('attendance.device_added', 'BiometricDevice', device.id, {
        name: device.name,
      });
      const { keyHash: _h, ...safe } = device;
      return { device: safe, key };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw new ConflictException('A device with that serial number is already registered');
      throw err;
    }
  }

  async rotateKey(id: string) {
    const d = await this.prisma.db.biometricDevice.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Device not found');
    const { key, ...hashed } = this.newKey();
    await this.prisma.db.biometricDevice.update({ where: { id }, data: hashed });
    await this.audit.record('attendance.device_key_rotated', 'BiometricDevice', id, {
      name: d.name,
    });
    return { key };
  }

  async update(id: string, input: UpdateDeviceInput) {
    const d = await this.prisma.db.biometricDevice.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Device not found');
    const { keyHash: _h, ...safe } = await this.prisma.db.biometricDevice.update({
      where: { id },
      data: input,
    });
    return safe;
  }

  async remove(id: string) {
    const d = await this.prisma.db.biometricDevice.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Device not found');
    await this.prisma.db.biometricDevice.delete({ where: { id } });
    await this.audit.record('attendance.device_removed', 'BiometricDevice', id, { name: d.name });
  }

  /** Device user numbers that have punched but aren't linked to anyone yet. */
  async unmatched() {
    const rows = await this.prisma.db.punch.groupBy({
      by: ['deviceUserId'],
      where: { employeeId: null },
      _count: true,
      _max: { punchedAt: true },
      orderBy: { _max: { punchedAt: 'desc' } },
      take: 100,
    });
    return rows.map((r) => ({
      deviceUserId: r.deviceUserId,
      punches: r._count,
      lastPunchAt: r._max.punchedAt?.toISOString() ?? null,
    }));
  }

  /** Links a device user number to an employee and fills in their days from waiting punches. */
  async mapUser(deviceUserId: string, employeeId: string) {
    const e = await this.prisma.db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, biometricId: true },
    });
    if (!e) throw new NotFoundException('Employee not found');
    const taken = await this.prisma.db.employee.findFirst({
      where: { biometricId: deviceUserId, id: { not: employeeId } },
    });
    if (taken)
      throw new ConflictException(`Device user ${deviceUserId} is already linked to someone else`);
    await this.prisma.db.employee.update({
      where: { id: employeeId },
      data: { biometricId: deviceUserId },
    });
    const waiting = await this.prisma.db.punch.findMany({
      where: { deviceUserId, employeeId: null },
      select: { punchedAt: true },
    });
    await this.prisma.db.punch.updateMany({
      where: { deviceUserId, employeeId: null },
      data: { employeeId },
    });
    const days = new Set(waiting.map((p) => istDay(p.punchedAt)));
    for (const day of days) await this.rebuildDay(employeeId, day);
    await this.audit.record('attendance.device_user_linked', 'Employee', employeeId, {
      deviceUserId,
    });
    return { linked: waiting.length, days: days.size };
  }

  /** A day's raw punches for one person, for HR, their managers and themselves. */
  async punches(employeeId: string, day: string) {
    const from = new Date(toDate(day).getTime() - IST_MS);
    const rows = await this.prisma.db.punch.findMany({
      where: { employeeId, punchedAt: { gte: from, lt: new Date(from.getTime() + 86_400_000) } },
      include: { device: { select: { name: true } } },
      orderBy: { punchedAt: 'asc' },
    });
    return rows.map((p) => ({
      id: p.id,
      at: p.punchedAt.toISOString(),
      direction: p.direction,
      device: p.device.name,
    }));
  }

  // ---------- receiving punches (devices, no login) ----------

  /** Finds the device by API key and opens its workspace for the rest of the request. */
  async deviceByKey(key: string | undefined) {
    if (!key) throw new UnauthorizedException('Send the device key in the X-Device-Key header');
    const device = await this.prisma.biometricDevice.findUnique({
      where: { keyHash: sha256(key) },
    });
    if (!device || !device.active) throw new UnauthorizedException('Unknown or disabled device');
    this.enter(device.tenantId);
    return device;
  }

  /** Finds a device by serial number (ADMS protocol) and opens its workspace. */
  async deviceBySerial(serial: string | undefined) {
    if (!serial) return null;
    const device = await this.prisma.biometricDevice.findUnique({
      where: { serialNumber: serial.toUpperCase() },
    });
    if (!device || !device.active) return null;
    this.enter(device.tenantId);
    return device;
  }

  private enter(tenantId: string) {
    const store = requestContext.getStore();
    if (store) store.tenantId = tenantId;
  }

  async receive(deviceId: string, punches: IncomingPunch[]) {
    const tenantId = requireTenantId();
    const userIds = [...new Set(punches.map((p) => p.userId))];
    const employees = await this.prisma.db.employee.findMany({
      where: { biometricId: { in: userIds } },
      select: { id: true, biometricId: true },
    });
    const byUser = new Map(employees.map((e) => [e.biometricId!, e.id]));
    const res = await this.prisma.db.punch.createMany({
      data: punches.map((p) => ({
        tenantId,
        deviceId,
        deviceUserId: p.userId,
        employeeId: byUser.get(p.userId) ?? null,
        punchedAt: p.time,
        direction: p.direction,
      })),
      skipDuplicates: true,
    });
    await this.prisma.db.biometricDevice.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date() },
    });
    const days = new Set<string>();
    for (const p of punches) {
      const emp = byUser.get(p.userId);
      if (emp) days.add(`${emp}|${istDay(p.time)}`);
    }
    for (const key of days) {
      const [emp, day] = key.split('|') as [string, string];
      await this.rebuildDay(emp, day);
    }
    return {
      received: punches.length,
      stored: res.count,
      unmatched: punches.filter((p) => !byUser.has(p.userId)).length,
    };
  }

  receiveBatch(deviceId: string, input: PunchBatchInput) {
    return this.receive(
      deviceId,
      input.punches.map((p) => ({
        userId: p.userId,
        time: new Date(p.time),
        direction: p.direction,
      })),
    );
  }

  /**
   * Parses an ADMS ATTLOG upload: one punch per line, tab separated, with the device's local
   * time (India): `PIN  2026-10-23 09:12:44  status  verify ...`. Status 0 is in, 1 is out.
   */
  static parseAttlog(body: string): IncomingPunch[] {
    const out: IncomingPunch[] = [];
    for (const line of body.split(/\r?\n/)) {
      const [pin, stamp, status] = line.split('\t');
      if (!pin?.trim() || !stamp || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(stamp.trim()))
        continue;
      const time = new Date(`${stamp.trim().replace(' ', 'T')}+05:30`);
      if (Number.isNaN(time.getTime())) continue;
      out.push({
        userId: pin.trim(),
        time,
        direction: status?.trim() === '0' ? 'IN' : status?.trim() === '1' ? 'OUT' : 'UNKNOWN',
      });
    }
    return out;
  }

  /** Sets a day's check-in and check-out from the person's first and last punch that day. */
  private async rebuildDay(employeeId: string, day: string) {
    const from = new Date(toDate(day).getTime() - IST_MS);
    const punches = await this.prisma.db.punch.findMany({
      where: { employeeId, punchedAt: { gte: from, lt: new Date(from.getTime() + 86_400_000) } },
      orderBy: { punchedAt: 'asc' },
      select: { punchedAt: true, direction: true },
    });
    if (!punches.length) return;
    const first = punches[0]!;
    const last = punches[punches.length - 1]!;
    // A single punch is a check-in unless the device said it was an exit.
    const checkIn = punches.length === 1 && first.direction === 'OUT' ? null : first.punchedAt;
    const checkOut = punches.length > 1 || first.direction === 'OUT' ? last.punchedAt : null;
    await this.attendance.applyTimes(
      employeeId,
      isoDay(toDate(day)),
      { checkIn, checkOut },
      'BIOMETRIC',
    );
  }
}
