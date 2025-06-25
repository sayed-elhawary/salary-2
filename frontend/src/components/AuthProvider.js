import React, { createContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // حالة لتتبع تحميل المستخدم
  const navigate = useNavigate();

  // فحص التوكن عند تحميل التطبيق
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          // طلب للتحقق من التوكن وجلب بيانات المستخدم
          const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setUser(res.data.user); // تحديث بيانات المستخدم
        } catch (err) {
          console.error('Error verifying token:', err.response?.data?.message || err.message);
          localStorage.removeItem('token'); // إزالة التوكن إذا كان غير صالح
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false); // إنهاء التحميل
    };

    checkAuth();
  }, []);

  const login = async (code, password) => {
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/users/login`, {
        code,
        password,
      });
      localStorage.setItem('token', res.data.token);
      setUser(res.data.user);
      navigate('/dashboard');
    } catch (err) {
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading ? children : <div>جاري التحميل...</div>}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
