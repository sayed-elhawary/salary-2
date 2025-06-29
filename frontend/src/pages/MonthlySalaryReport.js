import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../components/AuthProvider';
import NavBar from '../components/NavBar';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { DateTime } from 'luxon';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun } from 'docx';
import { saveAs } from 'file-saver';

const MonthlySalaryReport = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [searchCode, setSearchCode] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [salaryReports, setSalaryReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [error, setError] = useState('');

  // التحقق من صلاحيات المستخدم
  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
    }
  }, [user, navigate]);

  // وظيفة البحث
  const handleSearch = async () => {
    if (!dateFrom || !dateTo) {
      setError('يرجى إدخال تاريخ البداية وتاريخ النهاية');
      return;
    }

    const startDate = DateTime.fromISO(dateFrom, { zone: 'Africa/Cairo' });
    const endDate = DateTime.fromISO(dateTo, { zone: 'Africa/Cairo' });

    if (!startDate.isValid || !endDate.isValid) {
      setError('تاريخ البداية أو النهاية غير صالح');
      return;
    }

    if (startDate > endDate) {
      setError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/fingerprints/salary-report`,
        {
          params: { code: searchCode, dateFrom, dateTo },
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      // توحيد أيام الشهر إلى 30 وحساب بدل الوجبة والخصومات
      const normalizedReports = res.data.salaryReports.map((report) => normalizeDays(report));
      setSalaryReports(normalizedReports);
    } catch (err) {
      console.error('Error fetching salary reports:', err.response?.data?.message || err.message);
      setError(`خطأ أثناء البحث: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // وظيفة عرض جميع السجلات
  const handleShowAll = async () => {
    setLoading(true);
    setError('');
    try {
      // استخدام الشهر الحالي كنطاق زمني افتراضي
      const now = DateTime.local().setZone('Africa/Cairo');
      const defaultDateFrom = now.startOf('month').toISODate();
      const defaultDateTo = now.endOf('month').toISODate();

      const res = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/fingerprints/salary-report`,
        {
          params: { code: '', dateFrom: defaultDateFrom, dateTo: defaultDateTo },
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      // توحيد أيام الشهر إلى 30 وحساب بدل الوجبة والخصومات
      const normalizedReports = res.data.salaryReports.map((report) => normalizeDays(report));
      setSalaryReports(normalizedReports);
      setSearchCode('');
      setDateFrom('');
      setDateTo('');
    } catch (err) {
      console.error('Error fetching all salary reports:', err.response?.data?.message || err.message);
      setError(`خطأ أثناء جلب جميع التقارير: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // وظيفة توحيد أيام الشهر إلى 30 وحساب بدل الوجبة والخصومات
  const normalizeDays = (report) => {
    const totalDays =
      (parseInt(report.totalWorkDays, 10) || 0) +
      (parseInt(report.totalAbsenceDays, 10) || 0) +
      (parseInt(report.totalAnnualLeaveDays, 10) || 0) +
      (parseInt(report.totalWeeklyLeaveDays, 10) || 0) +
      (parseInt(report.totalMedicalLeaveDays, 10) || 0);

    let updatedReport = { ...report };

    // توحيد إجمالي الأيام إلى 30
    if (totalDays !== 30) {
      const daysDiff = 30 - totalDays;
      updatedReport.totalWeeklyLeaveDays = (parseInt(report.totalWeeklyLeaveDays, 10) || 0) + daysDiff;
    }

    // حساب بدل الوجبة: خصم 50 جنيه لكل يوم غياب فقط
    const baseMealAllowance = 500; // القيمة الافتراضية لبدل الوجبة
    const absenceDays = parseInt(report.totalAbsenceDays, 10) || 0;
    updatedReport.mealAllowance = Math.max(0, baseMealAllowance - absenceDays * 50).toFixed(2);

    // حساب الخصومات (بالأيام)
    const lateDeductionDays = parseFloat(report.lateDeductionDays) || 0;
    const totalDeductions = absenceDays + lateDeductionDays;
    updatedReport.totalDeductions = totalDeductions.toFixed(2);
    updatedReport.lateDeductionDays = lateDeductionDays.toFixed(2);

    // حساب الراتب اليومي وسعر الساعة
    const dailySalary = parseFloat(report.baseSalary) / 30;
    const hourlyRate = dailySalary / 9;

    // حساب قيمة الخصومات
    const penaltiesValue = parseFloat(report.penaltiesValue) || 0;
    const violationsInstallment = parseFloat(report.violationsInstallment) || 0;
    updatedReport.deductionsValue = (totalDeductions * dailySalary + penaltiesValue + violationsInstallment).toFixed(2);

    // تحديث قيم الحقول الجديدة
    updatedReport.penaltiesValue = penaltiesValue.toFixed(2);
    updatedReport.violationsInstallment = violationsInstallment.toFixed(2);
    updatedReport.totalViolationsValue = (penaltiesValue + violationsInstallment).toFixed(2);

    // حساب قيمة الساعات الإضافية
    const overtimeValue = (parseFloat(report.totalOvertime) || 0) * hourlyRate;
    updatedReport.overtimeValue = overtimeValue.toFixed(2);

    // حساب الراتب الصافي
    updatedReport.netSalary = (
      parseFloat(report.baseSalary) +
      parseFloat(updatedReport.mealAllowance) +
      overtimeValue +
      parseFloat(report.eidBonus || 0) -
      parseFloat(report.medicalInsurance) -
      parseFloat(report.socialInsurance) -
      parseFloat(updatedReport.deductionsValue)
    ).toFixed(2);

    return updatedReport;
  };

  // فتح نموذج التعديل
  const handleEditClick = (report) => {
    setEditingReport(report);
    setEditForm({
      code: report.code,
      fullName: report.fullName,
      department: report.department,
      baseSalary: report.baseSalary,
      medicalInsurance: report.medicalInsurance,
      socialInsurance: report.socialInsurance,
      mealAllowance: report.mealAllowance,
      totalWorkHours: report.totalWorkHours,
      totalWorkDays: report.totalWorkDays,
      totalAbsenceDays: report.totalAbsenceDays,
      lateDeductionDays: report.lateDeductionDays || '0.00',
      totalDeductions: report.totalDeductions,
      deductionsValue: report.deductionsValue || '0.00',
      totalOvertime: report.totalOvertime,
      overtimeValue: report.overtimeValue,
      totalWeeklyLeaveDays: report.totalWeeklyLeaveDays,
      totalAnnualLeaveDays: report.totalAnnualLeaveDays,
      totalMedicalLeaveDays: report.totalMedicalLeaveDays,
      totalAnnualLeaveYear: report.totalAnnualLeaveYear,
      penaltiesValue: report.penaltiesValue || '0.00',
      violationsInstallment: report.violationsInstallment || '0.00',
      totalViolationsValue: report.totalViolationsValue || '0.00',
      netSalary: report.netSalary,
      eidBonus: report.eidBonus || '0.00',
    });
  };

  // تحديث حقول نموذج التعديل
  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  // إرسال التعديلات
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // التحقق من صحة البيانات
      if (parseFloat(editForm.baseSalary) < 0) {
        setError('الراتب الأساسي لا يمكن أن يكون سالبًا');
        setLoading(false);
        return;
      }
      if (parseFloat(editForm.medicalInsurance) < 0) {
        setError('التأمين الطبي لا يمكن أن يكون سالبًا');
        setLoading(false);
        return;
      }
      if (parseFloat(editForm.socialInsurance) < 0) {
        setError('التأمين الاجتماعي لا يمكن أن يكون سالبًا');
        setLoading(false);
        return;
      }
      if (parseFloat(editForm.totalOvertime) < 0) {
        setError('الساعات الإضافية لا يمكن أن تكون سالبة');
        setLoading(false);
        return;
      }
      if (parseInt(editForm.totalAbsenceDays, 10) < 0) {
        setError('أيام الغياب لا يمكن أن تكون سالبة');
        setLoading(false);
        return;
      }
      if (parseInt(editForm.totalAnnualLeaveDays, 10) < 0) {
        setError('أيام الإجازة السنوية لا يمكن أن تكون سالبة');
        setLoading(false);
        return;
      }
      if (parseInt(editForm.totalMedicalLeaveDays, 10) < 0) {
        setError('أيام الإجازة الطبية لا يمكن أن تكون سالبة');
        setLoading(false);
        return;
      }
      if (parseInt(editForm.totalWeeklyLeaveDays, 10) < 0) {
        setError('أيام الإجازة الأسبوعية لا يمكن أن تكون سالبة');
        setLoading(false);
        return;
      }
      if (parseFloat(editForm.eidBonus) < 0) {
        setError('العيدية لا يمكن أن تكون سالبة');
        setLoading(false);
        return;
      }

      // حساب التغييرات في أيام الغياب والإجازة السنوية والإجازة الطبية
      const prevAbsenceDays = parseInt(editingReport.totalAbsenceDays, 10) || 0;
      const newAbsenceDays = parseInt(editForm.totalAbsenceDays, 10) || 0;
      const prevAnnualLeaveDays = parseInt(editingReport.totalAnnualLeaveDays, 10) || 0;
      const newAnnualLeaveDays = parseInt(editForm.totalAnnualLeaveDays, 10) || 0;
      const prevMedicalLeaveDays = parseInt(editingReport.totalMedicalLeaveDays, 10) || 0;
      const newMedicalLeaveDays = parseInt(editForm.totalMedicalLeaveDays, 10) || 0;
      const lateDeductionDays = parseFloat(editingReport.lateDeductionDays) || 0;

      const annualLeaveDaysDiff = newAnnualLeaveDays - prevAnnualLeaveDays;

      // حساب الراتب اليومي وسعر الساعة (موحد على 30 يوم)
      const dailySalary = parseFloat(editForm.baseSalary) / 30;
      const hourlyRate = dailySalary / 9;
      const overtimeValue = (parseFloat(editForm.totalOvertime) || 0) * hourlyRate;

      // حساب الخصومات (بالأيام)
      const updatedTotalDeductions = newAbsenceDays + lateDeductionDays;

      // حساب قيمة الخصومات
      const penaltiesValue = parseFloat(editForm.penaltiesValue) || 0;
      const violationsInstallment = parseFloat(editForm.violationsInstallment) || 0;
      const updatedDeductionsValue = (updatedTotalDeductions * dailySalary + penaltiesValue + violationsInstallment).toFixed(2);

      // حساب بدل الوجبة بناءً على أيام الغياب فقط
      const baseMealAllowance = 500; // القيمة الافتراضية لبدل الوجبة
      const updatedMealAllowance = Math.max(0, baseMealAllowance - newAbsenceDays * 50).toFixed(2);

      // التحقق من إجمالي الأيام (يجب أن يكون 30)
      const totalDays =
        (parseInt(editForm.totalWorkDays, 10) || 0) +
        newAbsenceDays +
        newAnnualLeaveDays +
        newMedicalLeaveDays +
        (parseInt(editForm.totalWeeklyLeaveDays, 10) || 0);
      let updatedWeeklyLeaveDays = parseInt(editForm.totalWeeklyLeaveDays, 10) || 0;
      if (totalDays !== 30) {
        updatedWeeklyLeaveDays += 30 - totalDays;
      }

      // حساب الراتب الصافي
      const updatedNetSalary = (
        parseFloat(editForm.baseSalary) +
        parseFloat(updatedMealAllowance) +
        overtimeValue +
        parseFloat(editForm.eidBonus || 0) -
        parseFloat(editForm.medicalInsurance) -
        parseFloat(editForm.socialInsurance) -
        parseFloat(updatedDeductionsValue)
      ).toFixed(2);

      // تحديث بيانات المستخدم باستخدام PUT
      await axios.put(
        `${process.env.REACT_APP_API_URL}/api/users/${editForm.code}`,
        {
          code: editForm.code,
          fullName: editForm.fullName,
          department: editForm.department,
          baseSalary: parseFloat(editForm.baseSalary),
          medicalInsurance: parseFloat(editForm.medicalInsurance),
          socialInsurance: parseFloat(editForm.socialInsurance),
          mealAllowance: parseFloat(updatedMealAllowance),
          deductionsValue: parseFloat(updatedDeductionsValue),
          penaltiesValue: parseFloat(editForm.penaltiesValue) || 0,
          violationsInstallment: parseFloat(editForm.violationsInstallment) || 0,
          totalViolationsValue: (penaltiesValue + violationsInstallment).toFixed(2),
          totalAnnualLeave: parseFloat(editForm.totalAnnualLeaveYear) + annualLeaveDaysDiff,
          createdBy: user._id,
          eidBonus: parseFloat(editForm.eidBonus) || 0,
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );

      // تحديث التقرير في واجهة المستخدم
      setSalaryReports((prev) =>
        prev.map((report) =>
          report.code === editForm.code
            ? {
                ...report,
                ...editForm,
                mealAllowance: updatedMealAllowance,
                totalDeductions: updatedTotalDeductions.toFixed(2),
                deductionsValue: updatedDeductionsValue,
                overtimeValue: overtimeValue.toFixed(2),
                lateDeductionDays: lateDeductionDays.toFixed(2),
                penaltiesValue: penaltiesValue.toFixed(2),
                violationsInstallment: violationsInstallment.toFixed(2),
                totalViolationsValue: (penaltiesValue + violationsInstallment).toFixed(2),
                netSalary: updatedNetSalary,
                totalWeeklyLeaveDays: updatedWeeklyLeaveDays,
                totalAnnualLeaveYear: parseFloat(editForm.totalAnnualLeaveYear) + annualLeaveDaysDiff,
                eidBonus: parseFloat(editForm.eidBonus) || 0,
              }
            : report
        )
      );

      setEditingReport(null);
      alert('تم حفظ التعديلات بنجاح');
    } catch (err) {
      console.error('Error updating report:', err.response?.data?.message || err.message);
      setError(`خطأ أثناء التعديل: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // إلغاء التعديل
  const handleEditCancel = () => {
    setEditingReport(null);
    setEditForm({});
    setError('');
  };

  // تصدير إلى Excel
  const handleExportToExcel = () => {
    try {
      const headers = [
        'الراتب الصافي',
        'إجمالي قيمة المخالفات',
        'قسط المخالفات',
        'قيمة الجزاءات',
        'قيمة الخصومات',
        'إجمالي الخصومات (أيام)',
        'خصم التأخير (أيام)',
        'إجمالي أيام الإجازة السنوية (السنة)',
        'إجمالي أيام الإجازة الطبية',
        'إجمالي أيام الإجازة السنوية (الفترة)',
        'إجمالي أيام الإجازة الأسبوعية',
        'قيمة الساعات الإضافية',
        'إجمالي الساعات الإضافية',
        'إجمالي أيام الغياب',
        'إجمالي أيام العمل',
        'إجمالي ساعات العمل',
        'بدل الوجبة',
        'التأمين الاجتماعي',
        'التأمين الطبي',
        'الراتب الأساسي',
        'عيدية',
        'القسم',
        'الاسم',
        'كود الموظف',
      ];

      // إعداد البيانات مع صف الإجمالي
      const data = salaryReports.map((report) => ({
        'الراتب الصافي': parseFloat(report.netSalary).toFixed(2),
        'إجمالي قيمة المخالفات': parseFloat(report.totalViolationsValue || 0).toFixed(2),
        'قسط المخالفات': parseFloat(report.violationsInstallment || 0).toFixed(2),
        'قيمة الجزاءات': parseFloat(report.penaltiesValue || 0).toFixed(2),
        'قيمة الخصومات': parseFloat(report.deductionsValue || 0).toFixed(2),
        'إجمالي الخصومات (أيام)': parseFloat(report.totalDeductions).toFixed(2),
        'خصم التأخير (أيام)': parseFloat(report.lateDeductionDays || 0).toFixed(2),
        'إجمالي أيام الإجازة السنوية (السنة)': parseInt(report.totalAnnualLeaveYear, 10) || 0,
        'إجمالي أيام الإجازة الطبية': parseInt(report.totalMedicalLeaveDays, 10) || 0,
        'إجمالي أيام الإجازة السنوية (الفترة)': parseInt(report.totalAnnualLeaveDays, 10) || 0,
        'إجمالي أيام الإجازة الأسبوعية': parseInt(report.totalWeeklyLeaveDays, 10) || 0,
        'قيمة الساعات الإضافية': parseFloat(report.overtimeValue).toFixed(2),
        'إجمالي الساعات الإضافية': parseFloat(report.totalOvertime).toFixed(2),
        'إجمالي أيام الغياب': parseInt(report.totalAbsenceDays, 10) || 0,
        'إجمالي أيام العمل': parseInt(report.totalWorkDays, 10) || 0,
        'إجمالي ساعات العمل': parseFloat(report.totalWorkHours).toFixed(2),
        'بدل الوجبة': parseFloat(report.mealAllowance).toFixed(2),
        'التأمين الاجتماعي': parseFloat(report.socialInsurance).toFixed(2),
        'التأمين الطبي': parseFloat(report.medicalInsurance).toFixed(2),
        'الراتب الأساسي': parseFloat(report.baseSalary).toFixed(2),
        'عيدية': parseFloat(report.eidBonus || 0).toFixed(2),
        'القسم': report.department,
        'الاسم': report.fullName,
        'كود الموظف': report.code,
      }));

      // حساب الإجمالي
      const totals = {
        'الراتب الصافي': salaryReports.reduce((sum, report) => sum + parseFloat(report.netSalary || 0), 0).toFixed(2),
        'إجمالي قيمة المخالفات': salaryReports.reduce((sum, report) => sum + parseFloat(report.totalViolationsValue || 0), 0).toFixed(2),
        'قسط المخالفات': salaryReports.reduce((sum, report) => sum + parseFloat(report.violationsInstallment || 0), 0).toFixed(2),
        'قيمة الجزاءات': salaryReports.reduce((sum, report) => sum + parseFloat(report.penaltiesValue || 0), 0).toFixed(2),
        'قيمة الخصومات': salaryReports.reduce((sum, report) => sum + parseFloat(report.deductionsValue || 0), 0).toFixed(2),
        'إجمالي الخصومات (أيام)': salaryReports.reduce((sum, report) => sum + parseFloat(report.totalDeductions || 0), 0).toFixed(2),
        'خصم التأخير (أيام)': salaryReports.reduce((sum, report) => sum + parseFloat(report.lateDeductionDays || 0), 0).toFixed(2),
        'إجمالي أيام الإجازة السنوية (السنة)': salaryReports.reduce((sum, report) => sum + (parseInt(report.totalAnnualLeaveYear, 10) || 0), 0),
        'إجمالي أيام الإجازة الطبية': salaryReports.reduce((sum, report) => sum + (parseInt(report.totalMedicalLeaveDays, 10) || 0), 0),
        'إجمالي أيام الإجازة السنوية (الفترة)': salaryReports.reduce((sum, report) => sum + (parseInt(report.totalAnnualLeaveDays, 10) || 0), 0),
        'إجمالي أيام الإجازة الأسبوعية': salaryReports.reduce((sum, report) => sum + (parseInt(report.totalWeeklyLeaveDays, 10) || 0), 0),
        'قيمة الساعات الإضافية': salaryReports.reduce((sum, report) => sum + parseFloat(report.overtimeValue || 0), 0).toFixed(2),
        'إجمالي الساعات الإضافية': salaryReports.reduce((sum, report) => sum + parseFloat(report.totalOvertime || 0), 0).toFixed(2),
        'إجمالي أيام الغياب': salaryReports.reduce((sum, report) => sum + (parseInt(report.totalAbsenceDays, 10) || 0), 0),
        'إجمالي أيام العمل': salaryReports.reduce((sum, report) => sum + (parseInt(report.totalWorkDays, 10) || 0), 0),
        'إجمالي ساعات العمل': salaryReports.reduce((sum, report) => sum + parseFloat(report.totalWorkHours || 0), 0).toFixed(2),
        'بدل الوجبة': salaryReports.reduce((sum, report) => sum + parseFloat(report.mealAllowance || 0), 0).toFixed(2),
        'التأمين الاجتماعي': salaryReports.reduce((sum, report) => sum + parseFloat(report.socialInsurance || 0), 0).toFixed(2),
        'التأمين الطبي': salaryReports.reduce((sum, report) => sum + parseFloat(report.medicalInsurance || 0), 0).toFixed(2),
        'الراتب الأساسي': salaryReports.reduce((sum, report) => sum + parseFloat(report.baseSalary || 0), 0).toFixed(2),
        'عيدية': salaryReports.reduce((sum, report) => sum + parseFloat(report.eidBonus || 0), 0).toFixed(2),
        'القسم': 'الإجمالي',
        'الاسم': '',
        'كود الموظف': '',
      };

      // إضافة صف الإجمالي إلى البيانات
      data.push(totals);

      // إنشاء ورقة عمل
      const ws = XLSX.utils.json_to_sheet(data, { header: headers });
      // ضبط عرض الأعمدة واتجاه النص
      ws['!cols'] = headers.map(() => ({ wch: 20 }));
      ws['!rtl'] = true; // ضبط اتجاه النص إلى RTL
      // تنسيق الرأسية
      headers.forEach((_, index) => {
        const cell = XLSX.utils.encode_cell({ c: index, r: 0 });
        ws[cell].s = {
          font: { name: 'Arial', sz: 12, bold: true },
          alignment: { horizontal: 'right', vertical: 'center' },
          fill: { fgColor: { rgb: 'D3D3D3' } },
        };
      });
      // تنسيق صف الإجمالي
      headers.forEach((_, index) => {
        const cell = XLSX.utils.encode_cell({ c: index, r: data.length - 1 });
        ws[cell].s = {
          font: { name: 'Arial', sz: 12, bold: true },
          alignment: { horizontal: 'right', vertical: 'center' },
          fill: { fgColor: { rgb: 'FFFF99' } },
        };
      });
      // إنشاء ملف Excel
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'تقرير المرتب الشهري');
      XLSX.writeFile(wb, 'تقرير_المرتب_الشهري.xlsx');
    } catch (err) {
      console.error('Error exporting to Excel:', err.message);
      setError('خطأ أثناء تصدير ملف Excel: ' + err.message);
    }
  };

  // تصدير إلى Word
  const handleExportToWord = async () => {
    try {
      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: { top: 720, right: 720, bottom: 720, left: 720 },
              },
            },
            children: [
              new Paragraph({
                text: 'تقرير المرتب الشهري',
                heading: 'Title',
                alignment: 'right',
                spacing: { after: 200 },
                children: [
                  new TextRun({
                    font: 'Arial',
                    size: 32,
                    rightToLeft: true,
                  }),
                ],
              }),
              new Paragraph({
                text: `تاريخ الإصدار: ${DateTime.local().setZone('Africa/Cairo').toFormat('yyyy-MM-dd')}`,
                alignment: 'right',
                spacing: { after: 400 },
                children: [
                  new TextRun({
                    font: 'Arial',
                    size: 20,
                    rightToLeft: true,
                  }),
                ],
              }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                  // رأس الجدول
                  new TableRow({
                    children: [
                      'الراتب الصافي',
                      'إجمالي قيمة المخالفات',
                      'قسط المخالفات',
                      'قيمة الجزاءات',
                      'قيمة الخصومات',
                      'إجمالي الخصومات (أيام)',
                      'خصم التأخير (أيام)',
                      'إجمالي أيام الإجازة السنوية (السنة)',
                      'إجمالي أيام الإجازة الطبية',
                      'إجمالي أيام الإجازة السنوية (الفترة)',
                      'إجمالي أيام الإجازة الأسبوعية',
                      'قيمة الساعات الإضافية',
                      'إجمالي الساعات الإضافية',
                      'إجمالي أيام الغياب',
                      'إجمالي أيام العمل',
                      'إجمالي ساعات العمل',
                      'بدل الوجبة',
                      'التأمين الاجتماعي',
                      'التأمين الطبي',
                      'الراتب الأساسي',
                      'عيدية',
                      'القسم',
                      'الاسم',
                      'كود الموظف',
                    ].map(
                      (header) =>
                        new TableCell({
                          children: [
                            new Paragraph({
                              text: header,
                              alignment: 'right',
                              children: [
                                new TextRun({
                                  font: 'Arial',
                                  size: 20,
                                  bold: true,
                                  rightToLeft: true,
                                }),
                              ],
                            }),
                          ],
                          width: { size: 4.17, type: WidthType.PERCENTAGE },
                        })
                    ),
                  }),
                  // بيانات التقارير
                  ...salaryReports.map(
                    (report) =>
                      new TableRow({
                        children: [
                          parseFloat(report.netSalary).toFixed(2),
                          parseFloat(report.totalViolationsValue || 0).toFixed(2),
                          parseFloat(report.violationsInstallment || 0).toFixed(2),
                          parseFloat(report.penaltiesValue || 0).toFixed(2),
                          parseFloat(report.deductionsValue || 0).toFixed(2),
                          parseFloat(report.totalDeductions).toFixed(2),
                          parseFloat(report.lateDeductionDays || 0).toFixed(2),
                          parseInt(report.totalAnnualLeaveYear, 10).toString() || '0',
                          parseInt(report.totalMedicalLeaveDays, 10).toString() || '0',
                          parseInt(report.totalAnnualLeaveDays, 10).toString() || '0',
                          parseInt(report.totalWeeklyLeaveDays, 10).toString() || '0',
                          parseFloat(report.overtimeValue).toFixed(2),
                          parseFloat(report.totalOvertime).toFixed(2),
                          parseInt(report.totalAbsenceDays, 10).toString() || '0',
                          parseInt(report.totalWorkDays, 10).toString() || '0',
                          parseFloat(report.totalWorkHours).toFixed(2),
                          parseFloat(report.mealAllowance).toFixed(2),
                          parseFloat(report.socialInsurance).toFixed(2),
                          parseFloat(report.medicalInsurance).toFixed(2),
                          parseFloat(report.baseSalary).toFixed(2),
                          parseFloat(report.eidBonus || 0).toFixed(2),
                          report.department,
                          report.fullName,
                          report.code,
                        ].map(
                          (value) =>
                            new TableCell({
                              children: [
                                new Paragraph({
                                  text: value,
                                  alignment: 'right',
                                  children: [
                                    new TextRun({
                                      font: 'Arial',
                                      size: 20,
                                      rightToLeft: true,
                                    }),
                                  ],
                                }),
                              ],
                              width: { size: 4.17, type: WidthType.PERCENTAGE },
                            })
                        ),
                      })
                  ),
                  // صف الإجمالي
                  new TableRow({
                    children: [
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.netSalary || 0), 0).toFixed(2),
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.totalViolationsValue || 0), 0).toFixed(2),
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.violationsInstallment || 0), 0).toFixed(2),
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.penaltiesValue || 0), 0).toFixed(2),
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.deductionsValue || 0), 0).toFixed(2),
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.totalDeductions || 0), 0).toFixed(2),
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.lateDeductionDays || 0), 0).toFixed(2),
                      salaryReports.reduce((sum, report) => sum + (parseInt(report.totalAnnualLeaveYear, 10) || 0), 0).toString(),
                      salaryReports.reduce((sum, report) => sum + (parseInt(report.totalMedicalLeaveDays, 10) || 0), 0).toString(),
                      salaryReports.reduce((sum, report) => sum + (parseInt(report.totalAnnualLeaveDays, 10) || 0), 0).toString(),
                      salaryReports.reduce((sum, report) => sum + (parseInt(report.totalWeeklyLeaveDays, 10) || 0), 0).toString(),
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.overtimeValue || 0), 0).toFixed(2),
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.totalOvertime || 0), 0).toFixed(2),
                      salaryReports.reduce((sum, report) => sum + (parseInt(report.totalAbsenceDays, 10) || 0), 0).toString(),
                      salaryReports.reduce((sum, report) => sum + (parseInt(report.totalWorkDays, 10) || 0), 0).toString(),
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.totalWorkHours || 0), 0).toFixed(2),
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.mealAllowance || 0), 0).toFixed(2),
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.socialInsurance || 0), 0).toFixed(2),
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.medicalInsurance || 0), 0).toFixed(2),
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.baseSalary || 0), 0).toFixed(2),
                      salaryReports.reduce((sum, report) => sum + parseFloat(report.eidBonus || 0), 0).toFixed(2),
                      'الإجمالي',
                      '',
                      '',
                    ].map(
                      (value) =>
                        new TableCell({
                          children: [
                            new Paragraph({
                              text: value,
                              alignment: 'right',
                              children: [
                                new TextRun({
                                  font: 'Arial',
                                  size: 20,
                                  bold: true,
                                  rightToLeft: true,
                                }),
                              ],
                            }),
                          ],
                          width: { size: 4.17, type: WidthType.PERCENTAGE },
                        })
                    ),
                  }),
                ],
              }),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, 'تقرير_المرتب_الشهري.docx');
    } catch (err) {
      console.error('Error exporting to Word:', err.message);
      setError('خطأ أثناء تصدير ملف Word: ' + err.message);
    }
  };

  // إذا لم يكن المستخدم أدمن، لا يتم عرض الصفحة
  if (!user || user.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <div className="container mx-auto p-6">
        {/* قسم البحث */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white p-6 rounded-xl shadow-md border border-gray-100 mb-6"
        >
          <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">البحث في تقرير المرتب الشهري</h2>
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-red-100 text-red-700 p-3 rounded-md mb-4 text-right"
            >
              {error}
            </motion.div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                كود الموظف
              </label>
              <input
                type="text"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="أدخل كود الموظف"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                من تاريخ
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                إلى تاريخ
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>
          <div className="flex justify-end gap-4 mt-4">
            <motion.button
              onClick={handleSearch}
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-300 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'جارٍ البحث...' : 'بحث'}
            </motion.button>
            <motion.button
              onClick={handleShowAll}
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors duration-300 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'جارٍ الجلب...' : 'عرض الكل'}
            </motion.button>
            <motion.button
              onClick={handleExportToExcel}
              disabled={loading || salaryReports.length === 0}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors duration-300 ${
                loading || salaryReports.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              تصدير إلى Excel
            </motion.button>
            <motion.button
              onClick={handleExportToWord}
              disabled={loading || salaryReports.length === 0}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-blue-800 text-white px-4 py-2 rounded-md hover:bg-blue-900 transition-colors duration-300 ${
                loading || salaryReports.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              تصدير إلى Word
            </motion.button>
          </div>
        </motion.div>

        {/* نموذج التعديل */}
        <AnimatePresence>
          {editingReport && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            >
              <motion.div
                className="bg-white p-6 rounded-xl shadow-lg w-full max-w-4xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">تعديل تقرير المرتب</h2>
                {error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-red-100 text-red-700 p-3 rounded-md mb-4 text-right"
                  >
                    {error}
                  </motion.div>
                )}
                <form onSubmit={handleEditSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      كود الموظف
                    </label>
                    <input
                      type="text"
                      name="code"
                      value={editForm.code}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      required
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      الاسم الكامل
                    </label>
                    <input
                      type="text"
                      name="fullName"
                      value={editForm.fullName}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      القسم
                    </label>
                    <input
                      type="text"
                      name="department"
                      value={editForm.department}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      الراتب الأساسي
                    </label>
                    <input
                      type="number"
                      name="baseSalary"
                      value={editForm.baseSalary}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      required
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      التأمين الطبي
                    </label>
                    <input
                      type="number"
                      name="medicalInsurance"
                      value={editForm.medicalInsurance}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      التأمين الاجتماعي
                    </label>
                    <input
                      type="number"
                      name="socialInsurance"
                      value={editForm.socialInsurance}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      عيدية
                    </label>
                    <input
                      type="number"
                      name="eidBonus"
                      value={editForm.eidBonus}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      بدل الوجبة
                    </label>
                    <input
                      type="number"
                      name="mealAllowance"
                      value={editForm.mealAllowance}
                      className="w-full px-3 py-2 border rounded-lg text-right bg-gray-100 cursor-not-allowed"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      إجمالي ساعات العمل
                    </label>
                    <input
                      type="number"
                      name="totalWorkHours"
                      value={editForm.totalWorkHours}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      إجمالي أيام العمل
                    </label>
                    <input
                      type="number"
                      name="totalWorkDays"
                      value={editForm.totalWorkDays}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      إجمالي أيام الغياب
                    </label>
                    <input
                      type="number"
                      name="totalAbsenceDays"
                      value={editForm.totalAbsenceDays}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      خصم التأخير (أيام)
                    </label>
                    <input
                      type="number"
                      name="lateDeductionDays"
                      value={editForm.lateDeductionDays}
                      className="w-full px-3 py-2 border rounded-lg text-right bg-gray-100 cursor-not-allowed"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      إجمالي الخصومات (أيام)
                    </label>
                    <input
                      type="number"
                      name="totalDeductions"
                      value={editForm.totalDeductions}
                      className="w-full px-3 py-2 border rounded-lg text-right bg-gray-100 cursor-not-allowed"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      قيمة الخصومات
                    </label>
                    <input
                      type="number"
                      name="deductionsValue"
                      value={editForm.deductionsValue}
                      className="w-full px-3 py-2 border rounded-lg text-right bg-gray-100 cursor-not-allowed"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      إجمالي الساعات الإضافية
                    </label>
                    <input
                      type="number"
                      name="totalOvertime"
                      value={editForm.totalOvertime}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      قيمة الساعات الإضافية
                    </label>
                    <input
                      type="number"
                      name="overtimeValue"
                      value={editForm.overtimeValue}
                      className="w-full px-3 py-2 border rounded-lg text-right bg-gray-100 cursor-not-allowed"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      إجمالي أيام الإجازة الأسبوعية
                    </label>
                    <input
                      type="number"
                      name="totalWeeklyLeaveDays"
                      value={editForm.totalWeeklyLeaveDays}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      إجمالي أيام الإجازة السنوية (الفترة)
                    </label>
                    <input
                      type="number"
                      name="totalAnnualLeaveDays"
                      value={editForm.totalAnnualLeaveDays}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      إجمالي أيام الإجازة الطبية
                    </label>
                    <input
                      type="number"
                      name="totalMedicalLeaveDays"
                      value={editForm.totalMedicalLeaveDays}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      إجمالي أيام الإجازة السنوية (السنة)
                    </label>
                    <input
                      type="number"
                      name="totalAnnualLeaveYear"
                      value={editForm.totalAnnualLeaveYear}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      قيمة الجزاءات
                    </label>
                    <input
                      type="number"
                      name="penaltiesValue"
                      value={editForm.penaltiesValue}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      قسط المخالفات
                    </label>
                    <input
                      type="number"
                      name="violationsInstallment"
                      value={editForm.violationsInstallment}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      إجمالي قيمة المخالفات
                    </label>
                    <input
                      type="number"
                      name="totalViolationsValue"
                      value={editForm.totalViolationsValue}
                      onChange={handleEditChange}
                      className="w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="md:col-span-3 flex justify-end gap-4">
                    <motion.button
                      type="submit"
                      disabled={loading}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-300 ${
                        loading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {loading ? 'جارٍ الحفظ...' : 'حفظ'}
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={handleEditCancel}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors duration-300"
                    >
                      إلغاء
                    </motion.button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* جدول التقارير */}
        {salaryReports.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="bg-white p-6 rounded-xl shadow-md border border-gray-100"
          >
            <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">تقرير المرتب الشهري</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      كود الموظف
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      الاسم
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      القسم
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      الراتب الأساسي
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      التأمين الطبي
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      التأمين الاجتماعي
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      بدل الوجبة
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      عيدية
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      إجمالي ساعات العمل
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      إجمالي أيام العمل
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      إجمالي أيام الغياب
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      خصم التأخير (أيام)
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      إجمالي الخصومات (أيام)
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      قيمة الخصومات
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      إجمالي الساعات الإضافية
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      قيمة الساعات الإضافية
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      إجمالي أيام الإجازة الأسبوعية
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      إجمالي أيام الإجازة السنوية (الفترة)
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      إجمالي أيام الإجازة الطبية
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      إجمالي أيام الإجازة السنوية (السنة)
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      قيمة الجزاءات
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      قسط المخالفات
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      إجمالي قيمة المخالفات
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      الراتب الصافي
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      إجراءات
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {salaryReports.map((report, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{report.code}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{report.fullName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{report.department}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.baseSalary).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.medicalInsurance).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.socialInsurance).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.mealAllowance).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.eidBonus || 0).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.totalWorkHours).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseInt(report.totalWorkDays, 10) || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseInt(report.totalAbsenceDays, 10) || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.lateDeductionDays || 0).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.totalDeductions).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.deductionsValue || 0).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.totalOvertime).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.overtimeValue).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseInt(report.totalWeeklyLeaveDays, 10) || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseInt(report.totalAnnualLeaveDays, 10) || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseInt(report.totalMedicalLeaveDays, 10) || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseInt(report.totalAnnualLeaveYear, 10) || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.penaltiesValue || 0).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.violationsInstallment || 0).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.totalViolationsValue || 0).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">{parseFloat(report.netSalary).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <motion.button
                          onClick={() => handleEditClick(report)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="bg-yellow-500 text-white px-3 py-1 rounded-md hover:bg-yellow-600 transition-colors duration-300"
                        >
                          تعديل
                        </motion.button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* إذا لم تكن هناك تقارير */}
        {salaryReports.length === 0 && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white p-6 rounded-xl shadow-md border border-gray-100 text-center"
          >
            <p className="text-gray-700">لا توجد تقارير متاحة. يرجى البحث أو عرض جميع التقارير.</p>
          </motion.div>
        )}

        {/* مؤشر التحميل */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-center items-center mt-6"
          >
            <div className="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-12 w-12"></div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default MonthlySalaryReport;
