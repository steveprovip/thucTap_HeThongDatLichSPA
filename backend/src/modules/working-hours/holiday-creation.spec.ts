import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Role } from '../../common/constants/roles.constant';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import { Appointment } from '../../database/entities/appointment.entity';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { SalonHoliday } from '../../database/entities/salon-holiday.entity';
import { SalonWorkingHour } from '../../database/entities/salon-working-hour.entity';
import { AuditService } from '../audit/audit.service';
import { HolidaysController } from './working-hours.controller';
import { WorkingHoursService } from './working-hours.service';

describe('Holiday creation — persistence and audit', () => {
  let app: INestApplication;
  let service: WorkingHoursService;
  const dto = { startDate: '2026-10-18', endDate: '2026-10-18', reason: ' Lễ ' };
  const actor = { id: 'owner-id', email: 'owner@salon.vn', role: Role.OWNER };
  const holidayRepo = {
    create: jest.fn((input: Partial<SalonHoliday>) => input),
    save: jest.fn(async (input: Partial<SalonHoliday>) => ({ ...input, id: 'holiday-id' })),
  };
  const audit = { write: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HolidaysController],
      providers: [
        WorkingHoursService,
        { provide: getRepositoryToken(SalonWorkingHour), useValue: {} },
        { provide: getRepositoryToken(SalonHoliday), useValue: holidayRepo },
        { provide: getRepositoryToken(Appointment), useValue: {} },
        { provide: AuditService, useValue: audit },
      ],
    }).overrideGuard(RolesGuard).useValue({ canActivate: () => true }).compile();
    service = module.get(WorkingHoursService);
    app = module.createNestApplication({ logger: false });
    app.use((req: { user: typeof actor }, _res: unknown, next: () => void) => {
      req.user = actor;
      next();
    });
    app.useGlobalInterceptors(new AuditLogInterceptor(module.get(Reflector), module.get(AuditService)));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(service, 'previewHolidayImpact').mockResolvedValue({ affected: 1, codes: ['APPT01'] });
  });

  afterAll(async () => { await app.close(); });

  it('warning does not save a holiday or emit a creation audit', async () => {
    const res = await request(app.getHttpServer()).post('/holidays').send({ ...dto, force: false }).expect(201);
    expect(res.body).toMatchObject({ warning: expect.any(String), affected: 1, codes: ['APPT01'] });
    expect(holidayRepo.save).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('confirmation after warning saves once and emits exactly one audit with the persisted id', async () => {
    await request(app.getHttpServer()).post('/holidays').send(dto).expect(201);
    const res = await request(app.getHttpServer()).post('/holidays').send({ ...dto, force: true }).expect(201);
    expect(res.body).toMatchObject({ id: 'holiday-id', reason: 'Lễ' });
    expect(holidayRepo.save).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
      action: AuditAction.CREATE, entityType: 'salon_holiday', entityId: res.body.id,
      changes: { ...dto, force: true },
    }));
  });

  it('no affected appointments saves and audits without confirmation', async () => {
    jest.spyOn(service, 'previewHolidayImpact').mockResolvedValue({ affected: 0, codes: [] });
    await request(app.getHttpServer()).post('/holidays').send(dto).expect(201);
    expect(holidayRepo.save).toHaveBeenCalledWith({ startDate: dto.startDate, endDate: dto.endDate, reason: 'Lễ' });
    expect(audit.write).toHaveBeenCalledTimes(1);
  });

  it('failed persistence does not emit a creation audit', async () => {
    holidayRepo.save.mockRejectedValueOnce(new Error('Persistence failed'));
    await request(app.getHttpServer()).post('/holidays').send({ ...dto, force: true }).expect(500);
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('invalid date range neither saves nor audits', async () => {
    await request(app.getHttpServer()).post('/holidays').send({ ...dto, endDate: '2026-10-17' }).expect(400);
    expect(holidayRepo.save).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });
});
