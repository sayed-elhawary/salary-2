import { Link } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../components/AuthProvider';
import { UserPlusIcon, UploadIcon, FileTextIcon, DollarSignIcon } from 'lucide-react';
import { motion } from 'framer-motion';

// إعدادات الحركات للحاوية الرئيسية
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2, // تأخير بين كل كارت
    },
  },
};

// إعدادات الحركات لكل كارت
const cardVariants = {
  hidden: { opacity: 0, scale: 0.9, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.5 } },
};

const Dashboard = () => {
  const { user } = useContext(AuthContext);

  return (
    <div className="min-h-screen bg-white py-12">
      {/* الحاوية الرئيسية */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* العنوان الرئيسي مع حركة */}
        <motion.h1
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-4xl md:text-5xl font-bold text-gray-900 text-center mb-12"
        >
          لوحة التحكم
        </motion.h1>
        {/* شبكة الكروت مع حركات متسلسلة */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* كارت إنشاء حساب (للأدمن بس) */}
          {user?.role === 'admin' && (
            <motion.div variants={cardVariants}>
              <Link
                to="/create-account"
                className="bg-white p-6 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 flex items-center space-x-4 hover:scale-105 border border-blue-100 group"
              >
                <UserPlusIcon className="h-10 w-10 text-blue-600 group-hover:text-blue-700 transition-colors duration-300" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">إنشاء حساب</h2>
                  <p className="text-gray-500 mt-1 text-sm">إضافة موظف جديد إلى النظام</p>
                </div>
              </Link>
            </motion.div>
          )}
          {/* كارت رفع بصمة (لكل المستخدمين) */}
          <motion.div variants={cardVariants}>
            <Link
              to="/upload-fingerprint"
              className="bg-white p-6 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 flex items-center space-x-4 hover:scale-105 border border-blue-100 group"
            >
              <UploadIcon className="h-10 w-10 text-blue-600 group-hover:text-blue-700 transition-colors duration-300" />
              <div>
                <h2 className="text-xl font-semibold text-gray-800">رفع بصمة</h2>
                <p className="text-gray-500 mt-1 text-sm">رفع ملف بصمة الموظفين</p>
              </div>
            </Link>
          </motion.div>
          {/* كارت تقرير المرتب الشهري (للأدمن بس) */}
          {user?.role === 'admin' && (
            <motion.div variants={cardVariants}>
              <Link
                to="/reports"
                className="bg-white p-6 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 flex items-center space-x-4 hover:scale-105 border border-blue-100 group"
              >
                <FileTextIcon className="h-10 w-10 text-blue-600 group-hover:text-blue-700 transition-colors duration-300" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">تقرير الحضور</h2>
                  <p className="text-gray-500 mt-1 text-sm">عرض تقرير الحضور الشهري</p>
                </div>
              </Link>
            </motion.div>
          )}
          {/* كارت تقرير المرتب الشهري (للأدمن بس) */}
          {user?.role === 'admin' && (
            <motion.div variants={cardVariants}>
              <Link
                to="/monthly-salary-report"
                className="bg-white p-6 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 flex items-center space-x-4 hover:scale-105 border border-blue-100 group"
              >
                <DollarSignIcon className="h-10 w-10 text-blue-600 group-hover:text-blue-700 transition-colors duration-300" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">تقرير المرتب الشهري</h2>
                  <p className="text-gray-500 mt-1 text-sm">عرض تقرير المرتبات الشهرية للموظفين</p>
                </div>
              </Link>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
