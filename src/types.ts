export type LawCategory = 'crim' | 'civ' | 'crimp' | 'civp' | 'const' | 'court' | 'bankrupt' | 'custom' | string;

export interface LawCategoryConfig {
  id: string;
  name: string;
  color: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
}

export const LAW_CATEGORIES: Record<string, LawCategoryConfig> = {
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
  const: {
    id: 'const',
    name: 'รัฐธรรมนูญแห่งราชอาณาจักรไทย',
    color: '#06b6d4', // Cyan
    bgClass: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    borderClass: 'border-cyan-500',
    textClass: 'text-cyan-600',
  },
  court: {
    id: 'court',
    name: 'พ.ร.บ.พระธรรมนูญศาลยุติธรรม',
    color: '#6366f1', // Indigo
    bgClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    borderClass: 'border-indigo-500',
    textClass: 'text-indigo-600',
  },
  bankrupt: {
    id: 'bankrupt',
    name: 'พ.ร.บ.ล้มละลาย',
    color: '#ec4899', // Pink
    bgClass: 'bg-pink-50 text-pink-700 border-pink-200',
    borderClass: 'border-pink-500',
    textClass: 'text-pink-600',
  },
  custom: {
    id: 'custom',
    name: 'ระบุตรากฎหมายอื่นๆ',
    color: '#8b5cf6', // Violet
    bgClass: 'bg-violet-50 text-violet-700 border-violet-200',
    borderClass: 'border-violet-500',
    textClass: 'text-violet-600',
  },
};

export function getCategoryConfig(catId: string): LawCategoryConfig {
  if (catId in LAW_CATEGORIES) {
    return LAW_CATEGORIES[catId];
  }
  if (catId && catId.startsWith('custom_')) {
    const customName = catId.substring(7);
    return {
      id: catId,
      name: customName,
      color: '#8b5cf6', // Violet
      bgClass: 'bg-violet-50 text-violet-700 border-violet-200',
      borderClass: 'border-violet-500',
      textClass: 'text-violet-600',
    };
  }
  return {
    id: catId || 'custom',
    name: catId || 'กฎหมายอื่นๆ',
    color: '#64748b', // Slate
    bgClass: 'bg-slate-50 text-slate-700 border-slate-200',
    borderClass: 'border-slate-500',
    textClass: 'text-slate-600',
  };
}

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
