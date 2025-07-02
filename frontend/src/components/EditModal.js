import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DateTime } from 'luxon';
import { motion } from 'framer-motion';

const EditModal = ({ report, isOpen, onClose, onUpdate }) => {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [absence, setAbsence] = useState(false);
  const [annualLeave, setAnnualLeave] = useState(false);
  const [medicalLeave, setMedicalLeave] = useState(false);
  const [officialLeave, setOfficialLeave] = useState(false);
  const [leaveCompensation, setLeaveCompensation] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (report) {
      setCheckIn(report.checkIn || '');
      setCheckOut(report.checkOut || '');
      setAbsence(report.absence === 'نعم');
      setAnnualLeave(report.annualLeave === 'نعم');
      setMedicalLeave(report.medicalLeave === 'نعم');
      setOfficialLeave(report.officialLeave === 'نعم');
      setLeaveCompensation(report.leaveCompensation === 'نعم');
      setError('');
    }
  }, [report]);

  if (!isOpen || !report) return null;

  const handleCheckboxChange = (setter, value) => {
    setAbsence(false);
    setAnnualLeave(false);
    setMedicalLeave(false);
    setOfficialLeave(false);
    setLeaveCompensation(false);
    setter(value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    if ((checkIn && !timeRegex.test(checkIn)) || (checkOut && !timeRegex.test(checkOut))) {
      setError('تنسيق الوقت غير صالح، يجب أن يكون HH:mm:ss');
      setLoading(false);
      return;
    }

    if ([absence, annualLeave, medicalLeave, officialLeave, leaveCompensation].filter(Boolean).length > 1) {
      setError('لا يمكن تحديد أكثر من حالة واحدة (غياب، إجازة سنوية، إجازة طبية، إجازة رسمية، بدل إجازة) معًا');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('التوكن غير موجود، يرجى تسجيل الدخول');
      }

      const response = await axios.put(
        `${process.env.REACT_APP_API_URL}/api/fingerprints/${report._id}`,
        {
          code: report.code,
          date: report.date,
          checkIn: checkIn || null,
          checkOut: checkOut || null,
          absence,
          annualLeave,
          medicalLeave,
          officialLeave,
          leaveCompensation,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      onUpdate(response.data.report);
      onClose();
    } catch (err) {
      console.error('Error saving report:', err);
      setError(err.response?.data?.error || 'خطأ في حفظ التعديلات');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white p-4 sm:p-6 rounded-xl shadow-lg w-full max-w-lg"
        initial={{ scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 50 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg sm:text-xl font-semibold text-gray-700 mb-4 text-right">تعديل السجل</h2>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-red-500 text-right mb-4 text-sm"
          >
            {error}
          </motion.p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1 text-right">كود الموظف</label>
              <input
                type="text"
                value={report.code}
                readOnly
                className="w-full px-3 py-2 border rounded-lg bg-gray-100 text-right text-sm"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1 text-right">اسم الموظف</label>
              <input
                type="text"
                value={report.employeeName}
                readOnly
                className="w-full px-3 py-2 border rounded-lg bg-gray-100 text-right text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-1 text-right">تاريخ الحضور</label>
            <input
              type="text"
              value={report.date}
              readOnly
              className="w-full px-3 py-2 border rounded-lg bg-gray-100 text-right text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1 text-right">توقيت الحضور</label>
              <input
                type="time"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-right text-sm"
                step="1"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1 text-right">توقيت الانصراف</label>
              <input
                type="time"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-right text-sm"
                step="1"
                disabled={loading}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <div className="flex items-center justify-end">
              <label className="text-gray-700 text-sm font-medium mr-2">الغياب</label>
              <input
                type="checkbox"
                checked={absence}
                onChange={(e) => handleCheckboxChange(setAbsence, e.target.checked)}
                className="h-4 w-4"
                disabled={loading}
              />
            </div>
            <div className="flex items-center justify-end">
              <label className="text-gray-700 text-sm font-medium mr-2">إجازة سنوية</label>
              <input
                type="checkbox"
                checked={annualLeave}
                onChange={(e) => handleCheckboxChange(setAnnualLeave, e.target.checked)}
                className="h-4 w-4"
                disabled={loading}
              />
            </div>
            <div className="flex items-center justify-end">
              <label className="text-gray-700 text-sm font-medium mr-2">إجازة طبية</label>
              <input
                type="checkbox"
                checked={medicalLeave}
                onChange={(e) => handleCheckboxChange(setMedicalLeave, e.target.checked)}
                className="h-4 w-4"
                disabled={loading}
              />
            </div>
            <div className="flex items-center justify-end">
              <label className="text-gray-700 text-sm font-medium mr-2">إجازة رسمية</label>
              <input
                type="checkbox"
                checked={officialLeave}
                onChange={(e) => handleCheckboxChange(setOfficialLeave, e.target.checked)}
                className="h-4 w-4"
                disabled={loading}
              />
            </div>
            <div className="flex items-center justify-end">
              <label className="text-gray-700 text-sm font-medium mr-2">بدل إجازة</label>
              <input
                type="checkbox"
                checked={leaveCompensation}
                onChange={(e) => handleCheckboxChange(setLeaveCompensation, e.target.checked)}
                className="h-4 w-4"
                disabled={loading}
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 sm:gap-4">
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.05 }}
              whileTap={{ scale: loading ? 1 : 0.95 }}
              className={`w-full sm:w-auto bg-blue-700 text-white px-4 py-2 rounded-md hover:bg-blue-800 transition-colors duration-300 text-sm sm:text-base ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loading ? 'جارٍ الحفظ...' : 'حفظ'}
            </motion.button>
            <motion.button
              type="button"
              onClick={onClose}
              disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.05 }}
              whileTap={{ scale: loading ? 1 : 0.95 }}
              className={`w-full sm:w-auto bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 transition-colors duration-300 text-sm sm:text-base ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              إلغاء
            </motion.button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default EditModal;
