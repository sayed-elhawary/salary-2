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
  const [editingReport, setEditingReport] = useState(null);
  const [isCreatingMission, setIsCreatingMission] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSingleFingerprint, setShowSingleFingerprint] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (showSingleFingerprint) {
      const singleFingerprintReports = reports.filter(report => report.isSingleFingerprint);
      setFilteredReports(singleFingerprintReports);
    } else {
      setFilteredReports(reports);
    }
  }, [reports, showSingleFingerprint]);

  const calculateTotals = () => {
    const totalWorkHours = filteredReports.reduce((sum, report) => sum + report.workHours, 0);
    const totalWorkDays = filteredReports.filter(report => !report.absence).length;
    const totalDeductions = filteredReports.reduce(
      (sum, r) => sum + r.lateDeduction + r.earlyLeaveDeduction,
      0
    );
    const totalOvertime = filteredReports.reduce((sum, report) => sum + report.overtime, 0);
    const totalAbsenceDays = filteredReports.filter(report => report.absence).length;
    const totalWeeklyLeaveDays = filteredReports.reduce(
      (sum, report) => sum + (report.weeklyLeaveDays || 0),
      0
    );

    return {
      totalWorkHours: totalWorkHours.toFixed(2),
      totalWorkDays: totalWorkDays + totalWeeklyLeaveDays, // إضافة أيام الإجازة إلى أيام العمل
      totalDeductions: totalDeductions.toFixed(2),
      totalOvertime: totalOvertime.toFixed(2),
      totalAbsenceDays,
      totalWeeklyLeaveDays,
    };
  };

  const totals = calculateTotals();

  if (!user || user.role !== 'admin') return null;

  const handleFileChange = e => setFile(e.target.files[0]);

  const handleUpload = async e => {
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
      alert('تم رفع الملف وتحديث البيانات');
      setFile(null);
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

  const handleEdit = r => {
    setEditingReport({
      ...r,
      checkIn: r.checkIn ? DateTime.fromISO(r.checkIn, { zone: 'Africa/Cairo' }).toFormat('HH:mm:ss') : '',
      checkOut: r.checkOut ? DateTime.fromISO(r.checkOut, { zone: 'Africa/Cairo' }).toFormat('HH:mm:ss') : '',
      date: r.date ? DateTime.fromISO(r.date, { zone: 'Africa/Cairo' }).toFormat('yyyy-MM-dd') : '',
      code: r.code || '',
    });
    setIsCreatingMission(false);
  };

  const handleCreateMission = () => {
    setEditingReport({
      code: '',
      date: '',
      checkIn: '09:00:00',
      checkOut: '17:30:00',
    });
    setIsCreatingMission(true);
  };

  const validateTimeFormat = (time) => {
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    return timeRegex.test(time);
  };

  const handleSave = async () => {
    if (!editingReport) return;
    const { _id, code, date, checkIn, checkOut } = editingReport;

    if (!code || !date) {
      alert('كود الموظف والتاريخ مطلوبان');
      return;
    }
    if ((checkIn && !validateTimeFormat(checkIn)) || (checkOut && !validateTimeFormat(checkOut))) {
      alert('تنسيق الوقت غير صالح، يجب أن يكون HH:mm:ss');
      return;
    }

    setLoading(true);
    try {
      const payload = { code, date, checkIn: checkIn || null, checkOut: checkOut || null };
      console.log('Sending request:', { isCreatingMission, payload });

      let res;
      if (isCreatingMission) {
        res = await axios.post(
          `${process.env.REACT_APP_API_URL}/api/fingerprints/create`,
          payload,
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
        );
        setReports(prev => [...prev, res.data.report]);
      } else {
        res = await axios.put(
          `${process.env.REACT_APP_API_URL}/api/fingerprints/${_id}`,
          payload,
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
        );
        setReports(prev =>
          prev.map(r => (r._id === res.data.report._id ? res.data.report : r))
        );
      }

      console.log('Response:', res.data);
      setEditingReport(null);
      setIsCreatingMission(false);
      alert(isCreatingMission ? 'تم إنشاء سجل المأمورية بنجاح' : 'تم حفظ التعديلات بنجاح');
    } catch (err) {
      console.error('Error saving:', err.response?.data?.error || err.message);
      alert(`خطأ أثناء الحفظ: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMissionAttendance = () => {
    if (!editingReport) return;
    setEditingReport({
      ...editingReport,
      checkIn: '09:00:00',
      checkOut: '17:30:00',
    });
  };

  const handleSingleFingerprintFilter = () => {
    setShowSingleFingerprint(!showSingleFingerprint);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="p-6 max-w-7xl mx-auto"
      >
        <h1 className="text-4xl font-bold text-gray-800 mb-8 text-right">رفع ملف البصمة</h1>

        <div className="bg-white p-6 rounded-xl shadow-md mb-6 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">رفع ملف</h2>
          <form onSubmit={handleUpload} className="flex flex-col gap-4">
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFileChange}
              className="border border-gray-300 p-3 rounded-lg w-full text-right bg-gray-50 hover:bg-gray-100 transition-colors duration-200"
            />
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.05, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              whileTap={{ scale: 0.95 }}
              className="bg-blue-600 text-white px-6 py-3 rounded-full hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 w-32 self-end"
            >
              {loading ? 'جاري الرفع...' : 'رفع'}
            </motion.button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-md mb-6 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">البحث في التقارير</h2>
          <div className="flex flex-col gap-4 md:flex-row md:gap-2">
            <input
              type="text"
              placeholder="كود الموظف"
              value={searchCode}
              onChange={e => setSearchCode(e.target.value)}
              className="p-3 border border-gray-300 rounded-lg flex-1 text-right bg-gray-50 hover:bg-gray-100 transition-colors duration-200"
            />
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="p-3 border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors duration-200"
            />
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="p-3 border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors duration-200"
            />
            <motion.button
              onClick={handleSearch}
              disabled={loading}
              whileHover={{ scale: 1.05, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              whileTap={{ scale: 0.95 }}
              className="bg-blue-600 text-white px-6 py-3 rounded-full hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50"
            >
              {loading ? 'جاري البحث...' : 'بحث'}
            </motion.button>
          </div>
        </div>

        <div className="flex gap-4 mb-6">
          <motion.button
            onClick={handleCreateMission}
            whileHover={{ scale: 1.05, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            whileTap={{ scale: 0.95 }}
            className="bg-green-600 text-white px-6 py-3 rounded-full hover:bg-green-700 transition-colors duration-200"
          >
            إضافة مأمورية جديدة
          </motion.button>
          <motion.button
            onClick={handleSingleFingerprintFilter}
            whileHover={{ scale: 1.05, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            whileTap={{ scale: 0.95 }}
            className={`px-6 py-3 rounded-full transition-colors duration-200 text-white ${
              showSingleFingerprint ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            {showSingleFingerprint ? 'إلغاء فلتر البصمة الواحدة' : 'فلتر البصمات ذات البصمة الواحدة'}
          </motion.button>
          <motion.button
            onClick={handleDeleteAllFingerprints}
            whileHover={{ scale: 1.05, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            whileTap={{ scale: 0.95 }}
            className="bg-red-600 text-white px-6 py-3 rounded-full hover:bg-red-700 transition-colors duration-200"
          >
            حذف جميع البصمات
          </motion.button>
        </div>

        <ReportTable reports={filteredReports} onEdit={handleEdit} />

        {filteredReports.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="bg-white p-6 rounded-xl shadow-md mt-6 border border-gray-100"
          >
            <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">إجماليات الفترة</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              >
                <strong>إجمالي ساعات العمل:</strong> {totals.totalWorkHours} ساعة
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              >
                <strong>إجمالي أيام العمل:</strong> {totals.totalWorkDays} يوم
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              >
                <strong>إجمالي أيام الغياب:</strong> {totals.totalAbsenceDays} يوم
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              >
                <strong>إجمالي الخصومات (أيام):</strong> {totals.totalDeductions} يوم
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              >
                <strong>إجمالي الساعات الإضافية:</strong> {totals.totalOvertime} ساعة
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              >
                <strong>إجمالي أيام الإجازة الأسبوعية:</strong> {totals.totalWeeklyLeaveDays} يوم
              </motion.div>
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {editingReport && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="bg-white p-6 rounded-xl shadow-xl w-full max-w-md border border-gray-100"
              >
                <h2 className="text-lg font-semibold text-gray-700 mb-4 text-right">
                  {isCreatingMission ? 'إضافة مأمورية جديدة' : 'تعديل التقرير'}
                </h2>
                <div className="grid grid-cols-1 gap-3">
                  <label className="flex flex-col text-right">
                    كود الموظف:
                    <input
                      type="text"
                      placeholder="أدخل كود الموظف"
                      value={editingReport.code}
                      onChange={e => setEditingReport({ ...editingReport, code: e.target.value })}
                      className="w-full border border-gray-300 p-2 rounded text-right mb-2 bg-gray-50 hover:bg-gray-100 transition-colors duration-150"
                    />
                  </label>
                  <label className="flex flex-col text-right">
                    التاريخ:
                    <input
                      type="date"
                      value={editingReport.date}
                      onChange={e => setEditingReport({ ...editingReport, date: e.target.value })}
                      className="w-full border border-gray-300 p-2 rounded text-right mb-2 bg-gray-50 hover:bg-gray-100 transition-colors duration-150"
                    />
                  </label>
                  <label className="flex flex-col text-right">
                    الحضور:
                    <input
                      type="time"
                      value={editingReport.checkIn}
                      onChange={e => setEditingReport({ ...editingReport, checkIn: e.target.value })}
                      className="w-full border border-gray-300 p-2 rounded text-right mb-2 bg-gray-50 hover:bg-gray-100 transition-colors duration-200"
                      step="1"
                    />
                  </label>
                  <label className="flex flex-col text-right">
                    الانصراف:
                    <input
                      type="time"
                      value={editingReport.checkOut}
                      onChange={e => setEditingReport({ ...editingReport, checkOut: e.target.value })}
                      className="w-full border border-gray-300 p-2 rounded text-right bg-gray-50 hover:bg-gray-100 transition-colors duration-200"
                      step="1"
                    />
                  </label>
                </div>
                <div className="flex flex-row-reverse justify-end gap-2 mt-4">
                  {isCreatingMission && (
                    <motion.button
                      onClick={handleMissionAttendance}
                      disabled={loading}
                      whileHover={{ scale: 1.05, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      whileTap={{ scale: 0.95 }}
                      className="bg-green-500 text-white px-3 py-2 rounded-full hover:bg-green-600 transition-colors duration-200 disabled:opacity-50"
                    >
                      تعليم حضور مأمورية
                    </motion.button>
                  )}
                  <motion.button
                    onClick={() => {
                      setEditingReport(null);
                      setIsCreatingMission(false);
                    }}
                    disabled={loading}
                    whileHover={{ scale: 1.05, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    whileTap={{ scale: 0.95 }}
                    className="bg-gray-200 text-gray-700 px-3 py-2 rounded-full hover:bg-gray-300 transition-colors duration-200 disabled:opacity-50"
                  >
                    إلغاء
                  </motion.button>
                  <motion.button
                    onClick={handleSave}
                    disabled={loading}
                    whileHover={{ scale: 1.05, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    whileTap={{ scale: 0.95 }}
                    className="bg-blue-500 text-white px-3 py-2 rounded-full hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50"
                  >
                    {loading ? 'جاري الحفظ...' : 'حفظ'}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default UploadFingerprint;
