import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from './AuthProvider';

const PrivateRoute = ({ children, role }) => {
  const { user } = useContext(AuthContext);

  if (user === null) {
    // ممكن تضيف شاشة تحميل هنا لو حابب، أو null
    return null; 
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default PrivateRoute;

