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
  const [isCreatingMission, setIsCreatingMission] = useState(false);
  const [isCreatingMedicalLeave, setIsCreatingMedicalLeave] = useState(false);
  const [missionDetails, setMissionDetails] = useState({
    code: '',
    date: '',
    checkIn: '',
    checkOut: '',
    missionType: 'مهمة رسمية',
    description: '',
  });
  const [medicalLeaveDetails, setMedicalLeaveDetails] = useState({
    code: '',
    dateFrom: '',
    dateTo: '',
  });
  const [loading, setLoading] = useState(false);
  const [showSingleFingerprint, setShowSingleFingerprint] = useState(false);
  const [showAbsenceDays, setShowAbsenceDays] = useState(false);

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

  const calculateTotals = () => {
    const totals = filteredReports.reduce(
      (acc, report) => {
        const isWorkDay = report.absence === 'لا' && 
                         report.weeklyLeaveDays === 0 && 
                         report.annualLeave === 'لا' && 
                         report.medicalLeave === 'لا';
        const isAbsenceDay = report.absence === 'نعم';

        acc.totalWorkHours += report.workHours || 0;
        acc.totalWorkDays += isWorkDay ? 1 : 0;
        acc.totalAbsenceDays += isAbsenceDay ? 1 : 0;
        acc.totalDeductions += (report.lateDeduction || 0) + 
                              (report.earlyLeaveDeduction || 0) + 
                              (report.medicalLeaveDeduction || 0);
        acc.totalOvertime += report.overtime || 0;
        acc.totalWeeklyLeaveDays += report.weeklyLeaveDays || 0;
        acc.totalAnnualLeaveDays += report.annualLeave === 'نعم' ? 1 : 0;
        acc.totalMedicalLeaveDays += report.medicalLeave === 'نعم' ? 1 : 0;
        acc.annualLeaveBalance = report.annualLeaveBalance || 21;

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
        annualLeaveBalance: 21,
      }
    );

    console.log(`Calculated totals: Work Hours=${totals.totalWorkHours}, Work Days=${totals.totalWorkDays}, Absence Days=${totals.totalAbsenceDays}, Deductions=${totals.totalDeductions}, Overtime=${totals.totalOvertime}, Weekly Leave=${totals.totalWeeklyLeaveDays}, Annual Leave=${totals.totalAnnualLeaveDays}, Medical Leave=${totals.totalMedicalLeaveDays}`);

    return {
      totalWorkHours: totals.totalWorkHours.toFixed(2),
      totalWorkDays: totals.totalWorkDays,
      totalAbsenceDays: totals.totalAbsenceDays,
      totalDeductions: totals.totalDeductions.toFixed(2),
      totalOvertime: totals.totalOvertime.toFixed(2),
      totalWeeklyLeaveDays: totals.totalWeeklyLeaveDays,
      totalAnnualLeaveDays: totals.totalAnnualLeaveDays,
      totalMedicalLeaveDays: totals.totalMedicalLeaveDays,
      annualLeaveBalance: totals.annualLeaveBalance,
    };
  };

  const totals = calculateTotals();

  if (!user || user.role !== 'admin') return null;

  const handleFileChange = (e) => setFile(e.target.files[0]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return alert('يرجى اختيار ملف أولاً');
    setLoading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/fingerprints/upload`,
        fd,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      setReports(res.data.reports);
      setFile(null);
      alert('تم رفع الملف وتحديث البيانات بنجاح');
    } catch (err) {
      console.error('Error uploading file:', err.response?.data?.error || err.message);
      alert(`خطأ أثناء رفع الملف: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/fingerprints`,
        {
          params: { code: searchCode, dateFrom, dateTo },
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      setReports(res.data.reports);
    } catch (err) {
      console.error('Error searching reports:', err.response?.data?.error || err.message);
      alert(`خطأ أثناء البحث: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleShowAll = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/fingerprints`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      setReports(res.data.reports);
      setSearchCode('');
      setDateFrom('');
      setDateTo('');
    } catch (err) {
      console.error('Error fetching all reports:', err.response?.data?.error || err.message);
      alert(`خطأ أثناء جلب جميع السجلات: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllFingerprints = async () => {
    if (!window.confirm('هل أنت متأكد من حذف جميع سجلات البصمات؟ هذه العملية لا يمكن التراجع عنها!')) {
      return;
    }
    setLoading(true);
    try {
      const res = await axios.delete(
        `${process.env.REACT_APP_API_URL}/api/fingerprints/all`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      setReports([]);
      setFilteredReports([]);
      alert(`تم حذف ${res.data.deletedCount} سجل بصمة بنجاح`);
    } catch (err) {
      console.error('Error deleting all fingerprints:', err.response?.data?.error || err.message);
      alert(`خطأ أثناء الحذف: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditReport = (updatedReport) => {
    setReports((prev) =>
      prev.map((report) => (report._id === updatedReport._id ? updatedReport : report))
    );
  };

  const handleCreateMission = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const missionDate = DateTime.fromISO(missionDetails.date, { zone: 'Africa/Cairo' });
      if (!missionDate.isValid) {
        throw new Error('تاريخ المأمورية غير صالح');
      }

      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
      if (
        (missionDetails.checkIn && !timeRegex.test(missionDetails.checkIn)) ||
        (missionDetails.checkOut && !timeRegex.test(missionDetails.checkOut))
      ) {
        throw new Error('تنسيق الوقت غير صالح، يجب أن يكون HH:mm:ss');
      }

      const checkIn = missionDetails.checkIn
        ? DateTime.fromFormat(
            `${missionDetails.date} ${missionDetails.checkIn}`,
            'yyyy-MM-dd HH:mm:ss',
            { zone: 'Africa/Cairo' }
          ).toJSDate()
        : null;
      const checkOut = missionDetails.checkOut
        ? DateTime.fromFormat(
            `${missionDetails.date} ${missionDetails.checkOut}`,
            'yyyy-MM-dd HH:mm:ss',
            { zone: 'Africa/Cairo' }
          ).toJSDate()
        : null;

      const workHours = checkIn && checkOut ? 8 : 0;

      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/fingerprints/mission`,
        {
          code: missionDetails.code,
          date: missionDetails.date,
          checkIn: missionDetails.checkIn || null,
          checkOut: missionDetails.checkOut || null,
          missionType: missionDetails.missionType,
          description: missionDetails.description,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setReports((prev) => [
        ...prev.filter((r) => r._id !== response.data.report._id),
        {
          ...response.data.report,
          workHours,
          absence: 'لا',
          annualLeave: 'لا',
          medicalLeave: 'لا',
        },
      ]);
      setIsCreatingMission(false);
      setMissionDetails({ code: '', date: '', checkIn: '', checkOut: '', missionType: 'مهمة رسمية', description: '' });
      alert('تم إنشاء المأمورية بنجاح');
    } catch (err) {
      console.error('Error creating mission:', err.response?.data?.error || err.message);
      alert(`خطأ أثناء إنشاء المأمورية: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMedicalLeave = async (e) => {
    e.preventDefault();
    setLoading(true);
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
      setIsCreatingMedicalLeave(false);
      setMedicalLeaveDetails({ code: '', dateFrom: '', dateTo: '' });
      alert('تم إنشاء الإجازة الطبية بنجاح');
    } catch (err) {
      console.error('Error creating medical leave:', err.response?.data?.error || err.message);
      alert(`خطأ أثناء إنشاء الإجازة الطبية: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMissionChange = (e) => {
    const { name, value } = e.target;
    setMissionDetails((prev) => ({ ...prev, [name]: value }));
  };

  const handleMedicalLeaveChange = (e) => {
    const { name, value } = e.target;
    setMedicalLeaveDetails((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <div className="container mx-auto p-6">
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
              onClick={() => setIsCreatingMission(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors duration-300"
            >
              إنشاء مأمورية
            </motion.button>
            <motion.button
              onClick={() => setIsCreatingMedicalLeave(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 transition-colors duration-300"
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
              />
              عرض البصمات الفردية فقط
            </label>
            <label className="flex items-center text-gray-700 text-sm font-medium">
              <input
                type="checkbox"
                checked={showAbsenceDays}
                onChange={() => setShowAbsenceDays(!showAbsenceDays)}
                className="mr-2"
              />
              عرض أيام الغياب فقط
            </label>
          </div>
        </motion.div>

        {/* نموذج إنشاء مأمورية */}
        <AnimatePresence>
          {isCreatingMission && (
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
                <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">إنشاء مأمورية</h2>
                <form onSubmit={handleCreateMission} className="space-y-4">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      كود الموظف
                    </label>
                    <input
                      type="text"
                      name="code"
                      value={missionDetails.code}
                      onChange={handleMissionChange}
                      className="w-full px-3 py-2 border rounded-lg text-right"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      تاريخ المأمورية
                    </label>
                    <input
                      type="date"
                      name="date"
                      value={missionDetails.date}
                      onChange={handleMissionChange}
                      className="w-full px-3 py-2 border rounded-lg text-right"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      توقيت الحضور
                    </label>
                    <input
                      type="text"
                      name="checkIn"
                      value={missionDetails.checkIn}
                      onChange={handleMissionChange}
                      className="w-full px-3 py-2 border rounded-lg text-right"
                      placeholder="HH:mm:ss"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      توقيت الانصراف
                    </label>
                    <input
                      type="text"
                      name="checkOut"
                      value={missionDetails.checkOut}
                      onChange={handleMissionChange}
                      className="w-full px-3 py-2 border rounded-lg text-right"
                      placeholder="HH:mm:ss"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      نوع المأمورية
                    </label>
                    <select
                      name="missionType"
                      value={missionDetails.missionType}
                      onChange={handleMissionChange}
                      className="w-full px-3 py-2 border rounded-lg text-right"
                    >
                      <option value="مهمة رسمية">مهمة رسمية</option>
                      <option value="تدريب">تدريب</option>
                      <option value="أخرى">أخرى</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      الوصف
                    </label>
                    <textarea
                      name="description"
                      value={missionDetails.description}
                      onChange={handleMissionChange}
                      className="w-full px-3 py-2 border rounded-lg text-right"
                      rows="4"
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
                      onClick={() => setIsCreatingMission(false)}
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
        {filteredReports.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="bg-white p-6 rounded-xl shadow-md border border-gray-100 mb-6"
          >
            <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">التقارير</h2>
            <ReportTable reports={filteredReports} onEdit={handleEditReport} />
            <div className="mt-4 text-right">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">إجماليات الفترة</h3>
              <p>إجمالي ساعات العمل: {totals.totalWorkHours} ساعة</p>
              <p>إجمالي أيام العمل: {totals.totalWorkDays} يوم</p>
              <p>إجمالي أيام الغياب: {totals.totalAbsenceDays} يوم</p>
              <p>إجمالي الخصومات: {totals.totalDeductions} يوم</p>
              <p>إجمالي الساعات الإضافية: {totals.totalOvertime} ساعة</p>
              <p>إجمالي أيام الإجازة الأسبوعية: {totals.totalWeeklyLeaveDays} يوم</p>
              <p>إجمالي أيام الإجازة السنوية (الفترة): {totals.totalAnnualLeaveDays} يوم</p>
              <p>إجمالي أيام الإجازة الطبية: {totals.totalMedicalLeaveDays} يوم</p>
              <p>رصيد الإجازات السنوية: {totals.annualLeaveBalance} يوم</p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default UploadFingerprint;
