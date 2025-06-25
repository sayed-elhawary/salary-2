import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../components/AuthProvider';
import { motion } from 'framer-motion';
import { FileTextIcon, EditIcon } from 'lucide-react';
import { DateTime } from 'luxon';

// إعدادات الحركات
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const Reports = () => {
  const { user } = useContext(AuthContext);
  const [reports, setReports] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSingleFingerprints, setShowSingleFingerprints] = useState(false);
  const [filteredReports, setFilteredReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editModal, setEditModal] = useState(null);
  const [editData, setEditData] = useState({});

  // جلب التقارير
  const fetchReports = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_REPORTS_API_URL}/api/reports/salary`,
        {
          headers: { Authorization: `Bearer ${user.token}` },
          params: { startDate, endDate, searchQuery },
        }
      );
      setReports(response.data);
      setFilteredReports(response.data);
    } catch (err) {
      setError('فشل جلب التقارير. حاولي مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  // تصفية التقارير بناءً على فلتر البصمة الواحدة
  useEffect(() => {
    if (showSingleFingerprints) {
      const singleFingerprintReports = reports.filter(
        (report) => report.singleFingerprintDays > 0
      );
      setFilteredReports(singleFingerprintReports);
    } else {
      setFilteredReports(reports);
    }
  }, [reports, showSingleFingerprints]);

  // جلب التقارير عند تغيير التواريخ أو البحث
  useEffect(() => {
    if (startDate && endDate) fetchReports();
  }, [startDate, endDate, searchQuery]);

  // تعديل بيانات الموظف
  const handleEdit = async (employeeId) => {
    try {
      await axios.put(
        `${process.env.REACT_APP_REPORTS_API_URL}/api/reports/update/${employeeId}`,
        editData,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      setEditModal(null);
      fetchReports();
    } catch (err) {
      setError('فشل تحديث البيانات. حاولي مرة أخرى.');
    }
  };

  // معالجة فلتر البصمات ذات البصمة الواحدة
  const handleSingleFingerprintFilter = () => {
    setShowSingleFingerprints(!showSingleFingerprints);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
      >
        {/* العنوان */}
        <motion.h1
          variants={itemVariants}
          className="text-3xl font-bold text-gray-900 mb-8 text-center"
        >
          تقرير المرتب الشهري
        </motion.h1>

        {/* فلاتر البحث */}
        <motion.div
          variants={itemVariants}
          className="bg-white p-6 rounded-2xl shadow-md mb-8 border border-gray-100"
        >
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <input
              type="text"
              placeholder="ابحث بكود الموظف أو الاسم"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600 text-right"
            />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <motion.button
              onClick={fetchReports}
              disabled={loading || !startDate || !endDate}
              whileHover={{ scale: 1.05, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              whileTap={{ scale: 0.95 }}
              className="bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'جاري التحميل...' : 'جلب التقرير'}
            </motion.button>
          </div>
          <div className="flex justify-end">
            <motion.button
              onClick={handleSingleFingerprintFilter}
              whileHover={{ scale: 1.05, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 rounded-full text-white transition-colors duration-200 ${
                showSingleFingerprints ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              {showSingleFingerprints ? 'إلغاء فلتر البصمة الواحدة' : 'عرض البصمات ذات البصمة الواحدة'}
            </motion.button>
          </div>
          {error && <p className="text-red-600 text-center mt-4">{error}</p>}
        </motion.div>

        {/* الجدول */}
        {filteredReports.length > 0 && (
          <motion.div
            variants={itemVariants}
            className="bg-white p-6 rounded-2xl shadow-md overflow-x-auto"
          >
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
              <FileTextIcon className="h-6 w-6 ml-2" />
              نتائج التقرير
            </h2>
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-3">كود الموظف</th>
                  <th className="p-3">الاسم</th>
                  <th className="p-3">القسم</th>
                  <th className="p-3">الراتب الأساسي</th>
                  <th className="p-3">التأمين الطبي</th>
                  <th className="p-3">التأمين الاجتماعي</th>
                  <th className="p-3">أيام العمل الأسبوعية</th>
                  <th className="p-3">أيام الإجازة الأسبوعية</th>
                  <th className="p-3">أيام العمل المتوقعة</th>
                  <th className="p-3">أيام الحضور</th>
                  <th className="p-3">أيام الغياب</th>
                  <th className="p-3">ساعات إضافية</th>
                  <th className="p-3">تأخير الأيام</th>
                  <th className="p-3">الإجازة السنوية</th>
                  <th className="p-3">أيام البصمة الواحدة</th>
                  <th className="p-3">تعديل</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((report) => (
                  <motion.tr
                    key={report.employeeId}
                    className={report.singleFingerprintDays > 0 ? 'bg-yellow-100' : ''}
                    variants={itemVariants}
                  >
                    <td className="p-3">{report.employeeId}</td>
                    <td className="p-3">{report.employeeName}</td>
                    <td className="p-3">{report.department}</td>
                    <td className="p-3">{report.baseSalary}</td>
                    <td className="p-3">{report.medicalInsurance}</td>
                    <td className="p-3">{report.socialInsurance}</td>
                    <td className="p-3">{report.workDaysPerWeek}</td>
                    <td className="p-3">{report.weeklyLeaveDays}</td>
                    <td className="p-3">{report.expectedWorkDays}</td>
                    <td className="p-3">{report.attendanceDays}</td>
                    <td className="p-3">{report.absentDays}</td>
                    <td className="p-3">{report.overtimeHours}</td>
                    <td className="p-3">{report.lateDays}</td>
                    <td className="p-3">{report.annualLeaveTaken}</td>
                    <td className="p-3">{report.singleFingerprintDays || 0}</td>
                    <td className="p-3">
                      <motion.button
                        onClick={() => {
                          setEditModal(report.employeeId);
                          setEditData({
                            absentDays: report.absentDays,
                            annualLeaveTaken: report.annualLeaveTaken,
                            singleFingerprintDays: report.singleFingerprintDays,
                            workDaysPerWeek: report.workDaysPerWeek,
                          });
                        }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <EditIcon className="h-5 w-5" />
                      </motion.button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}

        {/* نافذة التعديل */}
        {editModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full"
            >
              <h3 className="text-lg font-semibold mb-4 text-right">تعديل بيانات الموظف</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 text-right">
                    أيام الغياب
                  </label>
                  <input
                    type="number"
                    value={editData.absentDays || ''}
                    onChange={(e) =>
                      setEditData({ ...editData, absentDays: e.target.value })
                    }
                    className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600 text-right"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 text-right">
                    الإجازة السنوية المستخدمة
                  </label>
                  <input
                    type="number"
                    value={editData.annualLeaveTaken || ''}
                    onChange={(e) =>
                      setEditData({ ...editData, annualLeaveTaken: e.target.value })
                    }
                    className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600 text-right"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 text-right">
                    أيام البصمة الواحدة
                  </label>
                  <input
                    type="number"
                    value={editData.singleFingerprintDays || ''}
                    onChange={(e) =>
                      setEditData({ ...editData, singleFingerprintDays: e.target.value })
                    }
                    className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600 text-right"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 text-right">
                    أيام العمل الأسبوعية
                  </label>
                  <select
                    value={editData.workDaysPerWeek || 5}
                    onChange={(e) =>
                      setEditData({ ...editData, workDaysPerWeek: parseInt(e.target.value) })
                    }
                    className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600 text-right"
                  >
                    <option value={5}>5 أيام</option>
                    <option value={6}>6 أيام</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-4 mt-6">
                <motion.button
                  onClick={() => setEditModal(null)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 rounded-full border border-gray-300"
                >
                  إلغاء
                </motion.button>
                <motion.button
                  onClick={() => handleEdit(editModal)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700"
                >
                  حفظ
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default Reports;
