import React, { useState } from 'react';
import axios from 'axios';
import { DateTime } from 'luxon';
import { motion } from 'framer-motion';

const EditModal = ({ report, isOpen, onClose, onUpdate }) => {
  const [checkIn, setCheckIn] = useState(report?.checkIn || '');
  const [checkOut, setCheckOut] = useState(report?.checkOut || '');
  const [error, setError] = useState('');

  if (!isOpen || !report) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // تنسيق التوقيت إلى hh:mm:ss a
    const formattedCheckIn = checkIn ? formatTime(checkIn) : '';
    const formattedCheckOut = checkOut ? formatTime(checkOut) : '';

    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `${process.env.REACT_APP_API_URL}/api/fingerprints/${report._id}`,
        {
          checkIn: formattedCheckIn,
          checkOut: formattedCheckOut,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      onUpdate(response.data.report); // تحديث السجل في الجدول
      onClose(); // إغلاق المربع
    } catch (err) {
      console.error('Error saving report:', err);
      setError(err.response?.data?.error || 'خطأ في حفظ التعديلات');
    }
  };

  // دالة لتنسيق الوقت إلى hh:mm:ss a
  const formatTime = (time) => {
    if (!time) return '';
    let dt = DateTime.fromFormat(time, 'HH:mm', { zone: 'Africa/Cairo' });
    if (!dt.isValid) {
      dt = DateTime.fromFormat(time, 'hh:mm a', { zone: 'Africa/Cairo' });
    }
    if (!dt.isValid) {
      dt = DateTime.fromFormat(time, 'hh:mm:ss a', { zone: 'Africa/Cairo' });
    }
    return dt.isValid ? dt.toFormat('hh:mm:ss a') : time;
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose} // إغلاق المربع عند النقر خارج النموذج
    >
      <motion.div
        className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md"
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.8 }}
        onClick={(e) => e.stopPropagation()} // منع إغلاق المربع عند النقر داخله
      >
        <h2 className="text-xl font-semibold text-gray-700 mb-4 text-right">تعديل السجل</h2>
        {error && <p className="text-red-500 text-right mb-4">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2 text-right">كود الموظف</label>
            <input
              type="text"
              value={report.code}
              readOnly
              className="w-full px-3 py-2 border rounded-lg bg-gray-100 text-right"
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2 text-right">تاريخ الحضور</label>
            <input
              type="text"
              value={report.date}
              readOnly
              className="w-full px-3 py-2 border rounded-lg bg-gray-100 text-right"
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2 text-right">توقيت الحضور</label>
            <input
              type="time"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-right"
              placeholder="مثال: 09:30"
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2 text-right">توقيت الانصراف</label>
            <input
              type="time"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-right"
              placeholder="مثال: 17:30"
            />
          </div>
          <div className="flex justify-end gap-4">
            <motion.button
              type="submit"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              حفظ
            </motion.button>
            <motion.button
              type="button"
              onClick={onClose}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600"
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
