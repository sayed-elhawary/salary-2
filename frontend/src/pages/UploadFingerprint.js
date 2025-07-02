import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../components/AuthProvider';
import NavBar from '../components/NavBar';
import ReportTable from '../components/ReportTable';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { DateTime } from 'luxon';

const UploadFingerprint = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [searchCode, setSearchCode] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reports, setReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [isCreatingOfficialLeave, setIsCreatingOfficialLeave] = useState(false);
  const [isCreatingLeaveCompensation, setIsCreatingLeaveCompensation] = useState(false);
  const [isCreatingMedicalLeave, setIsCreatingMedicalLeave] = useState(false);
  const [officialLeaveDetails, setOfficialLeaveDetails] = useState({
    code: '',
    applyToAll: false,
    dateFrom: '',
    dateTo: '',
  });
  const [leaveCompensationDetails, setLeaveCompensationDetails] = useState({
    code: '',
    days: '',
  });
  const [medicalLeaveDetails, setMedicalLeaveDetails] = useState({
    code: '',
    dateFrom: '',
    dateTo: '',
  });
  const [loading, setLoading] = useState(false);
  const [showSingleFingerprint, setShowSingleFingerprint] = useState(false);
  const [showAbsenceDays, setShowAbsenceDays] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    let filtered = reports;
    if (showSingleFingerprint) {
      filtered = filtered.filter(report => report.isSingleFingerprint === 'نعم');
    }
    if (showAbsenceDays) {
      filtered = filtered.filter(report => report.absence === 'نعم');
    }
    setFilteredReports(filtered);
    console.log(`Filtered reports: ${filtered.length}, Absence days shown: ${showAbsenceDays}, Single fingerprints shown: ${showSingleFingerprint}`);
  }, [reports, showSingleFingerprint, showAbsenceDays]);

  const isWeeklyLeaveDay = (date, workDaysPerWeek) => {
    const dayOfWeek = DateTime.fromJSDate(date, { zone: 'Africa/Cairo' }).weekday;
    return (workDaysPerWeek === 5 && (dayOfWeek === 5 || dayOfWeek === 6)) ||
           (workDaysPerWeek === 6 && dayOfWeek === 5);
  };

  const calculateTotals = () => {
    const totals = filteredReports.reduce(
      (acc, report) => {
        const isWeeklyLeave = isWeeklyLeaveDay(new Date(report.date), report.workDaysPerWeek || 6);
        const isWorkDay = !isWeeklyLeave &&
                         report.absence === 'لا' &&
                         report.annualLeave === 'لا' &&
                         report.medicalLeave === 'لا' &&
                         report.officialLeave === 'لا' &&
                         report.leaveCompensation === 'لا';
        const isAbsenceDay = report.absence === 'نعم';
        const isLateDay = (report.lateDeduction || 0) > 0;

        acc.totalWorkHours += report.workHours || 0;
        acc.totalWorkDays += isWorkDay ? 1 : 0;
        acc.totalAbsenceDays += isAbsenceDay ? 1 : 0;
        acc.totalLateDays += isLateDay ? 1 : 0;
        acc.totalDeductions += (report.lateDeduction || 0) +
                              (report.earlyLeaveDeduction || 0) +
                              (report.medicalLeaveDeduction || 0);
        acc.totalOvertime += report.overtime || 0;
        acc.totalWeeklyLeaveDays += isWeeklyLeave ? 1 : 0;
        acc.totalAnnualLeaveDays += report.annualLeave === 'نعم' ? 1 : 0;
        acc.totalMedicalLeaveDays += report.medicalLeave === 'نعم' ? 1 : 0;
        acc.totalOfficialLeaveDays += report.officialLeave === 'نعم' ? 1 : 0;
        acc.totalLeaveCompensationDays += report.leaveCompensation === 'نعم' ? 1 : 0;
        acc.annualLeaveBalance = report.annualLeaveBalance || 21;

        return acc;
      },
      {
        totalWorkHours: 0,
        totalWorkDays: 0,
        totalAbsenceDays: 0,
        totalLateDays: 0,
        totalDeductions: 0,
        totalOvertime: 0,
        totalWeeklyLeaveDays: 0,
        totalAnnualLeaveDays: 0,
        totalMedicalLeaveDays: 0,
        totalOfficialLeaveDays: 0,
        totalLeaveCompensationDays: 0,
        annualLeaveBalance: 21,
      }
    );

    console.log(`Calculated totals: Work Hours=${totals.totalWorkHours}, Work Days=${totals.totalWorkDays}, Absence Days=${totals.totalAbsenceDays}, Late Days=${totals.totalLateDays}, Deductions=${totals.totalDeductions}, Overtime=${totals.totalOvertime}, Weekly Leave=${totals.totalWeeklyLeaveDays}, Annual Leave=${totals.totalAnnualLeaveDays}, Medical Leave=${totals.totalMedicalLeaveDays}, Official Leave=${totals.totalOfficialLeaveDays}, Leave Compensation=${totals.totalLeaveCompensationDays}`);

    return {
      totalWorkHours: totals.totalWorkHours.toFixed(2),
      totalWorkDays: totals.totalWorkDays,
      totalAbsenceDays: totals.totalAbsenceDays,
      totalLateDays: totals.totalLateDays,
      totalDeductions: totals.totalDeductions.toFixed(2),
      totalOvertime: totals.totalOvertime.toFixed(2),
      totalWeeklyLeaveDays: totals.totalWeeklyLeaveDays,
      totalAnnualLeaveDays: totals.totalAnnualLeaveDays,
      totalMedicalLeaveDays: totals.totalMedicalLeaveDays,
      totalOfficialLeaveDays: totals.totalOfficialLeaveDays,
      totalLeaveCompensationDays: totals.totalLeaveCompensationDays,
      annualLeaveBalance: totals.annualLeaveBalance,
    };
  };

  const totals = calculateTotals();

  if (!user || user.role !== 'admin') return null;

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setErrorMessage('');
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setErrorMessage('يرجى اختيار ملف أولاً');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/fingerprints/upload`,
        fd,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      setReports(res.data.reports);
      setFilteredReports(res.data.reports);
      setFile(null);
      setErrorMessage('');
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      console.error('Error uploading file:', errorMsg);
      setErrorMessage(`خطأ أثناء رفع الملف: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchCode || !dateFrom || !dateTo) {
      setErrorMessage('يرجى إدخال كود الموظف وتاريخ البداية والنهاية');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/fingerprints`,
        {
          params: { code: searchCode, dateFrom, dateTo },
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      setReports(res.data.reports);
      setFilteredReports(res.data.reports);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      console.error('Error searching reports:', errorMsg);
      setErrorMessage(`خطأ أثناء البحث: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleShowAll = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/fingerprints`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      setReports(res.data.reports);
      setFilteredReports(res.data.reports);
      setSearchCode('');
      setDateFrom('');
      setDateTo('');
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      console.error('Error fetching all reports:', errorMsg);
      setErrorMessage(`خطأ أثناء جلب جميع السجلات: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllFingerprints = async () => {
    if (!window.confirm('هل أنت متأكد من حذف جميع سجلات البصمات؟ هذه العملية لا يمكن التراجع عنها!')) {
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await axios.delete(
        `${process.env.REACT_APP_API_URL}/api/fingerprints/all`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      setReports([]);
      setFilteredReports([]);
      setErrorMessage('');
      alert(`تم حذف ${res.data.deletedCount} سجل بصمة بنجاح`);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      console.error('Error deleting all fingerprints:', errorMsg);
      setErrorMessage(`خطأ أثناء الحذف: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditReport = (updatedReport) => {
    setReports((prev) =>
      prev.map((report) => (report._id === updatedReport._id ? updatedReport : report))
    );
    setFilteredReports((prev) =>
      prev.map((report) => (report._id === updatedReport._id ? updatedReport : report))
    );
  };

  const handleCreateOfficialLeave = async (e) => {
    e.preventDefault();
    if (!officialLeaveDetails.dateFrom || !officialLeaveDetails.dateTo) {
      setErrorMessage('يرجى إدخال تاريخ البداية والنهاية');
      return;
    }
    if (!officialLeaveDetails.applyToAll && !officialLeaveDetails.code) {
      setErrorMessage('يرجى إدخال كود الموظف أو اختيار تطبيق على الجميع');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const startDate = DateTime.fromISO(officialLeaveDetails.dateFrom, { zone: 'Africa/Cairo' });
      const endDate = DateTime.fromISO(officialLeaveDetails.dateTo, { zone: 'Africa/Cairo' });

      if (!startDate.isValid || !endDate.isValid) {
        throw new Error('تاريخ البداية أو النهاية غير صالح');
      }

      if (startDate > endDate) {
        throw new Error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
      }

      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/fingerprints/official-leave`,
        {
          code: officialLeaveDetails.applyToAll ? null : officialLeaveDetails.code,
          dateFrom: officialLeaveDetails.dateFrom,
          dateTo: officialLeaveDetails.dateTo,
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      setReports((prev) => [
        ...prev.filter((r) => !response.data.reports.some((newR) => newR._id === r._id)),
        ...response.data.reports,
      ]);
      setFilteredReports((prev) => [
        ...prev.filter((r) => !response.data.reports.some((newR) => newR._id === r._id)),
        ...response.data.reports,
      ]);
      setIsCreatingOfficialLeave(false);
      setOfficialLeaveDetails({ code: '', applyToAll: false, dateFrom: '', dateTo: '' });
      setErrorMessage('');
      alert('تم إنشاء الإجازة الرسمية بنجاح');
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      console.error('Error creating official leave:', errorMsg);
      setErrorMessage(`خطأ أثناء إنشاء الإجازة الرسمية: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLeaveCompensation = async (e) => {
    e.preventDefault();
    if (!leaveCompensationDetails.code || !leaveCompensationDetails.days) {
      setErrorMessage('يرجى إدخال كود الموظف وعدد أيام بدل الإجازة');
      return;
    }
    if (isNaN(leaveCompensationDetails.days) || leaveCompensationDetails.days <= 0) {
      setErrorMessage('عدد أيام بدل الإجازة يجب أن يكون رقمًا صحيحًا أكبر من 0');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/fingerprints/leave-compensation`,
        {
          code: leaveCompensationDetails.code,
          days: parseInt(leaveCompensationDetails.days),
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      setReports((prev) => [
        ...prev.filter((r) => !response.data.reports.some((newR) => newR._id === r._id)),
        ...response.data.reports,
      ]);
      setFilteredReports((prev) => [
        ...prev.filter((r) => !response.data.reports.some((newR) => newR._id === r._id)),
        ...response.data.reports,
      ]);
      setIsCreatingLeaveCompensation(false);
      setLeaveCompensationDetails({ code: '', days: '' });
      setErrorMessage('');
      alert('تم إنشاء بدل الإجازة بنجاح');
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      console.error('Error creating leave compensation:', errorMsg);
      setErrorMessage(`خطأ أثناء إنشاء بدل الإجازة: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMedicalLeave = async (e) => {
    e.preventDefault();
    if (!medicalLeaveDetails.code || !medicalLeaveDetails.dateFrom || !medicalLeaveDetails.dateTo) {
      setErrorMessage('يرجى إدخال كود الموظف وتاريخ البداية والنهاية');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const startDate = DateTime.fromISO(medicalLeaveDetails.dateFrom, { zone: 'Africa/Cairo' });
      const endDate = DateTime.fromISO(medicalLeaveDetails.dateTo, { zone: 'Africa/Cairo' });

      if (!startDate.isValid || !endDate.isValid) {
        throw new Error('تاريخ البداية أو النهاية غير صالح');
      }

      if (startDate > endDate) {
        throw new Error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
      }

      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/fingerprints/medical-leave`,
        {
          code: medicalLeaveDetails.code,
          dateFrom: medicalLeaveDetails.dateFrom,
          dateTo: medicalLeaveDetails.dateTo,
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      setReports((prev) => [
        ...prev.filter((r) => !response.data.reports.some((newR) => newR._id === r._id)),
        ...response.data.reports,
      ]);
      setFilteredReports((prev) => [
        ...prev.filter((r) => !response.data.reports.some((newR) => newR._id === r._id)),
        ...response.data.reports,
      ]);
      setIsCreatingMedicalLeave(false);
      setMedicalLeaveDetails({ code: '', dateFrom: '', dateTo: '' });
      setErrorMessage('');
      alert('تم إنشاء الإجازة الطبية بنجاح');
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      console.error('Error creating medical leave:', errorMsg);
      setErrorMessage(`خطأ أثناء إنشاء الإجازة الطبية: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOfficialLeaveChange = (e) => {
    const { name, value, type, checked } = e.target;
    setOfficialLeaveDetails((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleLeaveCompensationChange = (e) => {
    const { name, value } = e.target;
    setLeaveCompensationDetails((prev) => ({ ...prev, [name]: value }));
  };

  const handleMedicalLeaveChange = (e) => {
    const { name, value } = e.target;
    setMedicalLeaveDetails((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <div className="container mx-auto p-6">
        {/* عرض رسالة الخطأ */}
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-100 text-red-700 p-4 rounded-lg mb-6 text-right"
          >
            {errorMessage}
          </motion.div>
        )}

        {/* قسم رفع ملف البصمات */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white p-6 rounded-xl shadow-md border border-gray-100 mb-6"
        >
          <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">رفع ملف البصمات</h2>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                اختر ملف Excel
              </label>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border rounded-lg text-right"
                disabled={loading}
              />
            </div>
            <motion.button
              type="submit"
              disabled={loading || !file}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-300 ${
                loading || !file ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'جارٍ الرفع...' : 'رفع الملف'}
            </motion.button>
          </form>
        </motion.div>

        {/* قسم البحث */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-white p-6 rounded-xl shadow-md border border-gray-100 mb-6"
        >
          <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">البحث في التقارير</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                كود الموظف
              </label>
              <input
                type="text"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-right"
                placeholder="أدخل كود الموظف"
                disabled={loading}
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
                className="w-full px-3 py-2 border rounded-lg text-right"
                disabled={loading}
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
                className="w-full px-3 py-2 border rounded-lg text-right"
                disabled={loading}
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
              onClick={() => setIsCreatingOfficialLeave(true)}
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-teal-600 text-white px-4 py-2 rounded-md hover:bg-teal-700 transition-colors duration-300 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              إضافة إجازة رسمية
            </motion.button>
            <motion.button
              onClick={() => setIsCreatingLeaveCompensation(true)}
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 transition-colors duration-300 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              إضافة بدل إجازة
            </motion.button>
            <motion.button
              onClick={() => setIsCreatingMedicalLeave(true)}
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 transition-colors duration-300 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              إضافة إجازة طبية
            </motion.button>
            <motion.button
              onClick={handleDeleteAllFingerprints}
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors duration-300 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              حذف جميع البصمات
            </motion.button>
          </div>
          <div className="flex justify-end gap-4 mt-4">
            <label className="flex items-center text-gray-700 text-sm font-medium">
              <input
                type="checkbox"
                checked={showSingleFingerprint}
                onChange={() => setShowSingleFingerprint(!showSingleFingerprint)}
                className="mr-2"
                disabled={loading}
              />
              عرض البصمات الفردية فقط
            </label>
            <label className="flex items-center text-gray-700 text-sm font-medium">
              <input
                type="checkbox"
                checked={showAbsenceDays}
                onChange={() => setShowAbsenceDays(!showAbsenceDays)}
                className="mr-2"
                disabled={loading}
              />
              عرض أيام الغياب فقط
            </label>
          </div>
        </motion.div>

        {/* نموذج إضافة إجازة رسمية */}
        <AnimatePresence>
          {isCreatingOfficialLeave && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            >
              <motion.div
                className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">إضافة إجازة رسمية</h2>
                <form onSubmit={handleCreateOfficialLeave} className="space-y-4">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      تطبيق على الجميع
                    </label>
                    <input
                      type="checkbox"
                      name="applyToAll"
                      checked={officialLeaveDetails.applyToAll}
                      onChange={handleOfficialLeaveChange}
                      className="mr-2"
                      disabled={loading}
                    />
                    <span>نعم</span>
                  </div>
                  {!officialLeaveDetails.applyToAll && (
                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                        كود الموظف
                      </label>
                      <input
                        type="text"
                        name="code"
                        value={officialLeaveDetails.code}
                        onChange={handleOfficialLeaveChange}
                        className="w-full px-3 py-2 border rounded-lg text-right"
                        required
                        disabled={loading}
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      من تاريخ
                    </label>
                    <input
                      type="date"
                      name="dateFrom"
                      value={officialLeaveDetails.dateFrom}
                      onChange={handleOfficialLeaveChange}
                      className="w-full px-3 py-2 border rounded-lg text-right"
                      required
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      إلى تاريخ
                    </label>
                    <input
                      type="date"
                      name="dateTo"
                      value={officialLeaveDetails.dateTo}
                      onChange={handleOfficialLeaveChange}
                      className="w-full px-3 py-2 border rounded-lg text-right"
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="flex justify-end gap-4">
                    <motion.button
                      type="submit"
                      disabled={loading}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-300 ${
                        loading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {loading ? 'جارٍ الإنشاء...' : 'إنشاء'}
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={() => setIsCreatingOfficialLeave(false)}
                      disabled={loading}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors duration-300 ${
                        loading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      إلغاء
                    </motion.button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* نموذج إضافة بدل إجازة */}
        <AnimatePresence>
          {isCreatingLeaveCompensation && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            >
              <motion.div
                className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">إضافة بدل إجازة</h2>
                <form onSubmit={handleCreateLeaveCompensation} className="space-y-4">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      كود الموظف
                    </label>
                    <input
                      type="text"
                      name="code"
                      value={leaveCompensationDetails.code}
                      onChange={handleLeaveCompensationChange}
                      className="w-full px-3 py-2 border rounded-lg text-right"
                      required
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      عدد أيام بدل الإجازة
                    </label>
                    <input
                      type="number"
                      name="days"
                      value={leaveCompensationDetails.days}
                      onChange={handleLeaveCompensationChange}
                      className="w-full px-3 py-2 border rounded-lg text-right"
                      required
                      min="1"
                      disabled={loading}
                    />
                  </div>
                  <div className="flex justify-end gap-4">
                    <motion.button
                      type="submit"
                      disabled={loading}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-300 ${
                        loading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {loading ? 'جارٍ الإنشاء...' : 'إنشاء'}
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={() => setIsCreatingLeaveCompensation(false)}
                      disabled={loading}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors duration-300 ${
                        loading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      إلغاء
                    </motion.button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* نموذج إضافة إجازة طبية */}
        <AnimatePresence>
          {isCreatingMedicalLeave && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            >
              <motion.div
                className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">إضافة إجازة طبية</h2>
                <form onSubmit={handleCreateMedicalLeave} className="space-y-4">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      كود الموظف
                    </label>
                    <input
                      type="text"
                      name="code"
                      value={medicalLeaveDetails.code}
                      onChange={handleMedicalLeaveChange}
                      className="w-full px-3 py-2 border rounded-lg text-right"
                      required
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      من تاريخ
                    </label>
                    <input
                      type="date"
                      name="dateFrom"
                      value={medicalLeaveDetails.dateFrom}
                      onChange={handleMedicalLeaveChange}
                      className="w-full px-3 py-2 border rounded-lg text-right"
                      required
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      إلى تاريخ
                    </label>
                    <input
                      type="date"
                      name="dateTo"
                      value={medicalLeaveDetails.dateTo}
                      onChange={handleMedicalLeaveChange}
                      className="w-full px-3 py-2 border rounded-lg text-right"
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="flex justify-end gap-4">
                    <motion.button
                      type="submit"
                      disabled={loading}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-300 ${
                        loading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {loading ? 'جارٍ الإنشاء...' : 'إنشاء'}
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={() => setIsCreatingMedicalLeave(false)}
                      disabled={loading}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors duration-300 ${
                        loading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
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
        {filteredReports.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="bg-white p-6 rounded-xl shadow-md border border-gray-100 mb-6"
          >
            <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">التقارير</h2>
            <ReportTable reports={filteredReports} onEdit={handleEditReport} />
            <div className="mt-6 text-right">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">إجماليات الفترة</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg shadow-inner">
                <div className="bg-blue-100 p-4 rounded-lg text-right">
                  <p className="text-sm font-medium text-gray-600">إجمالي ساعات العمل</p>
                  <p className="text-lg font-bold text-blue-700">{totals.totalWorkHours} ساعة</p>
                </div>
                <div className="bg-green-100 p-4 rounded-lg text-right">
                  <p className="text-sm font-medium text-gray-600">إجمالي أيام العمل</p>
                  <p className="text-lg font-bold text-green-700">{totals.totalWorkDays} يوم</p>
                </div>
                <div className="bg-red-100 p-4 rounded-lg text-right">
                  <p className="text-sm font-medium text-gray-600">إجمالي أيام الغياب</p>
                  <p className="text-lg font-bold text-red-700">{totals.totalAbsenceDays} يوم</p>
                </div>
                <div className="bg-orange-100 p-4 rounded-lg text-right">
                  <p className="text-sm font-medium text-gray-600">إجمالي أيام التأخير</p>
                  <p className="text-lg font-bold text-orange-700">{totals.totalLateDays} يوم</p>
                </div>
                <div className="bg-yellow-100 p-4 rounded-lg text-right">
                  <p className="text-sm font-medium text-gray-600">إجمالي الخصومات</p>
                  <p className="text-lg font-bold text-yellow-700">{totals.totalDeductions} يوم</p>
                </div>
                <div className="bg-purple-100 p-4 rounded-lg text-right">
                  <p className="text-sm font-medium text-gray-600">إجمالي الساعات الإضافية</p>
                  <p className="text-lg font-bold text-purple-700">{totals.totalOvertime} ساعة</p>
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
                <div className="bg-cyan-100 p-4 rounded-lg text-right">
                  <p className="text-sm font-medium text-gray-600">إجمالي أيام الإجازة الرسمية</p>
                  <p className="text-lg font-bold text-cyan-700">{totals.totalOfficialLeaveDays} يوم</p>
                </div>
                <div className="bg-amber-100 p-4 rounded-lg text-right">
                  <p className="text-sm font-medium text-gray-600">إجمالي أيام بدل الإجازة</p>
                  <p className="text-lg font-bold text-amber-700">{totals.totalLeaveCompensationDays} يوم</p>
                </div>
                <div className="bg-gray-100 p-4 rounded-lg text-right">
                  <p className="text-sm font-medium text-gray-600">رصيد الإجازات السنوية</p>
                  <p className="text-lg font-bold text-gray-700">{totals.annualLeaveBalance} يوم</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default UploadFingerprint;
