import React from 'react';
import { FileText, ArrowLeft, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TermsOfService() {
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
            <FileText className="w-8 h-8" />
          </div>
          <h1 className="font-sans text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            ข้อตกลงและเงื่อนไขการใช้บริการ (Terms of Service)
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-2">
            ปรับปรุงล่าสุดเมื่อ: 30 พฤษภาคม 2026 (2026-05-30)
          </p>
        </div>

        {/* Content Section */}
        <div className="space-y-6 text-sm text-slate-600 leading-relaxed font-sans">
          <p className="text-base text-slate-700 font-medium">
            ยินดีต้อนรับสู่แอปพลิเคชัน <strong>"Tong Matra (ท่องมาตรา)"</strong> กรุณาอ่านเงื่อนไขการใช้บริการนี้โดยละเอียดก่อนเข้าใช้งาน การที่ท่านเริ่มเข้าใช้งานระบบ หมายถึงท่านยอมรับเงื่อนไขและข้อตกลงเหล่านี้ทุกประการ
          </p>

          {/* Section 1 */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">
              1. วัตถุประสงค์ในการให้บริการ (Service Objectives)
            </h2>
            <p>
              แอปพลิเคชัน "Tong Matra (ท่องมาตรา)" เป็นระบบจำลองการวางระยะเวลาและสร้างหัวข้อตารางเรียนรู้ (Spaced Repetition System: SRS) สำหรับช่วยจำประมวลกฎหมายเพื่อวัตถุประสงค์ทางการศึกษา กฎหมาย แนะนำแนวทางเรียนรู้ และความจำส่วนบุคคลเท่านั้น ไม่ใช่บริการที่ปรึกษาทางกฎหมายอย่างเป็นทางการ
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">
              2. การปฏิเสธความรับผิดชอบ (Disclaimer of Warranties)
            </h2>
            <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 flex items-start space-x-3 text-xs text-amber-800 leading-relaxed">
              <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">เงื่อนไขสำคัญเกี่ยวกับการให้บริการ:</p>
                <p>
                  แอปพลิเคชันให้บริการ "ตามสภาพที่เป็นอยู่" (As-Is Basis) โดยไม่มีการรับประกันสัญญาใดๆ ว่าระบบ ความถี่ หรือตัวช่วยบันทึกจะปลอดภัย ปราศจากความผิดพลาด หรือความล่าช้า ผู้พัฒนาไม่รับผิดชอบต่อความเสียหาย สูญหายของข้อมูลในปฏิทินส่วนบุคคล หรือผลการทดสอบการศึกษากฎหมายใดๆ ของผู้ใช้ที่เกิดขึ้นจากการใช้เครื่องมือนี้
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">
              3. สิทธิ์การใช้งานและการลบข้อมูล (User Rights & Use cases)
            </h2>
            <p>
              ผู้ใช้มีสิทธิ์ลบหรือทำตามขั้นตอนเตือนความจำที่บันทึกขึ้นผ่านแอปพลิเคชันได้ตลอดเวลาผ่านทางหน้าปฏิทิน Google Calendar โดยตรงหรือผ่านหน้าแอปพลิเคชันของเรา ทั้งนี้ห้ามผู้ใช้ใดๆ ดัดแปลง ทำซ้ำ นำไปกระจายเพื่อการค้า หรือพยายามส่งผ่านรหัสไวรัสที่เป็นอันตรายผ่านช่องสัญญาณเครือข่ายความปลอดภัยของแอปพลิเคชัน
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">
              4. ความปลอดภัยและการลงชื่อเข้าใช้งาน (User Authentication)
            </h2>
            <p>
              ระบบไม่มีการเก็บข้อมูลบัตรบันทึกรหัสผ่านของคุณ แต่เป็นการเข้าสู่ระบบแบบกระจายความปลอดภัยผ่าน Google OAuth ดังนั้น ความปลอดภัย ความสมบูรณ์ของบัญชี Google ID จะอยู่ที่มาตรฐานและการควบคุมความรับผิดชอบของคุณเอง หากคุณต้องการตัดลิ้งค์การเชื่อมระบบโดยสมบูรณ์ คุณสามารถกดปิดสิทธิ์การเข้าใช้งานได้ตลอดเวลา
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 border-l-4 border-indigo-500 pl-3">
              5. การแก้ไขปรับปรุงเงื่อนไข (Amendments to terms)
            </h2>
            <p>
              ผู้พัฒนาขอสงวนสิทธิ์ในการแก้ไขเงื่อนไขข้อตกลงการใช้บริการนี้ได้ตลอดเวลาโดยมิต้องแจ้งให้ทราบล่วงหน้า โดยรุ่นที่อัปเดตและระบุวันที่ล่าสุดผ่านหน้าเว็บไซต์นี้จะถือเป็นฉบับที่มีผลบังคับใช้ในทันที การที่ท่านเข้าใช้งานหลังมีการปรับเปลี่ยนจะถือเป็นการแสดงเอกฉันท์ว่าท่านยอมรับการแก้ไขดังกล่าว
            </p>
          </section>

          {/* Contact Section */}
          <section className="mt-6 border-t border-slate-100 pt-6">
            <p className="text-slate-500 text-xs">
              มีคำถามเกี่ยวกับเงื่อนไขการใช้งาน? โปรดส่งความคิดเห็นของคุณมายังผู้ดูแลระบบที่ <strong className="text-indigo-600 font-semibold font-mono">weeaix@gmail.com</strong>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
