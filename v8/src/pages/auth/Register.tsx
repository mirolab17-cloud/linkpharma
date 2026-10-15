// src/pages/auth/Register.tsx
import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * تم اعتماد الدخول بحساب Google فقط، ويتم تحويل أي طلب إلى /login
 */
export const Register: React.FC = () => {
  return <Navigate to="/login" replace />;
};
