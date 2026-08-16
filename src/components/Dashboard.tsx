import React, { useState } from 'react';
import { GoogleCalendarEvent, LawCategory, LAW_CATEGORIES, getCategoryConfig } from '../types';
import { LawSessionDetail, deleteSRSSchedule, updateSRSSchedule } from '../lib/calendar';
import { reportError } from '../lib/errorLog';
import { Calendar, Trash2, ShieldAlert, ListFilter, RefreshCw, BookOpen, Clock, Grid2X2, Pencil } from 'lucide-react';

interface DashboardProps {
  events: GoogleCalendarEvent[];
  sessions: LawSessionDetail[];
  onRefresh: () => Promise<void>;
  isLoading: boolean;
  token: string;
  onNavigateToAddPlan: () => void;
}

export default function Dashboard({ events, sessions, onRefresh, isLoading, token, onNavigateToAddPlan }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<'sessions' | 'schedule'>('sessions');

  // Cascade delete state
  const [sessionToDelete, setSessionToDelete] = useState<LawSessionDetail | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteProgress, setDeleteProgress] = useState<string>('');

  // Edit plan state
  const [sessionToEdit, setSessionToEdit] = useState<LawSessionDetail | null>(null);
  const [editSections, setEditSections] = useState<string>('');
  const [editError, setEditError] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editProgress, setEditProgress] = useState<string>('');

  // Group events by target date (only for upcoming reviews)
  const getUpcomingSchedule = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const grouped: Record<string, { date: Date; items: { category: LawCategory; sections: string; eventId: string; groupId: string }[] }> = {};

    for (const event of events) {
      const privateProps = event.extendedProperties?.private;
      if (!privateProps || privateProps.appId !== 'law-srs-app-v1') continue;

      let eventDateString = '';
      if (event.start?.dateTime) {
        eventDateString = event.start.dateTime.split('T')[0];
      } else if (event.start?.date) {
        eventDateString = event.start.date;
      }

      if (!eventDateString) continue;

      // Extract all session laws scheduled for this date
      for (const key of Object.keys(privateProps)) {
        if (key.startsWith('sess_')) {
          const groupId = key.substring(5);
          const val = privateProps[key] || '';
          const delimiterIdx = val.indexOf(':');
          if (delimiterIdx !== -1) {
            const category = val.substring(0, delimiterIdx) as LawCategory;
            const sections = val.substring(delimiterIdx + 1);

            if (!grouped[eventDateString]) {
              grouped[eventDateString] = {
                date: new Date(eventDateString + 'T12:00:00'),
                items: [],
              };
            }

            // Only add unique items
            if (!grouped[eventDateString].items.some(x => x.groupId === groupId)) {
              grouped[eventDateString].items.push({
                category,
                sections,
                eventId: event.id,
                groupId,
              });
            }
          }
        }
      }
    }

    // Sort dates chronologically
    return Object.entries(grouped)
      .map(([dateStr, details]) => ({
        dateStr,
        ...details,
      }))
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  };

  const scheduleList = getUpcomingSchedule();

  // Handle delete action
  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) return;

    setIsDeleting(true);
    setDeleteProgress('กำลังถอนการจัดกำหนดการจากปฏิทิน...');

    try {
      await deleteSRSSchedule(token, sessionToDelete.groupId, sessionToDelete.category, (msg) => {
        setDeleteProgress(msg);
      });
      
      // Cleanup
      setSessionToDelete(null);
      await onRefresh();
    } catch (err) {
      console.error('Cascade deletion failed:', err);
      reportError(err, 'handleDeleteConfirm');
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบ');
    } finally {
      setIsDeleting(false);
      setDeleteProgress('');
    }
  };

  // Open the edit modal pre-filled with the current sections
  const openEditModal = (sess: LawSessionDetail) => {
    setSessionToEdit(sess);
    setEditSections(sess.sections);
    setEditError('');
    setEditProgress('');
  };

  // Handle edit save action
  const handleEditConfirm = async () => {
    if (!sessionToEdit) return;

    const trimmed = editSections.trim();
    if (!trimmed) {
      setEditError('กรุณาระบุเลขมาตราหรือช่วงมาตราที่ต้องการท่องจำ (เช่น "170-185" หรือ "288, 289")');
      return;
    }

    const matchedParts = trimmed.match(/^[0-9\s,\-\/a-zA-Z]+$/);
    if (!matchedParts) {
      setEditError('รูปแบบมาตราไม่ถูกต้อง โปรดใช้ตัวเลข เครื่องหมายจุลภาค (,) และเครื่องหมายขีดละ (-) (เช่น "420-430, 435")');
      return;
    }

    setIsEditing(true);
    setEditProgress('กำลังปรับปรุงข้อมูลบนปฏิทิน...');

    try {
      await updateSRSSchedule(token, sessionToEdit.groupId, sessionToEdit.category, trimmed, (msg) => {
        setEditProgress(msg);
      });

      // Cleanup
      setSessionToEdit(null);
      setEditSections('');
      await onRefresh();
    } catch (err) {
      console.error('Schedule update failed:', err);
      reportError(err, 'handleEditConfirm');
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการแก้ไข');
    } finally {
      setIsEditing(false);
      setEditProgress('');
    }
  };

  return (
    <div id="calendar-dashboard" className="space-y-6">
      {/* Header and Sync indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="font-sans text-xl sm:text-2xl font-black tracking-tight text-slate-900">
            วิเคราะห์และตรวจสอบการท่องจำมาตรา
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            ตารางการจดจำมาตรากฎหมายแบบเว้นระยะห่าง โดยเชื่อมโยงกับกิจกรรมปฏิทินทั้งหมด {events.length} รายการ
          </p>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-center">
          {/* Add Plan Action (when plans are present) */}
          {sessions.length > 0 && (
            <button
              id="top-add-plan-btn"
              onClick={onNavigateToAddPlan}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all cursor-pointer shadow-sm active:scale-[0.98]"
            >
              <span>+ เพิ่มแผนท่องจำมาตรา</span>
            </button>
          )}

          {/* Refresh Action */}
          <button
            id="refresh-data-btn"
            onClick={onRefresh}
            disabled={isLoading || isDeleting}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 bg-white border border-slate-200 hover:border-slate-300 disabled:opacity-50 hover:bg-slate-50 rounded-xl transition-all cursor-pointer shadow-2xs"
          >
            <RefreshCw size={12} className={`${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'กำลังซิงค์...' : 'รีเฟรชปฏิทิน'}</span>
          </button>
        </div>
      </div>

      {/* Main Tabs switcher */}
      <div className="flex border-b border-slate-250">
        <button
          id="tab-sessions"
          onClick={() => setActiveTab('sessions')}
          className={`flex items-center space-x-2 py-3 px-4 text-xs uppercase tracking-widest font-extrabold border-b-2 transition-all cursor-pointer ${
            activeTab === 'sessions'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Grid2X2 size={14} />
          <span>แผนการท่องจำที่กำลังดำเนินอยู่ ({sessions.length})</span>
        </button>
        <button
          id="tab-schedule"
          onClick={() => setActiveTab('schedule')}
          className={`flex items-center space-x-2 py-3 px-4 text-xs uppercase tracking-widest font-extrabold border-b-2 transition-all cursor-pointer ${
            activeTab === 'schedule'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Calendar size={14} />
          <span>ปฏิทินวันทบทวนมาตรา ({scheduleList.length} วัน)</span>
        </button>
      </div>

      {/* Tabs panels */}
      {isLoading && sessions.length === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center space-y-2 text-slate-400">
          <div className="w-5 h-5 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-xs font-mono">กำลังโหลดข้อมูลและรอบการเก็บข้อมูลมาตรา...</span>
        </div>
      ) : activeTab === 'sessions' ? (
        // ACTIVE STUDY PLANS
        sessions.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center max-w-md mx-auto my-6 flex flex-col items-center">
            <BookOpen size={28} className="text-slate-300 mb-3" />
            <h3 className="font-sans text-base font-bold text-slate-800">ไม่พบตารางท่องจำระดับบุคคล</h3>
            <p className="text-xs text-slate-400 mt-1 px-4 leading-relaxed">
              ยังไม่มีมาตราที่จัดเก็บในตารางปฏิทิน คุณสามารถเพิ่มตารางมาตราใหม่เพื่อเชื่อมโยงปฏิทิน Google Calendar ของคุณได้ทันที
            </p>
            <button
              id="center-add-plan-btn"
              onClick={onNavigateToAddPlan}
              className="mt-6 inline-flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-indigo-600/10 cursor-pointer active:scale-[0.98]"
            >
              <span>เพิ่มแผนท่องจำมาตรา</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sessions.map((sess) => {
              const categoryDetails = getCategoryConfig(sess.category);
              return (
                <div
                  key={sess.groupId}
                  id={`session-card-${sess.groupId}`}
                  className="bg-white border border-slate-200/80 rounded-2xl p-5 hover:shadow-md hover:border-slate-300 transition-all relative overflow-hidden"
                >
                  {/* Category stripe marker */}
                  <div
                    className="absolute top-0 left-0 w-full h-1"
                    style={{ backgroundColor: categoryDetails?.color || '#a8a29e' }}
                  />

                  <div className="flex items-start justify-between mt-1 gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Badge indicator */}
                      <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded font-bold tracking-wide border ${categoryDetails?.bgClass || 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                        {categoryDetails?.name || 'กฎหมายไม่ระบุ'}
                      </span>
                      <h4 className="font-mono text-base font-bold text-slate-900 mt-2 break-words">
                        มาตรา: {sess.sections}
                      </h4>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        id={`edit-session-btn-${sess.groupId}`}
                        onClick={() => openEditModal(sess)}
                        className="p-1 px-2 border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all cursor-pointer shrink-0"
                        title="แก้ไขรายการมาตราในแผนนี้"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        id={`delete-session-btn-${sess.groupId}`}
                        onClick={() => setSessionToDelete(sess)}
                        className="p-1 px-2 border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 rounded-lg hover:bg-red-50 transition-all cursor-pointer shrink-0"
                        title="ยกเลิกกำหนดการและถอนมาตรารอบนี้จากปฏิทิน"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold tracking-wider">
                      รหัสอ้างอิงแผนการจดจำ
                    </div>
                    <code className="text-[9px] font-mono text-slate-400">{sess.groupId.substring(0, 13)}...</code>
                  </div>

                  {/* Scheduled milestones on dates */}
                  <div className="mt-4 space-y-2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center font-mono">
                      <Clock size={10} className="mr-1" />
                      วันทบทวนความรู้ 4 ระยะ (เว้นช่วงความจำ)
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {sess.dates.map((d, index) => {
                        const offsets = [0, 2, 5, 30];
                        const offsetLabel = `รอบ Day +${offsets[index] ?? 'x'}`;
                        const formattedDate = new Date(d + 'T12:00:00').toLocaleDateString('th-TH', {
                          month: 'short',
                          day: 'numeric',
                        });
                        return (
                          <div key={d} className="bg-slate-50 border border-slate-100 p-2 rounded-xl text-left">
                            <div className="text-[8px] font-extrabold uppercase text-slate-400 font-mono">
                              {offsetLabel}
                            </div>
                            <div className="text-xs font-bold text-slate-800">
                              {formattedDate}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        // CALENDAR SCHEDULE VIEW
        scheduleList.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center max-w-md mx-auto my-6">
            <Calendar size={28} className="mx-auto text-slate-300 mb-3" />
            <h3 className="font-sans text-base font-bold text-slate-800">ไม่มีมาตราทบทวนในระบบ</h3>
            <p className="text-xs text-slate-400 mt-1 px-4 leading-relaxed">
              Google Calendar ของคุณไม่มีมาตรารอทบทวนที่ใกล้กำหนดสำหรับคุณในช่วงเวลานี้
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {scheduleList.map((day) => {
              const formattedDate = day.date.toLocaleDateString('th-TH', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              });

              // Check if date is today
              const todayStr = new Date().toISOString().split('T')[0];
              const isToday = day.dateStr === todayStr;

              return (
                <div
                  key={day.dateStr}
                  className={`bg-white border rounded-2xl overflow-hidden transition-all shadow-2xs ${
                    isToday ? 'ring-2 ring-indigo-505 border-indigo-400' : 'border-slate-200'
                  }`}
                >
                  <div className={`p-4 flex items-center justify-between border-b ${
                    isToday ? 'bg-indigo-50/20 border-indigo-100' : 'bg-slate-50 border-slate-100'
                  }`}>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900 flex items-center">
                        {formattedDate}
                        {isToday && (
                          <span className="ml-2 inline-flex items-center text-[9px] bg-indigo-100 border border-indigo-200 font-bold px-1.5 py-0.5 rounded text-indigo-800 tracking-wider uppercase">
                            ถึงกำหนดทบทวนวันนี้!
                          </span>
                        )}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{day.dateStr}</p>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    {day.items.map((item, idx) => {
                      const categoryDetails = getCategoryConfig(item.category);
                      return (
                        <div
                          key={`${item.groupId}-${idx}`}
                          className="flex items-center justify-between p-3 border border-slate-100 bg-slate-50/30 hover:bg-slate-50/80 rounded-xl transition-all"
                        >
                          <div className="flex items-start space-x-3 min-w-0 flex-1">
                            <div
                              className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                              style={{ backgroundColor: categoryDetails?.color || '#a8a29e' }}
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-slate-900">
                                {categoryDetails?.name}
                              </span>
                              <div className="font-mono text-sm font-semibold text-slate-800 mt-0.5 break-words">
                                มาตรา: {item.sections}
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest text-right shrink-0">
                            รหัสแผน: {item.groupId.substring(0, 8)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* STUDY PLAN CANCELLATION DIALOG */}
      {sessionToDelete && (
        <div id="cascade-delete-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3 text-red-600 mb-4 border-b border-slate-100 pb-3">
              <div className="p-2.5 bg-red-50 border border-red-100 rounded-full">
                <ShieldAlert size={22} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-sans text-base font-black text-slate-900">ยกเลิกกำหนดตารางท่องจำมาตรา</h3>
                <p className="text-[11px] text-slate-400">ระบบจะดึงรหัสมาตรากลุ่มนี้ออกและลบกิจกรรมจากปฏิทินโดยอัตโนมัติ</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                คุณกำลังมีความประสงค์ที่จะยกเลิกกำหนดท่องจำและสอบทวนทั้งหมดของวิชานี้:
              </p>
              
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="font-bold text-slate-800">
                  {getCategoryConfig(sessionToDelete.category)?.name}
                </div>
                <div className="font-mono text-slate-700 mt-1">
                  กลุ่มมาตรา: {sessionToDelete.sections}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-1.5">
                  รหัสอ้างอิง: {sessionToDelete.groupId}
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <p className="font-bold text-slate-800">
                  ระบบจะดำเนินการปรับข้อมูลใน Google Calendar ของคุณแบบตามลำดับชั้น (Cascade) ดังนี้:
                </p>
                <div className="list-disc pl-4 space-y-1 text-slate-500 font-medium">
                  <div>1. ตามรอยและค้นหากิจกรรมทั้ง 4 วันที่ครอบคลุมแผนท่องจำรหัส <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-800">{sessionToDelete.groupId.substring(0, 8)}</code></div>
                  <div>2. หากในกิจกรรมวันนั้นมีเพียงกลุ่มมาตราหลักนี้ กิจกรรมในปฏิทินของวันนั้นจะถูก <strong className="text-red-600 font-bold">ลบทิ้งถาวร</strong> เพื่อคืนพื้นที่การศึกษาให้คุณ</div>
                  <div>3. หากวันทบทวนนั้นมีวิชาหรือมาตราอื่นๆ คาบเกี่ยวอยู่ ระบบจะเลือก <strong className="text-slate-800 font-bold">ถอนออกเฉพาะวิชาที่ระบุตัวนี้</strong> เท่านั้น มาตราอื่นๆ ของคุณจะถูกคงรักษาไว้อย่างปลอดภัยสูงสุด</div>
                </div>
              </div>
            </div>

            {isDeleting ? (
              <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl text-center flex flex-col items-center justify-center space-y-2">
                <div className="w-5 h-5 border-2 border-slate-400 border-t-indigo-600 rounded-full animate-spin" />
                <span className="text-xs font-semibold font-mono text-slate-700">{deleteProgress}</span>
              </div>
            ) : (
              <div className="mt-6 flex space-x-3">
                <button
                  id="cancel-delete-btn"
                  onClick={() => setSessionToDelete(null)}
                  className="flex-1 border border-slate-200 hover:border-slate-350 text-slate-700 font-bold py-2 rounded-xl text-xs hover:bg-slate-50 transition-all cursor-pointer text-center"
                >
                  คงตารางทบทวนไว้
                </button>
                <button
                  id="confirm-delete-btn"
                  onClick={handleDeleteConfirm}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-xl text-xs transition-all shadow-md shadow-red-600/10 cursor-pointer text-center"
                >
                  ถอนกำหนดการและลบปฏิทิน
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STUDY PLAN EDIT DIALOG */}
      {sessionToEdit && (
        <div id="edit-plan-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3 text-indigo-600 mb-4 border-b border-slate-100 pb-3">
              <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-full">
                <Pencil size={22} className="text-indigo-600" />
              </div>
              <div>
                <h3 className="font-sans text-base font-black text-slate-900">แก้ไขรายการมาตราในแผน</h3>
                <p className="text-[11px] text-slate-400">ระบบจะปรับปรุงรายการมาตราในกิจกรรมทบทวนทั้ง 4 วันของแผนนี้โดยอัตโนมัติ</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="font-bold text-slate-800">
                  {getCategoryConfig(sessionToEdit.category)?.name}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-1.5">
                  รหัสอ้างอิง: {sessionToEdit.groupId}
                </div>
              </div>

              <div>
                <label htmlFor="edit-sections-input" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  เลขมาตราที่ต้องการท่องจำ
                </label>
                <textarea
                  id="edit-sections-input"
                  rows={4}
                  placeholder="เช่น 170-185 หรือ 288, 289"
                  value={editSections}
                  onChange={(e) => setEditSections(e.target.value)}
                  disabled={isEditing}
                  className="w-full pl-3 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 resize-y leading-snug"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  ระบุเป็นรายมาตรา หรือเป็นช่วงด้วยยัติภังค์ (เช่น <code className="font-mono text-slate-600">420-430, 435</code>)
                </p>
              </div>

              {editError && (
                <div className="flex items-center space-x-2 text-red-600 text-xs bg-red-50 border border-red-100 p-3 rounded-xl">
                  <ShieldAlert size={14} className="shrink-0" />
                  <span>{editError}</span>
                </div>
              )}
            </div>

            {isEditing ? (
              <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl text-center flex flex-col items-center justify-center space-y-2">
                <div className="w-5 h-5 border-2 border-slate-400 border-t-indigo-600 rounded-full animate-spin" />
                <span className="text-xs font-semibold font-mono text-slate-700">{editProgress}</span>
              </div>
            ) : (
              <div className="mt-6 flex space-x-3">
                <button
                  id="cancel-edit-btn"
                  onClick={() => setSessionToEdit(null)}
                  className="flex-1 border border-slate-200 hover:border-slate-350 text-slate-700 font-bold py-2 rounded-xl text-xs hover:bg-slate-50 transition-all cursor-pointer text-center"
                >
                  ยกเลิก
                </button>
                <button
                  id="confirm-edit-btn"
                  onClick={handleEditConfirm}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-xl text-xs transition-all shadow-md shadow-indigo-600/10 cursor-pointer text-center"
                >
                  บันทึกการแก้ไข
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
