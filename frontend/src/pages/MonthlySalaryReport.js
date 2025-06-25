
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DateTime } from 'luxon';
import { motion } from 'framer-motion';

const MonthlySalaryReport = () => {
  const [employeeCode, setEmployeeCode] = useState('');
  const [month, setMonth] = useState(DateTime.now().toFormat('yyyy-MM'));
  const [employee, setEmployee] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [sickLeaveDays, setSickLeaveDays] = useState(0);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');

  // جلب قائمة الموظفين عند تحميل الصفحة
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/employees`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setEmployees(response.data);
      } catch (err) {
        console.error('Error fetching employees:', err);
        setError('خطأ في جلب قائمة الموظفين');
      }
    };
    fetchEmployees();
  }, []);

  const fetchReport = async () => {
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('يرجى تسجيل الدخول أولاً');
        return;
      }

      const [year, monthStr] = month.split('-');
      const dateFrom = DateTime.fromObject({ year: parseInt(year), month: parseInt(monthStr) }).startOf('month').toISODate();
      const dateTo = DateTime.fromObject({ year: parseInt(year), month: parseInt(monthStr) }).endOf('month').toISODate();

      // جلب بيانات الموظف
      const employeeResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/employees/${employeeCode}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmployee(employeeResponse.data);

      // جلب بيانات الحضور
      const reportResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/fingerprints`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { code: employeeCode, dateFrom, dateTo },
      });
      if (!reportResponse.data.reports || reportResponse.data.reports.length === 0) {
        setError('لا توجد بيانات حضور لهذا الموظف في الشهر المحدد');
        return;
      }
      setReportData(reportResponse.data);
    } catch (err) {
      console.error('Error fetching report:', err);
      if (err.response?.status === 404) {
        setError('الموظف غير موجود أو لا توجد بيانات حضور');
      } else if (err.response?.status === 401) {
        setError('التوكن غير صالح، يرجى تسجيل الدخول مرة أخرى');
      } else {
        setError(err.response?.data?.error || 'خطأ في جلب البيانات');
      }
    }
  };

  const calculateSalary = () => {
    if (!employee || !reportData) return null;

    const { basicSalary, medicalInsurance, socialInsurance, annualLeaveBalance } = employee;
    const { reports, totalWeeklyLeaveDays } = reportData;

    // حساب أيام الحضور والغياب
    const attendanceDays = reports.filter((r) => r.absence === 'لا').length;
    const absenceDays = reports.filter((r) => r.absence === 'نعم').length;
    const totalOvertime = reports.reduce((sum, r) => sum + (r.overtime || 0), 0);

    // افتراض: سعر الساعة الإضافية = الراتب الأساسي ÷ (30 يوم × 8 ساعات)
    const overtimeRate = basicSalary / (30 * 8);
    const overtimePay = totalOvertime * overtimeRate;

    // خصم الغياب
    const absenceDeduction = (basicSalary / 30) * absenceDays;

    // خصم الأجازة المرضية
    const sickLeaveDeduction = (basicSalary / 30) * 0.25 * sickLeaveDays;

    // الصافي المستحق
    const netSalary = basicSalary - (absenceDeduction + sickLeaveDeduction + medicalInsurance + socialInsurance) + overtimePay;

    return {
      attendanceDays,
      absenceDays,
      totalOvertime,
      totalWeeklyLeaveDays,
      annualLeaveBalance,
      absenceDeduction: absenceDeduction.toFixed(2),
      sickLeaveDeduction: sickLeaveDeduction.toFixed(2),
      overtimePay: overtimePay.toFixed(2),
      netSalary: netSalary.toFixed(2),
    };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchReport();
  };

  const salaryData = calculateSalary();

  return (
    <motion.div
      className="min-h-screen bg-gray-100 py-10 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-800 text-right mb-6">تقرير المرتب الشهري</h1>

        {/* نموذج الفلتر */}
        <form onSubmit={handleSubmit} className="mb-8 flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-gray-700 text-sm font-medium mb-2 text-right">كود الموظف</label>
            <select
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg text-right"
              required
            >
              <option value="">اختر كود الموظف</option>
              {employees.map((emp) => (
                <option key={emp.code} value={emp.code}>
                  {emp.code} - {emp.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-gray-700 text-sm font-medium mb-2 text-right">الشهر</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg text-right"
              required
            />
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition duration-300 mt-6 md:mt-0"
          >
            جلب التقرير
          </button>
        </form>

        {error && <p className="text-red-500 text-right mb-4">{error}</p>}

        {employee && salaryData && (
          <>
            {/* جدول بيانات الموظف */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-700 text-right mb-4">بيانات الموظف</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-right"><strong>كود الموظف:</strong> {employee.code}</p>
                  <p className="text-right"><strong>الاسم:</strong> {employee.name}</p>
                  <p className="text-right"><strong>القسم:</strong> {employee.department}</p>
                </div>
                <div>
                  <p className="text-right"><strong>الراتب الأساسي:</strong> {employee.basicSalary.toFixed(2)} جنيه</p>
                  <p className="text-right"><strong>التأمين الطبي:</strong> {employee.medicalInsurance.toFixed(2)} جنيه</p>
                  <p className="text-right"><strong>التأمين الاجتماعي:</strong> {employee.socialInsurance.toFixed(2)} جنيه</p>
                </div>
              </div>
            </div>

            {/* جدول الحضور والأجازات */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-700 text-right mb-4">تفاصيل الحضور</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">أيام الحضور</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">أيام الغياب</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">الساعات الإضافية</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">أيام العمل</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">الأجازة السنوية</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">الأجازة المرضية</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-800 border-b">الأجازة بدون أجر</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-4 py-2 text-right text-sm">{salaryData.attendanceDays}</td>
                      <td className="px-4 py-2 text-right text-sm">{salaryData.absenceDays}</td>
                      <td className="px-4 py-2 text-right text-sm">{salaryData.totalOvertime.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-sm">{salaryData.attendanceDays}</td>
                      <td className="px-4 py-2 text-right text-sm">{salaryData.annualLeaveBalance || 0}</td>
                      <td className="px-4 py-2 text-right text-sm">
                        <input
                          type="number"
                          value={sickLeaveDays}
                          onChange={(e) => setSickLeaveDays(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-20 px-2 py-1 border rounded-lg text-right"
                          min="0"
                        />
                      </td>
                      <td className="px-4 py-2 text-right text-sm">{salaryData.absenceDays}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ملخص مالي */}
            <div>
              <h2 className="text-xl font-semibold text-gray-700 text-right mb-4">الملخص المالي</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-right"><strong>الراتب الأساسي:</strong> {employee.basicSalary.toFixed(2)} جنيه</p>
                  <p className="text-right"><strong>خصم الغياب:</strong> {salaryData.absenceDeduction} جنيه</p>
                  <p className="text-right"><strong>خصم الأجازة المرضية:</strong> {salaryData.sickLeaveDeduction} جنيه</p>
                </div>
                <div>
                  <p className="text-right"><strong>إضافة الساعات الإضافية:</strong> {salaryData.overtimePay} جنيه</p>
                  <p className="text-right"><strong>الصافي المستحق:</strong> {salaryData.netSalary} جنيه</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default MonthlySalaryReport;
