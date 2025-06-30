import React, { useState } from 'react';
import { DateTime } from 'luxon';
import { motion } from 'framer-motion';
import EditModal from './EditModal';

const ReportTable = ({ reports, onEdit }) => {
  const [selectedReport, setSelectedReport] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleEdit = (report) => {
    const formattedReport = {
      ...report,
      date: report.date ? DateTime.fromISO(report.date, { zone: 'Africa/Cairo' }).toFormat('yyyy-MM-dd') : '',
      checkIn: report.checkIn && DateTime.fromFormat(report.checkIn, 'hh:mm:ss a', { zone: 'Africa/Cairo' }).isValid
        ? DateTime.fromFormat(report.checkIn, 'hh:mm:ss a', { zone: 'Africa/Cairo' }).toFormat('HH:mm:ss')
        : '',
      checkOut: report.checkOut && DateTime.fromFormat(report.checkOut, 'hh:mm:ss a', { zone: 'Africa/Cairo' }).isValid
        ? DateTime.fromFormat(report.checkOut, 'hh:mm:ss a', { zone: 'Africa/Cairo' }).toFormat('HH:mm:ss')
        : '',
      absence: report.absence === 'نعم',
      annualLeave: report.annualLeave === 'نعم',
    };
    setSelectedReport(formattedReport);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedReport(null);
  };

  const handleReportUpdate = (updatedReport) => {
    onEdit(updatedReport);
    setIsModalOpen(false);
    setSelectedReport(null);
  };

  const totals = reports.reduce(
    (acc, report) => {
      acc.totalWorkHours += report.workHours || 0;
      acc.totalWorkDays += report.absence === 'لا' && report.weeklyLeaveDays === 0 && report.annualLeave === 'لا' && report.medicalLeave === 'لا' ? 1 : 0;
      acc.totalAbsenceDays += report.absence === 'نعم' ? 1 : 0;
      acc.totalDeductions += (report.lateDeduction || 0) + (report.earlyLeaveDeduction || 0) + (report.medicalLeaveDeduction || 0);
      acc.totalOvertime += report.overtime || 0;
      acc.totalWeeklyLeaveDays += report.weeklyLeaveDays || 0;
      acc.totalAnnualLeaveDays += report.annualLeave === 'نعم' ? 1 : 0;
      acc.totalMedicalLeaveDays += report.medicalLeave === 'نعم' ? 1 : 0;
      return acc;
    },
    {
      totalWorkHours: 0,
      totalWorkDays: 0,
      totalAbsenceDays: 0,
      totalDeductions: 0,
      totalOvertime: 0,
      totalWeeklyLeaveDays: 0,
      totalAnnualLeaveDays: 0,
      totalMedicalLeaveDays: 0,
    }
  );

  return (
    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
      <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">التقارير</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">كود الموظف</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">الاسم</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">التاريخ</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">الحضور</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">الانصراف</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">ساعات العمل</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">الساعات الإضافية</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">دقائق التأخير</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">خصم التأخير</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">خصم الانصراف المبكر</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">الغياب</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">الإجازة السنوية</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">أيام العمل الأسبوعية</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">أيام الإجازة الأسبوعية</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">رصيد السماح بالتأخير</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">إجمالي الإجازة السنوية</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report, index) => {
              const reportDate = report.date ? DateTime.fromISO(report.date, { zone: 'Africa/Cairo' }) : null;
              const checkInTime = report.checkIn
                ? DateTime.fromFormat(report.checkIn, 'hh:mm:ss a', { zone: 'Africa/Cairo' })
                : null;
              const checkOutTime = report.checkOut
                ? DateTime.fromFormat(report.checkOut, 'hh:mm:ss a', { zone: 'Africa/Cairo' })
                : null;

              return (
                <motion.tr
                  key={report._id || index}
                  whileHover={{ backgroundColor: '#f1fafb' }}
                  transition={{ duration: 0.2 }}
                  className={
                    report.absence === 'نعم' ? 'bg-red-50' :
                    report.isSingleFingerprint === 'نعم' ? 'bg-yellow-50' :
                    report.annualLeave === 'نعم' ? 'bg-green-50' :
                    report.medicalLeave === 'نعم' ? 'bg-blue-50' : ''
                  }
                >
                  <td className="px-4 py-2 text-right text-sm">{report.code}</td>
                  <td className="px-4 py-2 text-right text-sm">{report.employeeName || 'غير معروف'}</td>
                  <td className="px-4 py-2 text-right text-sm">
                    {reportDate && reportDate.isValid ? reportDate.toFormat('yyyy-MM-dd') : '-'}
                  </td>
                  <td className="px-4 py-2 text-right text-sm">
                    {checkInTime && checkInTime.isValid ? checkInTime.toFormat('hh:mm:ss a') : '-'}
                  </td>
                  <td className="px-4 py-2 text-right text-sm">
                    {checkOutTime && checkOutTime.isValid ? checkOutTime.toFormat('hh:mm:ss a') : '-'}
                  </td>
                  <td className="px-4 py-2 text-right text-sm">{(report.workHours || 0).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right text-sm">{(report.overtime || 0).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right text-sm">{(report.lateMinutes || 0).toFixed(0)}</td>
                  <td className="px-4 py-2 text-right text-sm">{(report.lateDeduction || 0).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right text-sm">{(report.earlyLeaveDeduction || 0).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right text-sm">{report.absence}</td>
                  <td className="px-4 py-2 text-right text-sm">{report.annualLeave}</td>
                  <td className="px-4 py-2 text-right text-sm">{report.workDaysPerWeek || '-'}</td>
                  <td className="px-4 py-2 text-right text-sm">{report.weeklyLeaveDays || '-'}</td>
                  <td className="px-4 py-2 text-right text-sm">{report.monthlyLateAllowance !== undefined ? report.monthlyLateAllowance : '-'}</td>
                  <td className="px-4 py-2 text-right text-sm">{report.totalAnnualLeave !== undefined ? report.totalAnnualLeave : '-'}</td>
                  <td className="px-4 py-2 text-right">
                    <motion.button
                      onClick={() => handleEdit(report)}
                      whileHover={{ scale: 1.05, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      whileTap={{ scale: 0.95 }}
                      className="bg-blue-600 text-white px-4 py-1 rounded-md hover:bg-blue-700 transition-colors duration-300"
                    >
                      تعديل
                    </motion.button>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-6 text-right">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">إجماليات الفترة</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg shadow-inner">
          <div className="bg-blue-100 p-4 rounded-lg text-right">
            <p className="text-sm font-medium text-gray-600">إجمالي ساعات العمل</p>
            <p className="text-lg font-bold text-blue-700">{totals.totalWorkHours.toFixed(2)} ساعة</p>
          </div>
          <div className="bg-green-100 p-4 rounded-lg text-right">
            <p className="text-sm font-medium text-gray-600">إجمالي أيام العمل</p>
            <p className="text-lg font-bold text-green-700">{totals.totalWorkDays} يوم</p>
          </div>
          <div className="bg-red-100 p-4 rounded-lg text-right">
            <p className="text-sm font-medium text-gray-600">إجمالي أيام الغياب</p>
            <p className="text-lg font-bold text-red-700">{totals.totalAbsenceDays} يوم</p>
          </div>
          <div className="bg-yellow-100 p-4 rounded-lg text-right">
            <p className="text-sm font-medium text-gray-600">إجمالي الخصومات</p>
            <p className="text-lg font-bold text-yellow-700">{totals.totalDeductions.toFixed(2)} يوم</p>
          </div>
          <div className="bg-purple-100 p-4 rounded-lg text-right">
            <p className="text-sm font-medium text-gray-600">إجمالي الساعات الإضافية</p>
            <p className="text-lg font-bold text-purple-700">{totals.totalOvertime.toFixed(2)} ساعة</p>
          </div>
          <div className="bg-indigo-100 p-4 rounded-lg text-right">
            <p className="text-sm font-medium text-gray-600">إجمالي أيام الإجازة الأسبوعية</p>
            <p className="text-lg font-bold text-indigo-700">{totals.totalWeeklyLeaveDays} يوم</p>
          </div>
          <div className="bg-teal-100 p-4 rounded-lg text-right">
            <p className="text-sm font-medium text-gray-600">إجمالي أيام الإجازة السنوية</p>
            <p className="text-lg font-bold text-teal-700">{totals.totalAnnualLeaveDays} يوم</p>
          </div>
          <div className="bg-pink-100 p-4 rounded-lg text-right">
            <p className="text-sm font-medium text-gray-600">إجمالي أيام الإجازة الطبية</p>
            <p className="text-lg font-bold text-pink-700">{totals.totalMedicalLeaveDays} يوم</p>
          </div>
          <div className="bg-gray-100 p-4 rounded-lg text-right">
            <p className="text-sm font-medium text-gray-600">إجمالي الإجازة السنوية (السنة)</p>
            <p className="text-lg font-bold text-gray-700">{reports[0]?.totalAnnualLeave || 0} يوم</p>
          </div>
        </div>
      </div>
      <EditModal
        report={selectedReport}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onUpdate={handleReportUpdate}
      />
    </div>
  );
};

export default ReportTable;
