import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { User } from 'firebase/auth';
import { googleSignIn, initAuth, logout, getAccessToken, setCachedAccessToken } from './lib/firebase';
import { fetchAppEvents, parseStudySessions, syncSRSSchedule, LawSessionDetail } from './lib/calendar';
import { GoogleCalendarEvent, LawCategory } from './types';
import StatuteForm from './components/StatuteForm';
import Dashboard from './components/Dashboard';
import { Calendar, BookOpen, LogOut, CheckCircle, RefreshCw, AlertCircle, Sparkles, LogIn } from 'lucide-react';

export default function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');

  // Calendar sync state
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [sessions, setSessions] = useState<LawSessionDetail[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<string>('');
  const [errorEvents, setErrorEvents] = useState<string>('');

  // Listen to Auth State on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, cachedToken) => {
        setUser(currentUser);
        setToken(cachedToken);
        setNeedsAuth(false);
        setIsInitializing(false);
        // Automatically fetch if token is active
        loadCalendarMetadata(cachedToken);
      },
      () => {
        setUser(null);
        setToken(null);
        setNeedsAuth(true);
        setIsInitializing(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError('');
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setNeedsAuth(false);
        loadCalendarMetadata(result.accessToken);
      }
    } catch (err) {
      console.error('Login process failed:', err);
      setAuthError('OAuth authentication or consent was not completed. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setToken(null);
      setEvents([]);
      setSessions([]);
      setNeedsAuth(true);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Load user schedules and calendar elements
  const loadCalendarMetadata = async (authToken: string) => {
    setIsLoadingEvents(true);
    setErrorEvents('');
    try {
      const items = await fetchAppEvents(authToken);
      setEvents(items);

      const parsed = parseStudySessions(items);
      setSessions(parsed);
    } catch (err) {
      console.error('Failed to load events:', err);
      setErrorEvents('Unable to retrieve synchronization events from Google Calendar. Access might be expired.');
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const handleSyncSubmit = async (category: LawCategory, sections: string, startDate: Date) => {
    if (!token) return;

    setIsSyncing(true);
    setSyncProgress('Creating spaced repetition target dates...');

    try {
      await syncSRSSchedule(token, category, sections, startDate, (progressMsg) => {
        setSyncProgress(progressMsg);
      });
      // Refresh
      await loadCalendarMetadata(token);
      
      // Successfully created under the new flow, transit back to the primary tracker dashboard
      navigate('/');
    } catch (err) {
      console.error('Error scheduling srs sequence:', err);
      alert(err instanceof Error ? err.message : 'Scheduling sequence failed');
    } finally {
      setIsSyncing(false);
      setSyncProgress('');
    }
  };

  if (isInitializing) {
    return (
      <div id="app-initializer" className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center font-sans animate-pulse">
        <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-indigo-600 animate-spin mb-4" />
        <p className="text-xs uppercase tracking-widest text-slate-400 font-mono font-bold">
          กำลังเตรียมระบบช่วยจำมาตรา “ท่องมาตรา”...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-800 flex flex-col justify-between">
      {/* Visual background decor: Academic column outline */}
      <div className="flex-grow">
        {/* Navigation Bar */}
        <header id="main-header" className="border-b border-slate-200 bg-white shadow-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-indigo-600 text-white rounded-lg shadow-md shadow-indigo-600/20 flex items-center justify-center">
                <span className="font-sans font-black text-lg tracking-wider leading-none">§</span>
              </div>
              <div>
                <h1 className="font-sans text-lg font-extrabold text-slate-900 tracking-tight leading-none">
                  ท่องมาตรา (Tong Matra)
                </h1>
                <p className="text-[10px] font-mono uppercase tracking-widest text-indigo-600 font-semibold mt-1">
                  ระบบวางแผนท่องจำและทบทวนอย่างมีประสิทธิภาพ
                </p>
              </div>
            </div>

            {user && (
              <div className="flex items-center space-x-4">
                <div className="hidden md:flex flex-col text-right">
                  <span className="text-xs font-semibold text-slate-900 leading-none">
                    {user.displayName || user.email}
                  </span>
                  <span className="text-[9px] font-mono text-emerald-600 font-medium uppercase mt-1 tracking-wider">
                    ● เชื่อมต่อปฏิทินแล้ว
                  </span>
                </div>
                
                {user.photoURL && (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Profile'}
                    className="w-8 h-8 rounded-full border border-slate-200 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                )}

                <button
                  id="auth-logout-btn"
                  onClick={handleLogout}
                  className="p-1.5 text-slate-400 hover:text-slate-700 border border-slate-200 hover:border-slate-350 rounded-lg hover:bg-slate-50 transition-all cursor-pointer"
                  title="ออกจากระบบ"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* React Router Routes */}
        <Routes>
          {/* Login Route */}
          <Route
            path="/login"
            element={
              needsAuth ? (
                <main className="max-w-3xl mx-auto px-4 py-16 sm:px-6">
                  <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-12 text-center shadow-lg shadow-slate-100/50 relative overflow-hidden">
                    {/* Elegant header lines */}
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600" />
                    
                    <div className="max-w-md mx-auto space-y-6">
                      <div className="inline-flex p-4 bg-indigo-50 border border-indigo-100/50 rounded-full text-indigo-600 mb-2 shadow-inner">
                        <BookmarkIcon className="w-12 h-12 text-indigo-600" />
                      </div>

                      <div className="space-y-2">
                        <h2 className="font-sans text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                          ท่องมาตรา (Tong Matra)
                        </h2>
                        <p className="text-sm text-slate-500 leading-relaxed">
                          ระบบสร้างตารางทบทวนและจดจำมาตรากฎหมายแบบเว้นระยะห่าง (Spaced Repetition) ออกแบบขึ้นเฉพาะสำหรับผู้ศึกษากฎหมายไทย เพื่อช่วยเพิ่มศักยภาพของการจดจำวิชาประมวลกฎหมายได้อย่างแม่นยำถาวรผ่าน Google Calendar ของคุณเอง
                        </p>
                      </div>

                      {/* Conceptual features checklist */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-3.5">
                        <div className="flex items-start space-x-3 text-xs text-slate-600">
                          <CheckCircle size={15} className="text-indigo-600 shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-slate-900 font-bold">บันทึกลงปฏิทินโดยตรง:</strong> ระบบกำหนดและสร้างหัวข้อตารางเรียนรู้ในแต่ละช่วงลงปฏิทิน Google Calendar ส่วนบุคคลของคุณโดยตรง
                          </span>
                        </div>
                        <div className="flex items-start space-x-3 text-xs text-slate-600">
                          <CheckCircle size={15} className="text-indigo-600 shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-slate-950 font-bold">จัดเรียงวาระประจำวันให้อัตโนมัติ:</strong> หากคุณมีหัวข้อย่อยหรือมาตราหลายฉบับที่ต้องทบทวนตรงกันในวันเดียวกัน ระบบจะรวมกลุ่มจัดระเบียบให้เรียบร้อยเพื่อการเรียนรู้ in ครั้งเดียว
                          </span>
                        </div>
                        <div className="flex items-start space-x-3 text-xs text-slate-600">
                          <CheckCircle size={15} className="text-indigo-600 shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-slate-955 font-bold">ถอนโครงสร้างแบบ Cascade แสนฉลาด:</strong> เมื่อกดลบหรือยกเลิกแผนการเรียนรู้ใดๆ ระบบจะย้อนล้างข้อมูลเฉพาะส่วนของแผนนั้นใน Google Calendar ของคุณ โดยไม่กระทบมาตราอื่นๆ ที่บันทึกอยู่คู่กัน
                          </span>
                        </div>
                      </div>

                      {authError && (
                        <div className="p-3 bg-red-50 border border-red-150 rounded-lg text-xs text-red-700 flex items-center space-x-2 text-left">
                          <AlertCircle size={15} className="shrink-0" />
                          <span>{authError}</span>
                        </div>
                      )}

                      {/* Google Sign-In with official guidelines formatting */}
                      <div className="pt-2">
                        <button
                          id="gsi-login-btn"
                          onClick={handleLogin}
                          disabled={isLoggingIn}
                          className="gsi-material-button w-full sm:w-auto shadow-sm"
                        >
                          <div className="gsi-material-button-state"></div>
                          <div className="gsi-material-button-content-wrapper">
                            <div className="gsi-material-button-icon">
                              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: "block" }}>
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                                <path fill="none" d="M0 0h48v48H0z"></path>
                              </svg>
                            </div>
                            <span className="gsi-material-button-contents text-slate-700">เข้าสู่ระบบผ่านบัญชี Google</span>
                            <span style={{ display: "none" }}>Sign in with Google</span>
                          </div>
                        </button>
                      </div>

                      <div className="text-[10px] text-slate-400 font-mono">
                        สิทธิ์การเข้าถึงภายนอกที่จำเป็น: ดำเนินการและแก้ไขข้อมูล Google Calendar Events ของคุณ
                      </div>
                    </div>
                  </div>
                </main>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />

          {/* Tracker Dashboard Route */}
          <Route
            path="/"
            element={
              !needsAuth ? (
                <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                  {errorEvents && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center justify-between shadow-xs mb-6">
                      <span className="flex items-center space-x-2">
                        <AlertCircle size={15} />
                        <span>{errorEvents}</span>
                      </span>
                      <button
                        onClick={() => token && loadCalendarMetadata(token)}
                        className="text-red-900 underline hover:no-underline font-bold"
                      >
                        เชื่อมต่อใหม่อีกครั้ง
                      </button>
                    </div>
                  )}

                  <div className="max-w-5xl mx-auto space-y-6">
                    <Dashboard
                      events={events}
                      sessions={sessions}
                      onRefresh={() => token && loadCalendarMetadata(token)}
                      isLoading={isLoadingEvents}
                      token={token!}
                      onNavigateToAddPlan={() => navigate('/plan/add')}
                    />
                  </div>
                </main>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          {/* Add Plan Route */}
          <Route
            path="/plan/add"
            element={
              !needsAuth ? (
                <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                  {errorEvents && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center justify-between shadow-xs mb-6">
                      <span className="flex items-center space-x-2">
                        <AlertCircle size={15} />
                        <span>{errorEvents}</span>
                      </span>
                      <button
                        onClick={() => token && loadCalendarMetadata(token)}
                        className="text-red-900 underline hover:no-underline font-bold"
                      >
                        เชื่อมต่อใหม่อีกครั้ง
                      </button>
                    </div>
                  )}

                  <div className="max-w-4xl mx-auto">
                    <button
                      onClick={() => navigate('/')}
                      className="mb-6 inline-flex items-center space-x-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors uppercase tracking-wider cursor-pointer font-sans"
                    >
                      <span>← ย้อนกลับไปตารางจดจำมาตรา</span>
                    </button>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Form Input Deck */}
                      <div className="lg:col-span-2">
                        <StatuteForm
                          onSync={handleSyncSubmit}
                          isSyncing={isSyncing}
                          syncProgress={syncProgress}
                        />
                      </div>

                      {/* Sidebar Guidelines */}
                      <div className="lg:col-span-1 space-y-6">
                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5 text-slate-700 space-y-3.5 shadow-xs">
                          <h4 className="font-sans text-sm font-bold text-slate-900 flex items-center">
                            <Sparkles size={14} className="mr-1.5 text-indigo-600 animate-pulse" />
                            สูตรความถี่การเว้นระยะการจำ (SRS)
                          </h4>
                          <p className="text-xs leading-relaxed text-slate-500">
                            ตารางทบทวนมาตราแบ่งออกเป็น 4 ระยะที่พิสูจน์แล้วว่าเหมาะสำหรับสายประมวลกฎหมายเพื่อเก็บความทรงจำสู่ความจำระยะยาว:
                          </p>
                          <ul className="text-[11px] list-disc pl-5 space-y-1.5 text-slate-600 leading-relaxed font-semibold">
                            <li><strong>Day 0 (เริ่มต้นเรียนรู้):</strong> การบันทึกและจดจำรอบแรกสุด</li>
                            <li><strong>Day +2 (ระยะสั้นประวิงการลืม):</strong> ดึงความทรงจำรอบ 2 อย่างรวดเร็ว ป้องกันการลืมเฉียบพลัน</li>
                            <li><strong>Day +5 (ระยะกลางเสริมความมั่นคง):</strong> ทบทวนรอบ 3 ทวีสูตรปัญญาโครงสร้างความเชื่อมโยง</li>
                            <li><strong>Day +30 (บันทึกระดับถาวร):</strong> การทบทวนข้ามรอบ 1 เดือน เพื่อฝังเนื้อความประมวลลึกสู่เซลล์ประสาท</li>
                          </ul>
                          
                          <div className="text-[10px] bg-white border border-slate-200/50 rounded-xl p-3 mt-3 text-slate-400 font-mono">
                            💡 <strong>ระบบความปลอดภัยการล็อคอิน:</strong> บัญชีปฏิทินของคุณจะเชื่อมโยงเฉพาะระยะเวลาที่เปิดแท็บนี้อยู่เท่านั้น หลังปิดแท็บระบบจะคืนความปลอดภัยและถอนการจดจำทันที
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </main>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          {/* Catch-all Fallback */}
          <Route path="*" element={<Navigate to={needsAuth ? "/login" : "/"} replace />} />
        </Routes>
      </div>

      {/* Styled Google Sign-In button CSS injected once in root style */}
      <style>{`
        .gsi-material-button {
          -moz-user-select: none;
          -webkit-user-select: none;
          -ms-user-select: none;
          -webkit-appearance: none;
          background-color: WHITE;
          background-image: none;
          border: 1px solid #747775;
          -webkit-border-radius: 4px;
          border-radius: 4px;
          -webkit-box-sizing: border-box;
          box-sizing: border-box;
          color: #1f1f1f;
          cursor: pointer;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 14px;
          font-weight: 500;
          height: 40px;
          letter-spacing: 0.25px;
          outline: none;
          padding: 0 12px;
          position: relative;
          text-align: center;
          transition: background-color .218s, border-color .218s, box-shadow .218s;
          vertical-align: middle;
          white-space: nowrap;
          width: auto;
          max-width: 400px;
          min-width: min-content;
        }

        .gsi-material-button .gsi-material-button-icon {
          height: 20px;
          margin-right: 12px;
          min-width: 20px;
          width: 20px;
        }

        .gsi-material-button .gsi-material-button-content-wrapper {
          -webkit-align-items: center;
          align-items: center;
          display: flex;
          -webkit-flex-direction: row;
          flex-direction: row;
          -webkit-flex-wrap: nowrap;
          flex-wrap: nowrap;
          height: 100%;
          justify-content: space-between;
          position: relative;
          width: 100%;
        }

        .gsi-material-button .gsi-material-button-contents {
          -webkit-flex-grow: 1;
          flex-grow: 1;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 600;
          text-align: left;
        }

        .gsi-material-button .gsi-material-button-state {
          -webkit-border-radius: 4px;
          border-radius: 4px;
          bottom: 0;
          left: 0;
          opacity: 0;
          position: absolute;
          right: 0;
          top: 0;
          transition: opacity .218s;
        }

        .gsi-material-button:disabled {
          cursor: default;
          background-color: #ffffff61;
          border-color: #1f1f1f1f;
        }

        .gsi-material-button:disabled .gsi-material-button-contents {
          color: #1f1f1f1f;
        }

        .gsi-material-button:disabled .gsi-material-button-icon path {
          fill: #1f1f1f1f;
        }

        .gsi-material-button:not(:disabled):hover {
          -webkit-box-shadow: 0 1px 2px 0 rgba(60,64,67,10.3), 0 1px 3px 1px rgba(60,64,67,0.15);
          box-shadow: 0 1px 2px 0 rgba(60,64,67,.30), 0 1px 3px 1px rgba(60,64,67,.15);
        }

        .gsi-material-button:not(:disabled):hover .gsi-material-button-state {
          background-color: #303030;
          opacity: 0.04;
        }

        .gsi-material-button:not(:disabled):focus {
          border-color: #4285f4;
          outline: none;
        }

        .gsi-material-button:not(:disabled):focus .gsi-material-button-state {
          background-color: #303030;
          opacity: 0.12;
        }

        .gsi-material-button:not(:disabled):activated .gsi-material-button-state {
          background-color: #303030;
          opacity: 0.2;
        }
      `}</style>

      {/* Footer Area */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between text-slate-400 text-[10px] font-mono leading-relaxed">
          <div>
            ท่องมาตรา (TONG MATRA) • โปรแกรมวางแผนทบทวนแบบเว้นระยะห่างสำหรับผู้ศึกษากฎหมายไทย
          </div>
          <div className="mt-2 sm:mt-0 flex items-center space-x-1">
            <span>ขับเคลื่อนโดย</span>
            <span className="text-slate-700 font-bold">Google Calendar</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Inlined custom icon
function BookmarkIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
}
