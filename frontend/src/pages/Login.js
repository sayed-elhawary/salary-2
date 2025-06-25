import React, { useState, useContext } from 'react';
import { AuthContext } from '../components/AuthProvider';

const Login = () => {
  const { login } = useContext(AuthContext);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(code, password);
      // نجاح الدخول — لا حاجة لعمل شيء هنا لأن AuthProvider يعيد التوجيه
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.message ||
        'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً';
      setError(message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-xl p-8">
        <h2 className="text-3xl font-bold mb-6 text-center text-gray-800">تسجيل الدخول</h2>
        {error && <p className="text-red-500 text-center mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-gray-700 mb-2">كود الموظف</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-gray-700 mb-2">كلمة المرور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
          >
            {loading ? 'جاري الدخول...' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;

