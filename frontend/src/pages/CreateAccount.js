import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../components/AuthProvider';
import NavBar from '../components/NavBar';
import { motion } from 'framer-motion';
import axios from 'axios';

const CreateAccount = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [form, setForm] = useState({
    code: '',
    fullName: '',
    password: '',
    department: '',
    baseSalary: '',
    baseBonus: '',
    bonusPercentage: '',
    mealAllowance: '',
    medicalInsurance: 0,
    socialInsurance: 0,
    workDaysPerWeek: 5,
    status: 'active',
  });

  const netSalary =
    Number(form.baseSalary || 0) +
    Number(form.baseBonus || 0) * (Number(form.bonusPercentage || 0) / 100) +
    Number(form.mealAllowance || 0) -
    Number(form.medicalInsurance || 0) -
    Number(form.socialInsurance || 0);

  if (!user || user.role !== 'admin') {
    navigate('/login');
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `${process.env.REACT_APP_API_URL}/api/users`,
        { ...form, createdBy: user._id },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      alert('✅ تم إنشاء الحساب');
      navigate('/dashboard');
    } catch (error) {
      alert(`❌ خطأ أثناء إنشاء الحساب: ${error.response?.data?.message || error.message}`);
    }
  };

  return (
    <div className="min-h-screen">
      <NavBar />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-6 max-w-3xl mx-auto"
      >
        <h1 className="text-2xl font-bold mb-4 text-center">إنشاء حساب جديد</h1>
        <div className="bg-white p-6 rounded-lg shadow">
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-gray-700 font-medium mb-1">الكود الوظيفي</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full p-2 border rounded"
                  required
                  maxLength={10}
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">كلمة المرور</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">القسم</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">الراتب الأساسي</label>
                <input
                  type="number"
                  value={form.baseSalary}
                  onChange={(e) => setForm({ ...form, baseSalary: e.target.value })}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">الحافز الأساسي</label>
                <input
                  type="number"
                  value={form.baseBonus}
                  onChange={(e) => setForm({ ...form, baseBonus: e.target.value })}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">نسبة الحافز (%)</label>
                <input
                  type="number"
                  value={form.bonusPercentage}
                  onChange={(e) => setForm({ ...form, bonusPercentage: e.target.value })}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">بدل وجبة</label>
                <input
                  type="number"
                  value={form.mealAllowance}
                  onChange={(e) => setForm({ ...form, mealAllowance: e.target.value })}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">قيمة التأمين الطبي</label>
                <input
                  type="number"
                  value={form.medicalInsurance}
                  onChange={(e) => setForm({ ...form, medicalInsurance: e.target.value })}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">قيمة التأمين الاجتماعي</label>
                <input
                  type="number"
                  value={form.socialInsurance}
                  onChange={(e) => setForm({ ...form, socialInsurance: e.target.value })}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">عدد أيام العمل</label>
                <select
                  value={form.workDaysPerWeek}
                  onChange={(e) => setForm({ ...form, workDaysPerWeek: parseInt(e.target.value) })}
                  className="w-full p-2 border rounded"
                >
                  <option value={5}>5 أيام</option>
                  <option value={6}>6 أيام</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">حالة الحساب</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full p-2 border rounded"
                >
                  <option value="active">نشط</option>
                  <option value="inactive">غير نشط</option>
                  <option value="suspended">معلق</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">الراتب الصافي (يُحسب تلقائياً)</label>
                <input
                  type="number"
                  value={netSalary.toFixed(2)}
                  readOnly
                  className="w-full p-2 border rounded bg-gray-100 text-gray-700"
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary w-full py-3 mt-4 text-white bg-blue-600 hover:bg-blue-700 rounded"
            >
              إنشاء الحساب
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default CreateAccount;
