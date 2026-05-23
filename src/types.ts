export type LawCategory = 'crim' | 'civ' | 'crimp' | 'civp';

export interface LawCategoryConfig {
  id: LawCategory;
  name: string;
  color: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
}

export const LAW_CATEGORIES: Record<LawCategory, LawCategoryConfig> = {
  crim: {
    id: 'crim',
    name: 'ประมวลกฎหมายอาญา',
    color: '#ef4444', // Red
    bgClass: 'bg-red-50 text-red-700 border-red-200',
    borderClass: 'border-red-500',
    textClass: 'text-red-600',
  },
  civ: {
    id: 'civ',
    name: 'ประมวลกฎหมายแพ่งและพาณิชย์',
    color: '#3b82f6', // Blue
    bgClass: 'bg-blue-50 text-blue-700 border-blue-200',
    borderClass: 'border-blue-500',
    textClass: 'text-blue-600',
  },
  crimp: {
    id: 'crimp',
    name: 'ประมวลกฎหมายวิธีพิจารณาความอาญา',
    color: '#f59e0b', // Amber
    bgClass: 'bg-amber-50 text-amber-700 border-amber-200',
    borderClass: 'border-amber-500',
    textClass: 'text-amber-600',
  },
  civp: {
    id: 'civp',
    name: 'ประมวลกฎหมายวิธีพิจารณาความแพ่ง',
    color: '#10b981', // Emerald
    bgClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    borderClass: 'border-emerald-500',
    textClass: 'text-emerald-600',
  },
};

export interface LawSession {
  groupId: string;
  category: LawCategory;
  sections: string;
  createdDate: string; // ISO string
}

export interface SRSRevisionDay {
  offset: number;
  label: string;
  date: Date;
}

export interface ExtendedEventProperties {
  appId?: string;
  [key: string]: string | undefined; // e.g. g_[groupId], sess_[groupId], sec_[category]
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  extendedProperties?: {
    private?: ExtendedEventProperties;
  };
}

// Structured UI representation of a revision date
export interface RevisionDaySchedule {
  dateString: string; // YYYY-MM-DD
  date: Date;
  eventId?: string;
  sessions: {
    groupId: string;
    category: LawCategory;
    sections: string;
  }[];
}
