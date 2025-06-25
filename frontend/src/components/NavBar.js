
import { Link, useNavigate } from 'react-router-dom';
import { useState, useContext } from 'react';
import { AuthContext } from './AuthProvider';
import { HomeIcon, UserPlusIcon, UploadIcon, LogOutIcon, FileTextIcon, DollarSignIcon } from 'lucide-react';

const Navbar = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  // دالة تسجيل الخروج
  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
    setIsOpen(false); // إغلاق القائمة المنسدلة بعد الخروج
  };

  return (
    <nav className="bg-gradient-to-r from-gray-900 to-blue-900 shadow-lg sticky top-0 z-50">
      {/* الحاوية الرئيسية */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* الشعار والعنوان */}
          <div className="flex items-center">
            <Link to="/dashboard" className="flex items-center space-x-2 text-white text-2xl font-bold hover:text-yellow-400 transition-all duration-300">
              <HomeIcon className="h-6 w-6" />
              <span>نظام الحضور</span>
            </Link>
          </div>
          {/* روابط الشاشات الكبيرة */}
          <div className="hidden sm:flex sm:items-center sm:space-x-6">
            <Link
              to="/dashboard"
              className="flex items-center space-x-2 text-white hover:text-yellow-400 hover:bg-blue-800 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 transform hover:scale-105"
            >
              <HomeIcon className="h-5 w-5" />
              <span>الرئيسية</span>
            </Link>
            {user?.role === 'admin' && (
              <>
                <Link
                  to="/create-account"
                  className="flex items-center space-x-2 text-white hover:text-yellow-400 hover:bg-blue-800 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 transform hover:scale-105"
                >
                  <UserPlusIcon className="h-5 w-5" />
                  <span>إنشاء حساب</span>
                </Link>
                <Link
                  to="/reports"
                  className="flex items-center space-x-2 text-white hover:text-yellow-400 hover:bg-blue-800 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 transform hover:scale-105"
                >
                  <FileTextIcon className="h-5 w-5" />
                  <span>تقرير الحضور</span>
                </Link>
                <Link
                  to="/monthly-salary-report"
                  className="flex items-center space-x-2 text-white hover:text-yellow-400 hover:bg-blue-800 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 transform hover:scale-105"
                >
                  <DollarSignIcon className="h-5 w-5" />
                  <span>تقرير المرتب الشهري</span>
                </Link>
              </>
            )}
            <Link
              to="/upload-fingerprint"
              className="flex items-center space-x-2 text-white hover:text-yellow-400 hover:bg-blue-800 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 transform hover:scale-105"
            >
              <UploadIcon className="h-5 w-5" />
              <span>رفع بصمة</span>
            </Link>
            {user && (
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 text-white hover:text-white hover:bg-red-600 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 transform hover:scale-105"
              >
                <LogOutIcon className="h-5 w-5" />
                <span>تسجيل الخروج</span>
              </button>
            )}
            {!user && (
              <Link
                to="/login"
                className="flex items-center space-x-2 text-white hover:text-yellow-400 hover:bg-blue-800 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 transform hover:scale-105"
              >
                <span>تسجيل الدخول</span>
              </Link>
            )}
          </div>
          {/* زر القائمة المنسدلة للشاشات الصغيرة */}
          <div className="flex items-center sm:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-lg text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all duration-300"
              aria-label="Toggle menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {isOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>
      {/* القائمة المنسدلة للشاشات الصغيرة */}
      {isOpen && (
        <div className="sm:hidden bg-blue-950 animate-slideIn">
          <div className="pt-2 pb-4 space-y-2 px-4">
            <Link
              to="/dashboard"
              className="flex items-center space-x-2 text-white hover:text-yellow-400 hover:bg-blue-800 block px-4 py-3 rounded-lg text-base font-medium transition-all duration-300"
              onClick={() => setIsOpen(false)}
            >
              <HomeIcon className="h-5 w-5" />
              <span>الرئيسية</span>
            </Link>
            {user?.role === 'admin' && (
              <>
                <Link
                  to="/create-account"
                  className="flex items-center space-x-2 text-white hover:text-yellow-400 hover:bg-blue-800 block px-4 py-3 rounded-lg text-base font-medium transition-all duration-300"
                  onClick={() => setIsOpen(false)}
                >
                  <UserPlusIcon className="h-5 w-5" />
                  <span>إنشاء حساب</span>
                </Link>
                <Link
                  to="/reports"
                  className="flex items-center space-x-2 text-white hover:text-yellow-400 hover:bg-blue-800 block px-4 py-3 rounded-lg text-base font-medium transition-all duration-300"
                  onClick={() => setIsOpen(false)}
                >
                  <FileTextIcon className="h-5 w-5" />
                  <span>تقرير الحضور</span>
                </Link>
                <Link
                  to="/monthly-salary-report"
                  className="flex items-center space-x-2 text-white hover:text-yellow-400 hover:bg-blue-800 block px-4 py-3 rounded-lg text-base font-medium transition-all duration-300"
                  onClick={() => setIsOpen(false)}
                >
                  <DollarSignIcon className="h-5 w-5" />
                  <span>تقرير المرتب الشهري</span>
                </Link>
              </>
            )}
            <Link
              to="/upload-fingerprint"
              className="flex items-center space-x-2 text-white hover:text-yellow-400 hover:bg-blue-800 block px-4 py-3 rounded-lg text-base font-medium transition-all duration-300"
              onClick={() => setIsOpen(false)}
            >
              <UploadIcon className="h-5 w-5" />
              <span>رفع بصمة</span>
            </Link>
            {user && (
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 text-white hover:text-white hover:bg-red-600 block px-4 py-3 rounded-lg text-base font-medium transition-all duration-300 w-full text-right"
              >
                <LogOutIcon className="h-5 w-5" />
                <span>تسجيل الخروج</span>
              </button>
            )}
            {!user && (
              <Link
                to="/login"
                className="flex items-center space-x-2 text-white hover:text-yellow-400 hover:bg-blue-800 block px-4 py-3 rounded-lg text-base font-medium transition-all duration-300"
                onClick={() => setIsOpen(false)}
              >
                <span>تسجيل الدخول</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
