import React, { useState } from 'react';
import { LawCategory, LAW_CATEGORIES } from '../types';
import { Calendar, BookOpen, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

interface StatuteFormProps {
  onSync: (category: LawCategory, sections: string, startDate: Date) => Promise<void>;
  isSyncing: boolean;
  syncProgress: string;
}

export default function StatuteForm({ onSync, isSyncing, syncProgress }: StatuteFormProps) {
  const [category, setCategory] = useState<LawCategory>('crim');
  const [sections, setSections] = useState<string>('');
  const [customLawName, setCustomLawName] = useState<string>('');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [error, setError] = useState<string>('');

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!sections.trim()) {
      setError('กรุณาระบุเลขมาตราหรือช่วงมาตราที่ต้องการท่องจำ (เช่น "170-185" หรือ "288, 289")');
      return;
    }

    const matchedParts = sections.match(/^[0-9\s,\-\/a-zA-Z]+$/);
    if (!matchedParts) {
      setError('รูปแบบมาตราไม่ถูกต้อง โปรดใช้ตัวเลข เครื่องหมายจุลภาค (,) และเครื่องหมายขีดละ (-) (เช่น "420-430, 435")');
      return;
    }

    let finalCategory: string = category;
    if (category === 'custom') {
      if (!customLawName.trim()) {
        setError('กรุณาระบุชื่อ พ.ร.บ. หรือตรากฎหมายอื่นที่คุณต้องการทบทวน');
        return;
      }
      finalCategory = `custom_${customLawName.trim()}`;
    }

    const startDate = new Date(customStartDate + 'T12:00:00'); // Midday to maintain robust timezone calculations
    await onSync(finalCategory, sections.trim(), startDate);
    
    // Clear form on success
    setSections('');
    setCustomLawName('');
  };

  // Pre-calculate target dates for display
  const getReviewMilestones = () => {
    const baseDate = new Date(customStartDate + 'T12:00:00');
    const offsets = [
      { days: 0, label: 'ทบทวนทันทีรอบแรก', id: 'Day 0 (ทันที)' },
      { days: 2, label: 'ทบทวนระยะสั้น (กันลืม)', id: 'Day +2 (2 วัน)' },
      { days: 7, label: 'ทบทวนเพื่อกระตุ้นสมอง', id: 'Day +7 (7 วัน)' },
      { days: 30, label: 'ทบทวนยาวให้ฝังแน่น', id: 'Day +30 (30 วัน)' },
    ];

    return offsets.map((item) => {
      const milestoneDate = new Date(baseDate);
      milestoneDate.setDate(milestoneDate.getDate() + item.days);
      const isWeekend = milestoneDate.getDay() === 0 || milestoneDate.getDay() === 6;
      return {
        ...item,
        date: milestoneDate,
        isWeekend,
      };
    });
  };

  return (
    <div id="statute-form-card" className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
      <div className="flex items-center space-x-2.5 border-b border-slate-100 pb-4 mb-5">
        <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600 shadow-xs">
          <BookOpen size={20} />
        </div>
        <div>
          <h2 className="font-sans text-lg font-black text-slate-900 tracking-tight">เพิ่มแผนการท่องจำมาตรา</h2>
          <p className="text-xs text-slate-500">สร้างตารางทบทวนความจำแบบเว้นระยะลงบน Google Calendar ของคุณ</p>
        </div>
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-4">
        {/* Category Option Selector */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            ประมวลกฎหมายที่ต้องการท่องจำ
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.values(LAW_CATEGORIES).map((cat) => (
              <button
                type="button"
                id={`cat-btn-${cat.id}`}
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex items-start p-3 text-left border rounded-xl transition-all ${
                  category === cat.id
                    ? 'border-indigo-600 bg-indigo-50/30 text-indigo-950 ring-1 ring-indigo-600/50 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full mt-1.5 mr-2 shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <div>
                  <span className="block text-xs font-bold leading-none">{cat.name}</span>
                  <span className="block text-[10px] text-slate-400 mt-1">รหัสย่อ: {cat.id}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Law Name Input (revealed dynamically) */}
        {category === 'custom' && (
          <div className="bg-violet-50/50 border border-violet-100 p-4 rounded-2xl mt-1 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <label htmlFor="custom-law-input" className="block text-[11px] font-bold uppercase tracking-wider text-violet-700">
              ชื่อ พ.ร.บ. หรือชื่อกฎหมายของคุณ
            </label>
            <div className="relative">
              <input
                id="custom-law-input"
                type="text"
                value={customLawName}
                onChange={(e) => setCustomLawName(e.target.value)}
                placeholder="เช่น พ.ร.บ.คอมพิวเตอร์ หรือ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)"
                disabled={isSyncing}
                className="w-full pl-3 pr-10 py-2.5 text-sm border border-violet-250 rounded-xl bg-white placeholder-slate-450 focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500 text-slate-800"
              />
              <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-violet-500 font-bold font-mono">
                ✎
              </span>
            </div>
            <p className="text-[10px] text-violet-600 font-normal leading-relaxed">
              * ชื่อกฎหมายที่คุณป้อนจะแสดงเป็นตรากฎหมายเฉพาะร่วมกับมาตราต่างๆ บนหน้ากระดานและปฏิทิน Google Calendar ของคุณโดยตรง
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Section list field */}
          <div>
            <label htmlFor="sections-input" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              เลขมาตราที่ต้องการท่องจำ
            </label>
            <div className="relative">
              <textarea
                id="sections-input"
                rows={2}
                placeholder="เช่น 170-185 หรือ 288, 289"
                value={sections}
                onChange={(e) => setSections(e.target.value)}
                disabled={isSyncing}
                className="w-full pl-3 pr-10 py-2 text-sm border border-slate-200 rounded-xl bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 resize-y leading-snug"
              />
              <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                §
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              ระบุเป็นรายมาตรา หรือเป็นช่วงด้วยยัติภังค์ (เช่น <code className="font-mono text-slate-600">420-430, 435</code>)
            </p>
          </div>

          {/* Start Date selection */}
          <div>
            <label htmlFor="start-date-input" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              วันที่เริ่มต้นจดจำ (Day 0)
            </label>
            <div className="relative">
              <input
                id="start-date-input"
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                disabled={isSyncing}
                className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <Calendar size={15} />
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center space-x-2 text-red-600 text-xs bg-red-50 border border-red-100 p-3 rounded-xl">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Milestone preview section */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mt-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center font-mono">
            <Clock size={12} className="mr-1" />
            ตัวอย่างกำหนดวันทบทวนแบบเว้นระยะห่าง
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {getReviewMilestones().map((milestone) => (
              <div
                key={milestone.id}
                className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between shadow-xs transition-all hover:shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 font-mono tracking-wider">
                      {milestone.id}
                    </span>
                    {milestone.isWeekend && (
                      <span className="text-[9px] px-1 bg-rose-50 text-rose-700 border border-rose-200 rounded">
                        วันหยุด
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-900 leading-snug">
                    {milestone.label}
                  </p>
                </div>
                <div className="mt-3 text-[10px] text-slate-400 font-mono font-medium">
                  {milestone.date.toLocaleDateString('th-TH', {
                    month: 'short',
                    day: 'numeric',
                    weekday: 'short',
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Form Submission indicator */}
        <div className="pt-2">
          {isSyncing ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center space-x-3 text-slate-700">
              <div className="w-4 h-4 rounded-full border-2 border-slate-400 border-t-indigo-500 animate-spin shrink-0" />
              <span className="text-xs font-medium font-mono truncate">{syncProgress}</span>
            </div>
          ) : (
            <button
              id="submit-sync-btn"
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-indigo-600/10 hover:shadow-lg active:scale-[0.99] flex items-center justify-center space-x-2 cursor-pointer"
            >
              <span>บันทึกตารางท่องจำนี้ลง Google Calendar</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
