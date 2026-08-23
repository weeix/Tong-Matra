import { GoogleCalendarEvent, LawCategory, LAW_CATEGORIES, getCategoryConfig } from '../types';

/**
 * Interface representing options to initialize the GoogleCalendarService
 */
export interface CalendarServiceOptions {
  token: string;
  fetchFn?: typeof fetch;
}

/**
 * GoogleCalendarService encapsulates all API transactions and operations
 * while supporting constructor-based Dependency Injection for HTTP requests.
 */
export class GoogleCalendarService {
  private token: string;
  private fetchFn: typeof fetch;

  constructor(options: CalendarServiceOptions) {
    this.token = options.token;
    // Fallback to standard context-bound global fetch if not explicitly injected
    this.fetchFn = options.fetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : (globalThis.fetch || fetch));
  }

  /**
   * Perform an authorized fetch call with OAuth token injected in headers
   */
  async authorizedFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };

    const response = await this.fetchFn(url, { ...options, headers });
    
    if (!response.ok) {
      const text = await response.text();
      let errorMsg = `Google Calendar API error (${response.status})`;
      try {
        const parsed = JSON.parse(text);
        if (parsed.error?.message) {
          errorMsg += `: ${parsed.error.message}`;
        }
      } catch {
        errorMsg += `: ${text}`;
      }
      throw new Error(errorMsg);
    }

    if (response.status === 204) {
      return null as any;
    }

    return response.json();
  }

  /**
   * Fetches all events containing the App Metadata
   */
  async fetchAppEvents(): Promise<GoogleCalendarEvent[]> {
    // Query starting 60 days in the past
    const timeMin = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    // Request all active app events using our unique appId filter
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=appId=law-srs-app-v1&singleEvents=true&timeMin=${encodeURIComponent(timeMin)}&maxResults=2500`;
    
    const result = await this.authorizedFetch(url);
    return result.items || [];
  }

  /**
   * Create or upgrade schedules for Day 0, Day +2, Day +7, Day +30
   */
  async syncSRSSchedule(
    category: LawCategory,
    sections: string,
    startDate: Date,
    onProgress?: (step: string) => void
  ): Promise<string> {
    const groupId = generateUUID();
    const offsets = [0, 2, 7, 30];
    const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const normalizedSections = normalizeSections(sections);

    for (let i = 0; i < offsets.length; i++) {
      const offset = offsets[i];
      const targetDate = new Date(startDate);
      targetDate.setDate(targetDate.getDate() + offset);
      
      const dateStr = formatDateISO(targetDate);
      onProgress?.(`กำลังบันทึกวันทบทวนรอบ Day +${offset} (${dateStr})...`);

      // Boundaries of that day
      const timeMin = `${dateStr}T00:00:00Z`;
      const timeMax = `${dateStr}T23:59:59Z`;

      // Query overlapping events
      const queryUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=appId=law-srs-app-v1&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true`;
      const queryResult = await this.authorizedFetch(queryUrl);
      const existingEvents: GoogleCalendarEvent[] = queryResult.items || [];

      if (existingEvents.length > 0) {
        // Scenario B: Overlapping Event Exists -> Update matching event
        const event = existingEvents[0];
        const privateProps = { ...(event.extendedProperties?.private || {}) } as Record<string, string>;

        // Track session and add identifiers
        privateProps[`g_${groupId}`] = 'true';
        privateProps[`sess_${groupId}`] = `${category}:${normalizedSections}`;

        // Refresh sec_* based on instructions
        const keySuffix = `sec_${category}`;
        const previousValue = privateProps[keySuffix];
        if (previousValue) {
          privateProps[keySuffix] = normalizeSections(`${previousValue}, ${normalizedSections}`);
        } else {
          privateProps[keySuffix] = normalizedSections;
        }

        // Refresh summary & description based on updated values
        const { summary, description } = generateEventDetails(privateProps);

        const updateBody = {
          summary,
          description,
          extendedProperties: {
            private: privateProps,
          },
        };

        const updateUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.id}`;
        await this.authorizedFetch(updateUrl, {
          method: 'PATCH',
          body: JSON.stringify(updateBody),
        });
      } else {
        // Scenario A: No Overlapping Event -> Create a new Event
        const startISO = `${dateStr}T09:00:00`;
        const endISO = `${dateStr}T10:00:00`;

        const privateProps: Record<string, string> = {
          appId: 'law-srs-app-v1',
          [`g_${groupId}`]: 'true',
          [`sess_${groupId}`]: `${category}:${normalizedSections}`,
          [`sec_${category}`]: normalizedSections,
        };

        const { summary, description } = generateEventDetails(privateProps);

        const createBody = {
          summary,
          description,
          start: {
            dateTime: startISO,
            timeZone: localTimeZone,
          },
          end: {
            dateTime: endISO,
            timeZone: localTimeZone,
          },
          extendedProperties: {
            private: privateProps,
          },
        };

        const createUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events`;
        await this.authorizedFetch(createUrl, {
          method: 'POST',
          body: JSON.stringify(createBody),
        });
      }
    }

    return groupId;
  }

  /**
   * Execute Cascade Delete Workflow
   */
  async deleteSRSSchedule(
    groupId: string,
    category: LawCategory,
    onProgress?: (msg: string) => void
  ): Promise<void> {
    onProgress?.('กำลังค้นหากิจกรรมบนปฏิทิน...');
    
    // Find all events sharing this groupId
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=g_${groupId}=true&singleEvents=true`;
    const result = await this.authorizedFetch(url);
    const matchedEvents: GoogleCalendarEvent[] = result.items || [];

    if (matchedEvents.length === 0) {
      onProgress?.('ไม่พบกิจกรรมทบทวนที่ตรงกันในปฏิทินของคุณ');
      return;
    }

    onProgress?.(`พบ ${matchedEvents.length} วันกิจกรรม. กำลังดำเนินการลบแบบตามลำดับ (Cascade)...`);

    for (let idx = 0; idx < matchedEvents.length; idx++) {
      const event = matchedEvents[idx];
      const privateProps = { ...(event.extendedProperties?.private || {}) } as Record<string, string>;

      // Count how many total active sessions are in this day event
      const activeSessions = Object.keys(privateProps).filter(k => k.startsWith('sess_'));

      if (activeSessions.length <= 1) {
        // It contains *only* the sections tied to this specific session! Delete the entire event.
        onProgress?.(`กำลังลบกิจกรรมในปฏิทินวันที่ ${event.start?.dateTime?.split('T')[0] || event.start?.date}...`);
        const deleteUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.id}`;
        await this.authorizedFetch(deleteUrl, { method: 'DELETE' });
      } else {
        // The event contains other overlapping sessions! Remove only this series key/reference.
        onProgress?.(`กำลังปรับปรุงข้อมูลซ้ำซ้อนวันที่ ${event.start?.dateTime?.split('T')[0] || event.start?.date}...`);
        
        // Delete the specific tracking elements
        delete privateProps[`g_${groupId}`];
        delete privateProps[`sess_${groupId}`];

        // Recalculate sec_* keys using surviving sessions
        const cleanProps: Record<string, string> = {
          appId: 'law-srs-app-v1',
        };

        // Recopy other groups
        for (const k of Object.keys(privateProps)) {
          if (k.startsWith('g_') || k.startsWith('sess_')) {
            cleanProps[k] = privateProps[k];
          }
        }

        // Re-populate clean sec_* properties from surviving sessions
        const { summary, description, sectionsByCat } = generateEventDetails(cleanProps);

        // Populate sec_ keys properly
        for (const catKey of Object.keys(LAW_CATEGORIES)) {
          const cat = catKey as LawCategory;
          const items = sectionsByCat[cat];
          if (items && items.length > 0) {
            cleanProps[`sec_${cat}`] = items.join(', ');
          }
        }

        // Any key in the original event's private property that is NOT in cleanProps
        // must be explicitly set to null to delete it via PATCH merge
        const patchProps: Record<string, string | null> = { ...cleanProps };
        const originalPrivate = event.extendedProperties?.private || {};
        for (const k of Object.keys(originalPrivate)) {
          if (!(k in cleanProps)) {
            patchProps[k] = null;
          }
        }

        const updateBody = {
          summary,
          description,
          extendedProperties: {
            private: patchProps,
          },
        };

        const updateUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.id}`;
        await this.authorizedFetch(updateUrl, {
          method: 'PATCH',
          body: JSON.stringify(updateBody),
        });
      }
    }

    onProgress?.('ลบแผนการเรียนรู้และปรับปรุงกิจกรรมสำเร็จเรียบร้อย!');
  }

  /**
   * Update the statute-section list for an existing study plan across all of
   * its Google Calendar revision-day events.
   */
  async updateSRSSchedule(
    groupId: string,
    category: LawCategory,
    newSections: string,
    onProgress?: (msg: string) => void
  ): Promise<void> {
    onProgress?.('กำลังค้นหากิจกรรมบนปฏิทิน...');

    const normalizedSections = normalizeSections(newSections);

    // Find all events sharing this groupId
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=g_${groupId}=true&singleEvents=true`;
    const result = await this.authorizedFetch(url);
    const matchedEvents: GoogleCalendarEvent[] = result.items || [];

    if (matchedEvents.length === 0) {
      onProgress?.('ไม่พบกิจกรรมทบทวนที่ตรงกันในปฏิทินของคุณ');
      return;
    }

    onProgress?.(`พบ ${matchedEvents.length} วันกิจกรรม. กำลังปรับปรุงข้อมูลมาตรา...`);

    for (let idx = 0; idx < matchedEvents.length; idx++) {
      const event = matchedEvents[idx];
      const privateProps = { ...(event.extendedProperties?.private || {}) } as Record<string, string>;

      // Update this session's stored sections
      privateProps[`sess_${groupId}`] = `${category}:${normalizedSections}`;

      // Rebuild clean props (g_*, sess_*) from surviving sessions
      const cleanProps: Record<string, string> = {
        appId: 'law-srs-app-v1',
      };

      for (const k of Object.keys(privateProps)) {
        if (k.startsWith('g_') || k.startsWith('sess_')) {
          cleanProps[k] = privateProps[k];
        }
      }

      // Recompute summary/description and sec_* aggregates from surviving sessions
      const { summary, description, sectionsByCat } = generateEventDetails(cleanProps);

      for (const catKey of Object.keys(sectionsByCat)) {
        const cat = catKey as LawCategory;
        const items = sectionsByCat[cat];
        if (items && items.length > 0) {
          cleanProps[`sec_${cat}`] = items.join(', ');
        }
      }

      // Any key in the original event's private property that is NOT in cleanProps
      // must be explicitly set to null to delete it via PATCH merge
      const patchProps: Record<string, string | null> = { ...cleanProps };
      const originalPrivate = event.extendedProperties?.private || {};
      for (const k of Object.keys(originalPrivate)) {
        if (!(k in cleanProps)) {
          patchProps[k] = null;
        }
      }

      const updateBody = {
        summary,
        description,
        extendedProperties: {
          private: patchProps,
        },
      };

      onProgress?.(`กำลังปรับปรุงข้อมูลวันที่ ${event.start?.dateTime?.split('T')[0] || event.start?.date}...`);

      const updateUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.id}`;
      await this.authorizedFetch(updateUrl, {
        method: 'PATCH',
        body: JSON.stringify(updateBody),
      });
    }

    onProgress?.('ปรับปรุงแผนการเรียนรู้สำเร็จเรียบร้อย!');
  }

  /**
   * Migrate a legacy-cycle plan's mid-term review event from Day +5 to
   * Day +7 (the new cycle).
   *
   * - If the +5 event holds ONLY this plan's session: move it in place via a
   *   single PATCH (keeps the same eventId; preserves any manual edits).
   * - If the +5 event is SHARED with other plans/sessions: leave it untouched
   *   and create a fresh +7 event carrying only this session, then strip this
   *   session from the shared +5 event (same merge semantics as cascade delete).
   * - Idempotent: if no +5 mid-term event exists anymore, this is a no-op.
   */
  async migratePlanCycle(
    groupId: string,
    category: LawCategory,
    startDate: Date,
    onProgress?: (msg: string) => void
  ): Promise<void> {
    onProgress?.('กำลังค้นหากิจกรรมบนปฏิทิน...');

    // Locate the plan's mid-term (+5) event among its own events.
    const findUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=g_${groupId}=true&singleEvents=true&maxResults=2500`;
    const findResult = await this.authorizedFetch(findUrl);
    const matchedEvents: GoogleCalendarEvent[] = findResult.items || [];

    const startMs = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
    const legacyDate = new Date(startMs);
    legacyDate.setDate(legacyDate.getDate() + LEGACY_CYCLE_OFFSET);
    const legacyDateStr = formatDateISO(legacyDate);

    const targetEvent = matchedEvents.find((ev) => {
      let evDateStr = '';
      if (ev.start?.dateTime) evDateStr = ev.start.dateTime.split('T')[0];
      else if (ev.start?.date) evDateStr = ev.start.date;
      return evDateStr === legacyDateStr;
    });

    if (!targetEvent) {
      // Already migrated, or user deleted the +5 event manually — nothing to do.
      onProgress?.('ไม่พบกิจกรรมรอบเก่าที่ต้องย้าย (อาจถูกย้ายไปแล้ว)');
      return;
    }

    const privateProps = { ...(targetEvent.extendedProperties?.private || {}) } as Record<string, string>;
    const sessionValue = privateProps[`sess_${groupId}`] || `${category}:`;
    const normalizedSections = normalizeSections(sessionValue.includes(':') ? sessionValue.split(/:(.*)/s)[1] || '' : '');
    const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const otherSessionKeys = Object.keys(privateProps).filter((k) => k.startsWith('sess_') && k !== `sess_${groupId}`);

    if (otherSessionKeys.length === 0) {
      // Sole occupant -> move the whole event to Day +7 with one PATCH.
      const newMidDate = new Date(startMs);
      newMidDate.setDate(newMidDate.getDate() + CURRENT_CYCLE_OFFSET);
      const newDateStr = formatDateISO(newMidDate);

      onProgress?.(`กำลังย้ายวันทบทวนรอบกลางจาก Day +${LEGACY_CYCLE_OFFSET} เป็น Day +${CURRENT_CYCLE_OFFSET} (${newDateStr})...`);

      const startISO = `${newDateStr}T09:00:00`;
      const endISO = `${newDateStr}T10:00:00`;
      await this.authorizedFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${targetEvent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          start: { dateTime: startISO, timeZone: localTimeZone },
          end: { dateTime: endISO, timeZone: localTimeZone },
        }),
      });
      onProgress?.('ย้ายรอบการทบทวนสำเร็จเรียบร้อย!');
      return;
    }

    // Shared with other sessions -> split:
    // 1) Create a new +7 event for just this session.
    const newMidDate = new Date(startMs);
    newMidDate.setDate(newMidDate.getDate() + CURRENT_CYCLE_OFFSET);
    const newDateStr = formatDateISO(newMidDate);

    onProgress?.(`วันที่ +${LEGACY_CYCLE_OFFSET} ถูกใช้ร่วมกับแผนอื่น กำลังสร้างกิจกรรมใหม่วันที่ ${newDateStr} สำหรับแผนนี้...`);

    const newProps: Record<string, string> = {
      appId: 'law-srs-app-v1',
      [`g_${groupId}`]: 'true',
      [`sess_${groupId}`]: sessionValue,
      [`sec_${category}`]: normalizedSections,
    };
    const { summary: newSummary, description: newDescription } = generateEventDetails(newProps);

    await this.authorizedFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
      method: 'POST',
      body: JSON.stringify({
        summary: newSummary,
        description: newDescription,
        start: { dateTime: `${newDateStr}T09:00:00`, timeZone: localTimeZone },
        end: { dateTime: `${newDateStr}T10:00:00`, timeZone: localTimeZone },
        extendedProperties: { private: newProps },
      }),
    });

    // 2) Strip this session from the shared +5 event (null out removed props).
    onProgress?.('กำลังถอนแผนนี้ออกจากกิจกรรมวันที่ +5 ที่ใช้ร่วมกับแผนอื่น...');

    delete privateProps[`g_${groupId}`];
    delete privateProps[`sess_${groupId}`];

    const cleanProps: Record<string, string | null> = {
      appId: 'law-srs-app-v1',
    };
    for (const k of Object.keys(privateProps)) {
      if (k.startsWith('g_') || k.startsWith('sess_')) {
        cleanProps[k] = privateProps[k];
      }
    }

    const { summary, description, sectionsByCat } = generateEventDetails(cleanProps as Record<string, string>);
    for (const catKey of Object.keys(LAW_CATEGORIES)) {
      const cat = catKey as LawCategory;
      const items = sectionsByCat[cat];
      if (items && items.length > 0) {
        cleanProps[`sec_${cat}`] = items.join(', ');
      }
    }
    const originalPrivate = targetEvent.extendedProperties?.private || {};
    for (const k of Object.keys(originalPrivate)) {
      if (!(k in cleanProps)) {
        cleanProps[k] = null;
      }
    }

    await this.authorizedFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${targetEvent.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        summary,
        description,
        extendedProperties: { private: cleanProps },
      }),
    });

    onProgress?.('ย้ายรอบการทบทวนสำเร็จเรียบร้อย!');
  }
}

/**
 * UUIDv4 generator for browser environments
 */
export function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Standardize YYYY-MM-DD local dates
 */
export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalize a raw statute-section list so that every comma is followed by a
 * single space. This keeps word-selection/tokenization ('ตัดคำ') on statute
 * numbers working correctly downstream.
 *
 * Examples:
 *   '288,289'       -> '288, 289'
 *   '288 , 289'     -> '288, 289'
 *   '288, 289,300'  -> '288, 289, 300'
 *   '288,,289'      -> '288, 289'
 *   '288, '         -> '288'
 */
export function normalizeSections(raw: string): string {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(', ');
}

export interface LawSessionDetail {
  groupId: string;
  category: LawCategory;
  sections: string;
  dates: string[]; // YYYY-MM-DD values
  createdDate: string; // The Day 0 date
}

/** Mid-term review cycle offsets supported by migration (old -> new). */
export const LEGACY_CYCLE_OFFSET = 5;
export const CURRENT_CYCLE_OFFSET = 7;

/**
 * Compute the day offset between an event date and a plan's Day-0 date.
 */
export function dayOffsetFromStart(dateStr: string, createdDateStr: string): number {
  return Math.round(
    (new Date(dateStr + 'T12:00:00').getTime() - new Date(createdDateStr + 'T12:00:00').getTime()) / 86400000
  );
}

/**
 * Detect legacy-cycle plans (mid-term review scheduled at Day +5 instead of
 * Day +7) from already-fetched events — no extra API calls needed.
 * Returns the groupIds of plans that still have their mid-term event on +5
 * and nothing on +7. Tolerant of partially-deleted plans.
 */
export function findLegacyCycleGroupIds(
  events: GoogleCalendarEvent[],
  sessions: LawSessionDetail[]
): string[] {
  const result: string[] = [];

  for (const sess of sessions) {
    const hasLegacyMid = sess.dates.some((d) => {
      const offset = dayOffsetFromStart(d, sess.createdDate);
      // Guard: only treat dates near the mid-term window as the cycle slot,
      // so unrelated manually-added events don't create false positives.
      return offset >= LEGACY_CYCLE_OFFSET && offset < CURRENT_CYCLE_OFFSET;
    });
    if (!hasLegacyMid) continue;

    const hasCurrentMid = sess.dates.some((d) => {
      const offset = dayOffsetFromStart(d, sess.createdDate);
      return offset >= CURRENT_CYCLE_OFFSET && offset < CURRENT_CYCLE_OFFSET + 3;
    });
    if (!hasCurrentMid) {
      result.push(sess.groupId);
    }
  }

  return result;
}

/**
 * Parse calendars events to identify all distinct rep sessions
 */
export function parseStudySessions(events: GoogleCalendarEvent[]): LawSessionDetail[] {
  const sessionMap: Record<string, {
    groupId: string;
    category: LawCategory;
    sections: string;
    dates: string[];
  }> = {};

  for (const event of events) {
    const privateProps = event.extendedProperties?.private;
    if (!privateProps || privateProps.appId !== 'law-srs-app-v1') {
      continue;
    }

    // Identify start date formatted YYYY-MM-DD
    let eventDateString = '';
    if (event.start?.dateTime) {
      eventDateString = event.start.dateTime.split('T')[0];
    } else if (event.start?.date) {
      eventDateString = event.start.date;
    }

    if (!eventDateString) continue;

    // Scan for session IDs in this event
    for (const key of Object.keys(privateProps)) {
      if (key.startsWith('sess_')) {
        const groupId = key.substring(5); // Get groupId
        const storedValue = privateProps[key] || '';
        const delimiterIdx = storedValue.indexOf(':');
        
        if (delimiterIdx !== -1) {
          const category = storedValue.substring(0, delimiterIdx) as LawCategory;
          const sections = storedValue.substring(delimiterIdx + 1);

          if (!sessionMap[groupId]) {
            sessionMap[groupId] = {
              groupId,
              category,
              sections,
              dates: [],
            };
          }

          if (!sessionMap[groupId].dates.includes(eventDateString)) {
            sessionMap[groupId].dates.push(eventDateString);
          }
        }
      }
    }
  }

  // Turn map into list, sorting dates so Day 0 is first (createdDate)
  return Object.values(sessionMap).map((sess) => {
    const sortedDates = [...sess.dates].sort();
    return {
      ...sess,
      dates: sortedDates,
      createdDate: sortedDates[0] || formatDateISO(new Date()),
    };
  }).sort((a, b) => b.createdDate.localeCompare(a.createdDate)); // Newest first
}

/**
 * Re-creates Event Summary (Title) and Description based on active private props
 */
export function generateEventDetails(privateProperties: Record<string, string>) {
  const sectionsByCat: Partial<Record<LawCategory, string[]>> = {};

  // Scan private props for active segments
  for (const key of Object.keys(privateProperties)) {
    if (key.startsWith('sess_')) {
      const storedValue = privateProperties[key] || '';
      const delimiterIdx = storedValue.indexOf(':');
      if (delimiterIdx !== -1) {
        const category = storedValue.substring(0, delimiterIdx) as LawCategory;
        const sections = storedValue.substring(delimiterIdx + 1);
        
        if (!sectionsByCat[category]) {
          sectionsByCat[category] = [];
        }
        if (!sectionsByCat[category]?.includes(sections)) {
          sectionsByCat[category]?.push(sections);
        }
      }
    }
  }

  // Re-build clean comma-separated texts for other active parts
  const listItems: string[] = [];
  const summaryParts: string[] = [];

  for (const catKey of Object.keys(sectionsByCat)) {
    const cat = catKey as LawCategory;
    const items = sectionsByCat[cat];
    if (items && items.length > 0) {
      const combinedSecs = items.join(', ');
      const config = getCategoryConfig(cat);
      summaryParts.push(`${config.name} ม. ${combinedSecs}`);
      listItems.push(`• ${config.name} มาตรา: ${combinedSecs}`);
    }
  }

  const summary = summaryParts.length > 0 
    ? `[ทบทวนกฎหมาย] ${summaryParts.join(' | ')}`
    : `[ทบทวนกฎหมาย]`;

  const description = `📅 ตารางทบทวนกฎหมาย (ระบบความจำระยะยาว Spaced Repetition)\n\nกรุณาทบทวนประมวลกฎหมายตามมาตราต่อไปนี้ในวันนี้:\n${listItems.join('\n')}\n\nจัดทำตารางโดยแอป "Tong Matra (ท่องมาตรา)"`;

  return { summary, description, sectionsByCat };
}

/**
 * ADAPTER WRAAPERS (Maintaining functional backward-compatibility)
 */

export async function fetchAppEvents(token: string): Promise<GoogleCalendarEvent[]> {
  const service = new GoogleCalendarService({ token });
  return service.fetchAppEvents();
}

export async function syncSRSSchedule(
  token: string,
  category: LawCategory,
  sections: string,
  startDate: Date,
  onProgress?: (step: string) => void
): Promise<string> {
  const service = new GoogleCalendarService({ token });
  return service.syncSRSSchedule(category, sections, startDate, onProgress);
}

export async function deleteSRSSchedule(
  token: string,
  groupId: string,
  category: LawCategory,
  onProgress?: (msg: string) => void
): Promise<void> {
  const service = new GoogleCalendarService({ token });
  return service.deleteSRSSchedule(groupId, category, onProgress);
}

export async function updateSRSSchedule(
  token: string,
  groupId: string,
  category: LawCategory,
  newSections: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  const service = new GoogleCalendarService({ token });
  return service.updateSRSSchedule(groupId, category, newSections, onProgress);
}

export async function migratePlanCycle(
  token: string,
  groupId: string,
  category: LawCategory,
  startDate: Date,
  onProgress?: (msg: string) => void
): Promise<void> {
  const service = new GoogleCalendarService({ token });
  return service.migratePlanCycle(groupId, category, startDate, onProgress);
}

