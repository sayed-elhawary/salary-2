
import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthProvider, { AuthContext } from './components/AuthProvider';
import PrivateRoute from './components/PrivateRoute';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreateAccount from './pages/CreateAccount';
import UploadFingerprint from './pages/UploadFingerprint';
import Reports from './pages/Reports';
import MonthlySalaryReport from './pages/MonthlySalaryReport';

// مكون لإعادة التوجيه بناءً على حالة المستخدم
const RedirectBasedOnAuth = () => {
  const { user } = useContext(AuthContext);
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/dashboard" replace />;
};

const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* صفحة تسجيل الدخول (متاحة للكل) */}
          <Route path="/login" element={<Login />} />

          {/* صفحة الداشبورد (للأدمن بس) */}
          <Route
            path="/dashboard"
            element={
              <PrivateRoute role="admin">
                <Dashboard />
              </PrivateRoute>
            }
          />

          {/* صفحة إنشاء حساب (للأدمن بس) */}
          <Route
            path="/create-account"
            element={
              <PrivateRoute role="admin">
                <CreateAccount />
              </PrivateRoute>
            }
          />

          {/* صفحة رفع بصمة (متاحة لكل المستخدمين المسجلين) */}
          <Route
            path="/upload-fingerprint"
            element={
              <PrivateRoute>
                <UploadFingerprint />
              </PrivateRoute>
            }
          />

          {/* صفحة تقرير المرتب الشهري (للأدمن بس) */}
          <Route
            path="/reports"
            element={
              <PrivateRoute role="admin">
                <Reports />
              </PrivateRoute>
            }
          />

          {/* صفحة تقرير المرتب الشهري (للأدمن بس) */}
          <Route
            path="/monthly-salary-report"
            element={
              <PrivateRoute role="admin">
                <MonthlySalaryReport />
              </PrivateRoute>
            }
          />

          {/* الجذر يعيد توجيه بناءً على حالة المستخدم */}
          <Route path="/" element={<RedirectBasedOnAuth />} />

          {/* أي مسار غير معروف يرجع للجذر */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
