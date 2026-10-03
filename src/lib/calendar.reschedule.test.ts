import { describe, expect, it } from 'vitest';
import { GoogleCalendarService, parseStudySessions } from './calendar';
import { GoogleCalendarEvent } from '../types';

function event(id: string, date: string, group = 'plan', allDay = false): GoogleCalendarEvent {
  const endDate = new Date(date + 'T12:00:00Z');
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  return {
    id, summary: 'Study',
    start: allDay ? { date } : { dateTime: date + 'T09:00:00+07:00', timeZone: 'Asia/Bangkok' },
    end: allDay ? { date: endDate.toISOString().slice(0, 10) } : { dateTime: date + 'T10:30:00+07:00', timeZone: 'Asia/Bangkok' },
    extendedProperties: { private: { appId: 'law-srs-app-v1', [`g_${group}`]: 'true', [`sess_${group}`]: 'crim:288', sec_crim: '288' } },
  };
}

// Stateful Calendar API fake: PATCH merges private properties; null deletes keys.
function calendar(initial: GoogleCalendarEvent[], pageSize = 2500) {
  const events = new Map(initial.map(e => [e.id, structuredClone(e)]));
  const writes: { method: string; id: string; body: any }[] = [];
  let failWrite = 0;
  let nextId = 0;
  const fetchFn: typeof fetch = async (input, options) => {
    const url = new URL(String(input));
    const method = options?.method || 'GET';
    const id = url.pathname.split('/events/')[1] || '';
    const body = options?.body ? JSON.parse(String(options.body)) : undefined;
    if (method !== 'GET') {
      writes.push({ method, id, body });
      if (failWrite && writes.length === failWrite) return new Response(JSON.stringify({ error: { message: 'Injected failure' } }), { status: 500 });
    }
    if (method === 'PATCH') {
      const old = events.get(id)!;
      const props = { ...old.extendedProperties?.private, ...body.extendedProperties?.private };
      for (const k of Object.keys(props)) if (props[k] === null) delete props[k];
      const updated = { ...old, ...body, extendedProperties: { private: props } };
      events.set(id, updated);
      return Response.json(updated);
    }
    if (method === 'POST') {
      const created = { ...body, id: `new-${++nextId}` };
      events.set(created.id, created);
      return Response.json(created);
    }
    if (method === 'DELETE') {
      events.delete(id);
      return new Response(null, { status: 204 });
    }
    let items = [...events.values()];
    for (const filter of url.searchParams.getAll('privateExtendedProperty')) {
      const [key, value] = filter.split('=');
      items = items.filter(e => e.extendedProperties?.private?.[key] === value);
    }
    const min = url.searchParams.get('timeMin');
    const max = url.searchParams.get('timeMax');
    items = items.filter(e => {
      const start = new Date(e.start.dateTime || e.start.date!).getTime();
      const end = new Date(e.end.dateTime || e.end.date!).getTime();
      return (!min || end > Date.parse(min)) && (!max || start < Date.parse(max));
    });
    const offset = Number(url.searchParams.get('pageToken') || 0);
    return Response.json({ items: items.slice(offset, offset + pageSize), ...(offset + pageSize < items.length ? { nextPageToken: String(offset + pageSize) } : {}) });
  };
  return { events, writes, fetchFn, service: new GoogleCalendarService({ token: 'test-token', fetchFn }), failAt: (n: number) => { failWrite = n; } };
}

function planDates(api: ReturnType<typeof calendar>) {
  return parseStudySessions([...api.events.values()]).find(s => s.groupId === 'plan')?.dates;
}

const oldDates = ['2026-06-01', '2026-06-03', '2026-06-08', '2026-07-01'];
const initial = () => oldDates.map((d, i) => event(`ev-${i}`, d));
const newStart = () => new Date(2026, 6, 10, 12);
const expected = ['2026-07-10', '2026-07-12', '2026-07-17', '2026-08-09'];

describe('editing a plan start date', () => {
  it('moves all four milestones, updates sections, and preserves event IDs, time, duration and timezone', async () => {
    const api = calendar(initial());
    await api.service.updateSRSSchedule('plan', 'crim', '288,289', undefined, newStart());
    expect(planDates(api)).toEqual(expected);
    expect([...api.events.keys()].sort()).toEqual(['ev-0', 'ev-1', 'ev-2', 'ev-3']);
    for (const e of api.events.values()) {
      expect(e.start.dateTime).toBe(e.start.dateTime?.slice(0, 10) + 'T09:00:00');
      expect(e.end.dateTime).toBe(e.end.dateTime?.slice(0, 10) + 'T10:30:00');
      expect(e.start.timeZone).toBe('Asia/Bangkok');
      expect(e.extendedProperties?.private?.sess_plan).toBe('crim:288, 289');
      expect(e.summary).toContain('288, 289');
    }
    expect(api.writes.every(w => w.method === 'PATCH')).toBe(true);
  });

  it('splits shared source events and merges existing destination events without moving other plans', async () => {
    const shared = initial().map(e => ({ ...e, extendedProperties: { private: { ...e.extendedProperties!.private, g_other: 'true', sess_other: 'civ:420', sec_civ: '420' } } }));
    const api = calendar([...shared, event('destination', expected[0], 'destination')]);
    await api.service.updateSRSSchedule('plan', 'crim', '300', undefined, newStart());
    expect(planDates(api)).toEqual(expected);
    expect(api.events.size).toBe(8);
    for (let i = 0; i < 4; i++) {
      const e = api.events.get(`ev-${i}`)!;
      expect(e.start.dateTime?.slice(0, 10)).toBe(oldDates[i]);
      expect(e.extendedProperties?.private?.sess_other).toBe('civ:420');
      expect(e.extendedProperties?.private?.sess_plan).toBeUndefined();
      expect(e.extendedProperties?.private?.sec_crim).toBeUndefined();
      expect(e.summary).toContain('420');
    }
    expect(api.events.get('destination')?.extendedProperties?.private?.sess_destination).toBe('crim:288');
    expect(api.events.get('destination')?.extendedProperties?.private?.sess_plan).toBe('crim:300');
  });

  it('handles old/new milestone overlap and repeated saves without duplicate sessions', async () => {
    const api = calendar(initial());
    const date = new Date(2026, 5, 3, 12);
    await api.service.updateSRSSchedule('plan', 'crim', '300', undefined, date);
    await api.service.updateSRSSchedule('plan', 'crim', '300', undefined, date);
    expect(planDates(api)).toEqual(['2026-06-03', '2026-06-05', '2026-06-10', '2026-07-03']);
    expect(api.events.size).toBe(4);
    expect(api.writes.filter(w => w.method === 'POST')).toHaveLength(0);
  });

  it('preserves all-day exclusive end dates across year boundaries and reads every page', async () => {
    const api = calendar(oldDates.map((d, i) => event(`ev-${i}`, d, 'plan', true)), 2);
    await api.service.updateSRSSchedule('plan', 'crim', '300', undefined, new Date(2026, 11, 31, 12));
    expect(planDates(api)).toEqual(['2026-12-31', '2027-01-02', '2027-01-07', '2027-01-30']);
    for (const e of api.events.values()) {
      expect(e.start.dateTime).toBeUndefined();
      expect(Date.parse(e.end.date!) - Date.parse(e.start.date!)).toBe(86400000);
    }
  });

  it('leaves event dates untouched when only sections are edited', async () => {
    const api = calendar(initial());
    await api.service.updateSRSSchedule('plan', 'crim', '300');
    expect(planDates(api)).toEqual(oldDates);
    expect(api.writes.every(w => !w.body.start && !w.body.end)).toBe(true);
  });

  it('keeps shared originals until every new date has been saved and supports retry after partial failure', async () => {
    const shared = initial().map(e => ({ ...e, extendedProperties: { private: { ...e.extendedProperties!.private, g_other: 'true', sess_other: 'civ:420' } } }));
    const api = calendar(shared);
    api.failAt(2);
    await expect(api.service.updateSRSSchedule('plan', 'crim', '300', undefined, newStart())).rejects.toThrow('Injected failure');
    for (let i = 0; i < 4; i++) expect(api.events.get(`ev-${i}`)?.extendedProperties?.private?.sess_plan).toBe('crim:288');
    api.failAt(0);
    await api.service.updateSRSSchedule('plan', 'crim', '300', undefined, newStart());
    expect(planDates(api)).toEqual(expected);
    expect(api.events.size).toBe(8);
  });

  it('rejects an invalid date without contacting Calendar', async () => {
    const api = calendar(initial());
    await expect(api.service.updateSRSSchedule('plan', 'crim', '300', undefined, new Date('invalid'))).rejects.toThrow();
    expect(api.writes).toHaveLength(0);
  });

  it('recalculates legacy +5 schedules to the current cycle when moving backwards', async () => {
    const api = calendar(['2026-06-01', '2026-06-03', '2026-06-06', '2026-07-01'].map((d, i) => event(`ev-${i}`, d)));
    await api.service.updateSRSSchedule('plan', 'crim', '300', undefined, new Date(2026, 4, 1, 12));
    expect(planDates(api)).toEqual(['2026-05-01', '2026-05-03', '2026-05-08', '2026-05-31']);
    expect(api.events.size).toBe(4);
  });

  it('lets Calendar resolve DST for named zones and retains offsets for fixed-zone events', async () => {
    const fixtures = initial();
    fixtures[0].start = { dateTime: oldDates[0] + 'T09:00:00-04:00', timeZone: 'America/New_York' };
    fixtures[0].end = { dateTime: oldDates[0] + 'T10:30:00-04:00', timeZone: 'America/New_York' };
    fixtures[1].start = { dateTime: oldDates[1] + 'T09:00:00+07:00' };
    fixtures[1].end = { dateTime: oldDates[1] + 'T10:30:00+07:00' };
    const api = calendar(fixtures);
    await api.service.updateSRSSchedule('plan', 'crim', '300', undefined, new Date(2026, 11, 1, 12));
    expect(api.events.get('ev-0')?.start).toEqual({ dateTime: '2026-12-01T09:00:00', timeZone: 'America/New_York' });
    expect(api.events.get('ev-1')?.start.dateTime).toBe('2026-12-03T09:00:00+07:00');
  });

  it('does not report success when Calendar readback disagrees with the writes', async () => {
    let reads = 0;
    const api = calendar(initial());
    const transport = api.fetchFn;
    const service = new GoogleCalendarService({ token: 'test-token', fetchFn: async (input, options) => {
      if (!options?.method && String(input).includes('g_plan')) {
        reads++;
        if (reads > 1) return Response.json({ items: initial() });
      }
      return transport(input, options);
    } });
    await expect(service.updateSRSSchedule('plan', 'crim', '300', undefined, newStart())).rejects.toThrow('ตรวจสอบการซิงก์ปฏิทินไม่สำเร็จ');
    expect(planDates(api)).toEqual(expected);
  });

  it('reports a missing plan rather than claiming a successful edit', async () => {
    const api = calendar([]);
    await expect(api.service.updateSRSSchedule('missing', 'crim', '300', undefined, newStart())).rejects.toThrow();
    expect(api.writes).toHaveLength(0);
  });
});
