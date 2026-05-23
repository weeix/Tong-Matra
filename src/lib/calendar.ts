import { GoogleCalendarEvent, LawCategory, LAW_CATEGORIES } from '../types';

/**
 * Perform a general fetch call with OAuth token
 */
async function authorizedFetch(url: string, token: string, options: RequestInit = {}) {
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, { ...options, headers });
  
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
    return null;
  }

  return response.json();
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

export interface LawSessionDetail {
  groupId: string;
  category: LawCategory;
  sections: string;
  dates: string[]; // YYYY-MM-DD values
  createdDate: string; // The Day 0 date
}

/**
 * Fetches all events containing the App Metadata
 */
export async function fetchAppEvents(token: string): Promise<GoogleCalendarEvent[]> {
  // Query starting 60 days in the past
  const timeMin = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  // Request all active app events using our unique appId filter
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=appId=law-srs-app-v1&singleEvents=true&timeMin=${encodeURIComponent(timeMin)}&maxResults=2500`;
  
  const result = await authorizedFetch(url, token);
  return result.items || [];
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

  for (const catKey of Object.keys(LAW_CATEGORIES)) {
    const cat = catKey as LawCategory;
    const items = sectionsByCat[cat];
    if (items && items.length > 0) {
      const combinedSecs = items.join(', ');
      summaryParts.push(`${LAW_CATEGORIES[cat].name} ม. ${combinedSecs}`);
      listItems.push(`• ${LAW_CATEGORIES[cat].name} มาตรา: ${combinedSecs}`);
    }
  }

  const summary = summaryParts.length > 0 
    ? `[ทบทวนกฎหมาย] ${summaryParts.join(' | ')}`
    : `[ทบทวนกฎหมาย]`;

  const description = `📅 ตารางทบทวนกฎหมาย (ระบบความจำระยะยาว Spaced Repetition)\n\nกรุณาทบทวนประมวลกฎหมายตามมาตราต่อไปนี้ในวันนี้:\n${listItems.join('\n')}\n\nจัดทำตารางโดยแอป "ท่องมาตรา" (Tong Matra)`;

  return { summary, description, sectionsByCat };
}

/**
 * Create or upgrade schedules for Day 0, Day +2, Day +5, Day +30
 */
export async function syncSRSSchedule(
  token: string,
  category: LawCategory,
  sections: string,
  startDate: Date,
  onProgress?: (step: string) => void
): Promise<string> {
  const groupId = generateUUID();
  const offsets = [0, 2, 5, 30];
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

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
    const queryResult = await authorizedFetch(queryUrl, token);
    const existingEvents: GoogleCalendarEvent[] = queryResult.items || [];

    if (existingEvents.length > 0) {
      // Scenario B: Overlapping Event Exists -> Update matching event
      const event = existingEvents[0];
      const privateProps = { ...(event.extendedProperties?.private || {}) } as Record<string, string>;

      // Track session and add identifiers
      privateProps[`g_${groupId}`] = 'true';
      privateProps[`sess_${groupId}`] = `${category}:${sections}`;

      // Refresh sec_* based on instructions:
      // "Check if the key sec_[law_suffix] already exists in that event's private property.
      // If it exists: Append the new sections, comma-separated. Otherwise set it."
      const keySuffix = `sec_${category}`;
      const previousValue = privateProps[keySuffix];
      if (previousValue) {
        privateProps[keySuffix] = `${previousValue}, ${sections}`;
      } else {
        privateProps[keySuffix] = sections;
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
      await authorizedFetch(updateUrl, token, {
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
        [`sess_${groupId}`]: `${category}:${sections}`,
        [`sec_${category}`]: sections,
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
      await authorizedFetch(createUrl, token, {
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
export async function deleteSRSSchedule(
  token: string,
  groupId: string,
  category: LawCategory,
  onProgress?: (msg: string) => void
): Promise<void> {
  onProgress?.('กำลังค้นหากิจกรรมบนปฏิทิน...');
  
  // Find all events sharing this groupId
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=g_${groupId}=true&singleEvents=true`;
  const result = await authorizedFetch(url, token);
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
      await authorizedFetch(deleteUrl, token, { method: 'DELETE' });
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
      await authorizedFetch(updateUrl, token, {
        method: 'PATCH',
        body: JSON.stringify(updateBody),
      });
    }
  }

  onProgress?.('ลบแผนการเรียนรู้และปรับปรุงกิจกรรมสำเร็จเรียบร้อย!');
}
