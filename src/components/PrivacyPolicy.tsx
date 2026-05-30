import React from 'react';
import { ShieldCheck, ShieldAlert, FileText, ArrowLeft, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        className="mb-6 inline-flex items-center space-x-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors uppercase tracking-wider cursor-pointer"
      >
        <ArrowLeft size={14} />
        <span>กลับสู่หน้าหลัก</span>
      </button>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-lg shadow-slate-100/50 relative overflow-hidden space-y-8">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600" />

        {/* Header */}
        <div className="border-b border-slate-100 pb-6">
          <div className="inline-flex p-3 bg-indigo-50 border border-indigo-100/50 rounded-2xl text-indigo-600 mb-4">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="font-sans text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            นโยบายความเป็นส่วนตัว (Privacy Policy)
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-2">
            ปรับปรุงล่าสุดเมื่อ: 30 พฤษภาคม 2026 (2026-05-30)
          </p>
        </div>

        {/* Content Section */}
        <div className="space-y-6 text-sm text-slate-600 leading-relaxed font-sans">
          <p className="text-base text-slate-700">
            แอปพลิเคชัน <strong>"ท่องมาตรา" (Tong Matra)</strong> มุ่งมั่นที่จะปกป้องข้อมูลส่วนบุคคลของคุณ นโยบายความเป็นส่วนตัวนี้จัดทำขึ้นเพื่ออธิบายวิธีการเก็บรวบรวม การใช้งาน และการเปิดเผยข้อมูลของคุณในฐานะผู้ใช้งาน เมื่อคุณเลือกลงชื่อเข้าใช้ด้วยบัญชี Google (Google OAuth)
          </p>

          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">
              1. ข้อมูลส่วนบุคคลที่เราขอสิทธิ์เข้าถึง (Data Collection)
            </h2>
            <p>
              แอปพลิเคชันนี้ทำงานบนเบราว์เซอร์ของคุณโดยตรง (Client-Side Application) โดยไม่มีระบบฐานข้อมูลฝั่งเซิร์ฟเวอร์หลังบ้านของเราเอง ข้อมูลที่เราขอสิทธิ์เข้าถึงผ่าน Google API มีจุดประสงค์เพื่อการทำงานของเครื่องมือเท่านั้น:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-slate-900">ข้อมูลโปรไฟล์พื้นฐาน (OpenID, Email, Profile):</strong> สำหรับการแสดงผลรูปรอยยิ้ม รูปโปรไฟล์ ชื่อ และอีเมลบนส่วนหัวของหน้าจอเพื่อให้คุณทราบว่ากำลังเชื่อมต่อด้วยบัญชีใด
              </li>
              <li>
                <strong className="text-slate-900">การเข้าถึง Google Calendar (Calendar Events API):</strong> สำหรับใช้ดึงข้อมูลรายการปฏิทินที่มีหัวข้อทบทวน <code className="bg-slate-100 text-indigo-600 px-1.5 py-0.5 rounded font-mono text-xs">[SRS]</code> มาแสดงบนหน้าแดชบอร์ด และใช้สำหรับสร้างปฏิทินนัดหมายเตือนความจำทบทวนมาตราตามช่วงระยะเวลาเว้นห่าง (Spaced Repetition)
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">
              2. เราสอดแทรกความปลอดภัยข้อมูลของคุณอย่างไร (Data Usage & Security)
            </h2>
            <p>
              เพื่อความปลอดภัยสูงสุดของคุณ ข้อมูลการยืนยันสิทธิ์ <strong className="text-indigo-600">Access Token จะถูกจัดเก็บไว้ในหน่วยความจำของเบราว์เซอร์ส่วนบุคคลของคุณ (Session Storage และ Local Storage ในเครื่องเท่านั้น)</strong>
            </p>
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 flex items-start space-x-3 text-xs text-emerald-800 leading-relaxed">
              <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
              <span>
                <strong>ไม่มีการส่งข้อมูลไปยังเซิร์ฟเวอร์ภายนอก:</strong> ทุกคำร้องขอการโอนย้ายข้อมูล Google Calendar จะถูกส่งตรงระหว่างเบราว์เซอร์ของคุณและ Google API โดยไม่มีเซิร์ฟเวอร์คนกลางของแอปพลิเคชันคอยบันทึก แอบอ่าน หรือจัดเก็บข้อมูลใดๆ ทั้งสิ้น ข้อมูลปฏิทินและสิทธิ์ของคุณจึงเป็นความลับอย่างสมบูรณ์
              </span>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">
              3. ข้อกำหนดการเปิดเผยและแบ่งปันข้อมููลแก่บุคคลที่สาม (Third-Party Sharing)
            </h2>
            <p className="bg-slate-50 border border-slate-150 p-4 rounded-2xl">
              แอปพลิเคชันนี้ <strong>ไม่มีนโยบายการเปิดเผย แบ่งปัน ขาย หรือส่งต่อข้อมูลส่วนบุคคลใดๆ ของคุณ</strong> ให้แก่บุคคลที่สาม โฆษก หรือบริษัทอื่นภายนอก ข้อมูลส่วนบุคคลทั้งหมดถูกใช้เพื่ออำนวยความสะดวกในการจัดสรรปฏิทินทบทวนส่วนบุคคลของคุณเอง
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">
              4. การควบคุมข้อมูลและการลบข้อมูลของคุณ (Data Deletion/Revocation)
            </h2>
            <p>คุณสามารถระงับสิทธิ์การใช้งานและการลบข้อมูลความจำทั้งหมดที่เก็บไว้ได้ตลอดเวลาผ่านช่องทางต่อไปนี้:</p>
            <ul className="list-decimal pl-5 space-y-2">
              <li>
                <strong>กดออกจากระบบ (Log Out):</strong> ปุ่มออกจากระบบบริเวณมุมขวาบนของแอปพลิเคชัน จะทำการลบข้อมูลโปรไฟล์และ Access Token ใน Local Storage & Session Storage ของเบราว์เซอร์คุณโดยสมบูรณ์ทันที
              </li>
              <li>
                <strong>การเพิกถอนสิทธิ์จากฝั่งบัญชี Google:</strong> คุณสามารถดำเนินการตัดการเชื่อมต่อได้ตลอดเวลาโดยลบสิทธิ์การเข้าถึงของแอปพลิเคชันนี้ที่หน้าตั้งค่าบัญชี Google <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold inline-flex items-center space-x-0.5"><span>จัดการสิทธิ์ตรวจรับรอง Google Security Account</span></a>
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3 bg-amber-50/50 border border-amber-100 p-4 rounded-2xl">
            <div className="flex items-center space-x-2 text-amber-800 font-bold mb-1">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
              <h2 className="text-sm font-bold text-amber-900 m-0">
                การปฏิบัติตามนโยบายสิทธิ์ข้อมูลผู้ใช้บริการของ Google (Google API Services User Data Policy)
              </h2>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              การใช้งานข้อมูลที่ได้รับจาก Google APIs ของแอปพลิเคชัน "ท่องมาตรา" จะเป็นไปตามข้อกำหนดนโยบายสิทธิ์ข้อมูลผู้ใช้บริการ API ของ Google ซึ่งรวมถึงข้อกำหนดสำหรับการใช้งานที่จำกัดอย่างเคร่งครัด (Limited Use Requirements) ข้อมูลของคุณจะไม่ถูกนำไปใช้โฆษณา ค้ากำไร หรือพิจารณาการให้สินเชื่อเด็ดขาด
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">
              5. ติดต่อเรา (Contact Us)
            </h2>
            <p>
              หากคุณมีข้อสงสัย ข้อร้องเรียน หรือข้อเสนอแนะเกี่ยวกับนโยบายความเป็นส่วนตัวฉบับนี้ สามารถติดต่อผู้พัฒนาได้ที่อีเมลด้านล่าง:
            </p>
            <div className="flex items-center space-x-2 text-indigo-600 font-semibold font-mono text-xs bg-slate-50 border border-slate-100 p-3 rounded-xl w-fit">
              <Mail size={14} />
              <span>weeaix@gmail.com</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
