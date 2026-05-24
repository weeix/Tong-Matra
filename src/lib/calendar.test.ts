import { describe, it, expect } from 'vitest';
import { 
  generateUUID, 
  formatDateISO, 
  parseStudySessions, 
  generateEventDetails 
} from './calendar';
import { GoogleCalendarEvent } from '../types';

describe('Calendar Utils', () => {
  describe('generateUUID', () => {
    it('generates a valid matching-length string', () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      expect(uuid1).toHaveLength(36);
      expect(uuid2).toHaveLength(36);
      expect(uuid1).not.toBe(uuid2);
    });

    it('generates a matching UUIDv4 pattern structure', () => {
      const uuid = generateUUID();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });
  });

  describe('formatDateISO', () => {
    it('correctly formats dates with double-digit month/day', () => {
      const date = new Date(2026, 11, 25); // December 25, 2026
      expect(formatDateISO(date)).toBe('2026-12-25');
    });

    it('correctly pads single digit month/day', () => {
      const date = new Date(2026, 4, 3); // May 3, 2026
      expect(formatDateISO(date)).toBe('2026-05-03');
    });
  });

  describe('generateEventDetails', () => {
    it('creates correct event detail representation for single sessions', () => {
      const privateProps = {
        appId: 'law-srs-app-v1',
        g_group123: 'true',
        sess_group123: 'crim:288, 289',
        sec_crim: '288, 289',
      };

      const result = generateEventDetails(privateProps);
      expect(result.summary).toBe('[ทบทวนกฎหมาย] ประมวลกฎหมายอาญา ม. 288, 289');
      expect(result.description).toContain('ประมวลกฎหมายอาญา มาตรา: 288, 289');
      expect(result.sectionsByCat.crim).toEqual(['288, 289']);
    });

    it('handles multiple overlapping sessions and aggregates summary/description properly', () => {
      const privateProps = {
        appId: 'law-srs-app-v1',
        g_group1: 'true',
        sess_group1: 'crim:288',
        g_group2: 'true',
        sess_group2: 'crim:289',
        g_group3: 'true',
        sess_group3: 'civ:420, 421',
      };

      const result = generateEventDetails(privateProps);
      expect(result.summary).toBe('[ทบทวนกฎหมาย] ประมวลกฎหมายอาญา ม. 288, 289 | ประมวลกฎหมายแพ่งและพาณิชย์ ม. 420, 421');
      expect(result.description).toContain('ประมวลกฎหมายอาญา มาตรา: 288, 289');
      expect(result.description).toContain('ประมวลกฎหมายแพ่งและพาณิชย์ มาตรา: 420, 421');
      expect(result.sectionsByCat.crim).toEqual(['288', '289']);
      expect(result.sectionsByCat.civ).toEqual(['420, 421']);
    });

    it('returns default empty array/props if no active sessions are present', () => {
      const privateProps = {
        appId: 'law-srs-app-v1',
      };
      const result = generateEventDetails(privateProps);
      expect(result.summary).toBe('[ทบทวนกฎหมาย]');
      expect(result.sectionsByCat).toEqual({});
    });
  });

  describe('parseStudySessions', () => {
    it('filters out events that do not contain correct appId', () => {
      const dummyEvents: GoogleCalendarEvent[] = [
        {
          id: 'ev1',
          summary: 'Other Event',
          start: { date: '2026-05-24' },
          end: { date: '2026-05-24' },
          extendedProperties: {
            private: {
              appId: 'other-app',
              sess_grp1: 'crim:100',
            }
          }
        }
      ];

      const sessions = parseStudySessions(dummyEvents);
      expect(sessions).toHaveLength(0);
    });

    it('parses valid events into study sessions detail lists cleanly', () => {
      const dummyEvents: GoogleCalendarEvent[] = [
        {
          id: 'ev1',
          summary: '[ทบทวนกฎหมาย] อาญา ม. 100',
          start: { date: '2026-06-01' },
          end: { date: '2026-06-01' },
          extendedProperties: {
            private: {
              appId: 'law-srs-app-v1',
              g_grp1: 'true',
              sess_grp1: 'crim:100, 101',
            }
          }
        },
        {
          id: 'ev2',
          summary: '[ทบทวนกฎหมาย] อาญา ม. 100',
          start: { dateTime: '2026-06-03T09:00:00Z' },
          end: { dateTime: '2026-06-03T10:00:00Z' },
          extendedProperties: {
            private: {
              appId: 'law-srs-app-v1',
              g_grp1: 'true',
              sess_grp1: 'crim:100, 101',
            }
          }
        }
      ];

      const sessions = parseStudySessions(dummyEvents);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].groupId).toBe('grp1');
      expect(sessions[0].category).toBe('crim');
      expect(sessions[0].sections).toBe('100, 101');
      expect(sessions[0].dates).toEqual(['2026-06-01', '2026-06-03']);
      expect(sessions[0].createdDate).toBe('2026-06-01');
    });
  });
});
