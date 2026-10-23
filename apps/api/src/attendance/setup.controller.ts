import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  assignShiftSchema,
  decideRegularisationSchema,
  DecideRegularisationInput,
  deviceSchema,
  DeviceInput,
  holidaySchema,
  HolidayInput,
  mapDeviceUserSchema,
  punchBatchSchema,
  PunchBatchInput,
  regularisationSchema,
  RegularisationInput,
  shiftSchema,
  ShiftInput,
  updateDeviceSchema,
  UpdateDeviceInput,
  updateShiftSchema,
  UpdateShiftInput,
} from '@hrms/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public, RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { todayIst } from './days';
import { DevicesService } from './devices.service';
import { LeaveService } from './leave.service';
import { RegularisationService } from './regularisation.service';
import { AttendanceSetupService } from './setup.service';

const yearQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });
const fixQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
const punchQuery = z.object({
  employeeId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Shifts, holidays, missed-punch requests and biometric devices. */
@Controller('attendance')
export class AttendanceSetupController {
  constructor(
    private readonly setup: AttendanceSetupService,
    private readonly fixes: RegularisationService,
    private readonly devices: DevicesService,
    private readonly leave: LeaveService,
  ) {}

  // ---------- shifts ----------

  @Get('shifts')
  shifts() {
    return this.setup.shifts();
  }

  @Post('shifts')
  @RequirePermissions('attendance.manage')
  createShift(@Body(new ZodPipe(shiftSchema)) body: ShiftInput) {
    return this.setup.createShift(body);
  }

  @Patch('shifts/:id')
  @RequirePermissions('attendance.manage')
  updateShift(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateShiftSchema)) body: UpdateShiftInput,
  ) {
    return this.setup.updateShift(id, body);
  }

  @Delete('shifts/:id')
  @RequirePermissions('attendance.manage')
  @HttpCode(204)
  deleteShift(@Param('id', ParseUUIDPipe) id: string) {
    return this.setup.deleteShift(id);
  }

  @Post('shifts/:id/assign')
  @RequirePermissions('attendance.manage')
  @HttpCode(200)
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(assignShiftSchema)) body: z.infer<typeof assignShiftSchema>,
  ) {
    return this.setup.assignShift(id, body.employeeIds);
  }

  // ---------- holidays ----------

  @Get('holidays')
  holidays(@Query(new ZodPipe(yearQuery)) q: z.infer<typeof yearQuery>) {
    return this.setup.holidays(q.year ?? Number(todayIst().slice(0, 4)));
  }

  @Post('holidays')
  @RequirePermissions('attendance.manage')
  createHoliday(@Body(new ZodPipe(holidaySchema)) body: HolidayInput) {
    return this.setup.createHoliday(body);
  }

  @Post('holidays/national')
  @RequirePermissions('attendance.manage')
  @HttpCode(200)
  national(@Query(new ZodPipe(yearQuery)) q: z.infer<typeof yearQuery>) {
    return this.setup.addNational(q.year ?? Number(todayIst().slice(0, 4)));
  }

  @Delete('holidays/:id')
  @RequirePermissions('attendance.manage')
  @HttpCode(204)
  deleteHoliday(@Param('id', ParseUUIDPipe) id: string) {
    return this.setup.deleteHoliday(id);
  }

  // ---------- missed-punch requests ----------

  @Get('regularisations')
  listFixes(@Query(new ZodPipe(fixQuery)) q: z.infer<typeof fixQuery>) {
    return this.fixes.list(q);
  }

  @Post('regularisations')
  requestFix(@Body(new ZodPipe(regularisationSchema)) body: RegularisationInput) {
    return this.fixes.create(body);
  }

  @Post('regularisations/:id/decision')
  @HttpCode(200)
  decideFix(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decideRegularisationSchema)) body: DecideRegularisationInput,
  ) {
    return this.fixes.decide(id, body);
  }

  @Post('regularisations/:id/cancel')
  @HttpCode(200)
  cancelFix(@Param('id', ParseUUIDPipe) id: string) {
    return this.fixes.cancel(id);
  }

  // ---------- devices ----------

  @Get('devices')
  @RequirePermissions('attendance.manage')
  listDevices() {
    return this.devices.list();
  }

  @Post('devices')
  @RequirePermissions('attendance.manage')
  addDevice(@Body(new ZodPipe(deviceSchema)) body: DeviceInput) {
    return this.devices.create(body);
  }

  @Patch('devices/:id')
  @RequirePermissions('attendance.manage')
  updateDevice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateDeviceSchema)) body: UpdateDeviceInput,
  ) {
    return this.devices.update(id, body);
  }

  @Post('devices/:id/key')
  @RequirePermissions('attendance.manage')
  @HttpCode(200)
  rotateKey(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.rotateKey(id);
  }

  @Delete('devices/:id')
  @RequirePermissions('attendance.manage')
  @HttpCode(204)
  removeDevice(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.remove(id);
  }

  @Get('devices/unmatched')
  @RequirePermissions('attendance.manage')
  unmatched() {
    return this.devices.unmatched();
  }

  @Post('devices/map')
  @RequirePermissions('attendance.manage')
  @HttpCode(200)
  mapUser(@Body(new ZodPipe(mapDeviceUserSchema)) body: z.infer<typeof mapDeviceUserSchema>) {
    return this.devices.mapUser(body.deviceUserId, body.employeeId);
  }

  @Get('punches')
  async punches(@Query(new ZodPipe(punchQuery)) q: z.infer<typeof punchQuery>) {
    const v = await this.leave.viewer();
    if (!v.manage && !v.readAll && v.self !== q.employeeId && !v.team.has(q.employeeId))
      throw new ForbiddenException('You can see your own punches and your team’s');
    return this.devices.punches(q.employeeId, q.date);
  }

  /** Punches from a device or bridge, authenticated by the device's key instead of a login. */
  @Post('punches')
  @Public()
  @HttpCode(200)
  async receive(
    @Headers('x-device-key') key: string | undefined,
    @Body(new ZodPipe(punchBatchSchema)) body: PunchBatchInput,
  ) {
    const device = await this.devices.deviceByKey(key);
    return this.devices.receiveBatch(device.id, body);
  }
}

/**
 * The ZKTeco/eSSL "ADMS" push protocol, served outside /api at the fixed paths devices use.
 * Point the device's server address at this API's host and port. Unknown serial numbers get a
 * plain error and nothing is stored.
 */
@Controller('iclock')
export class IclockController {
  constructor(private readonly devices: DevicesService) {}

  @Get('cdata')
  @Public()
  async handshake(@Query('SN') sn: string | undefined, @Res() res: Response) {
    const device = await this.devices.deviceBySerial(sn);
    res.type('text/plain');
    if (!device) return res.status(401).send('Unknown device');
    res.send(
      [
        `GET OPTION FROM: ${device.serialNumber}`,
        'ATTLOGStamp=None',
        'OPERLOGStamp=9999',
        'ATTPHOTOStamp=None',
        'ErrorDelay=30',
        'Delay=10',
        'TransTimes=00:00;14:05',
        'TransInterval=1',
        'TransFlag=TransData AttLog',
        'TimeZone=330',
        'Realtime=1',
        'Encrypt=None',
      ].join('\n'),
    );
  }

  @Post('cdata')
  @Public()
  async upload(
    @Query('SN') sn: string | undefined,
    @Query('table') table: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const device = await this.devices.deviceBySerial(sn);
    // Devices expect a plain 200 for every accepted upload.
    res.type('text/plain').status(200);
    if (!device) return res.status(401).send('Unknown device');
    if (table !== 'ATTLOG') return res.send('OK');
    const body = typeof req.body === 'string' ? req.body : '';
    const punches = DevicesService.parseAttlog(body);
    if (punches.length) await this.devices.receive(device.id, punches);
    res.send(`OK: ${punches.length}`);
  }

  @Get('getrequest')
  @Public()
  async poll(@Query('SN') sn: string | undefined, @Res() res: Response) {
    const device = await this.devices.deviceBySerial(sn);
    res.type('text/plain').send(device ? 'OK' : 'Unknown device');
  }
}
