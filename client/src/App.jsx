import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import CustomerQueue from './pages/CustomerQueue';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import Home from './pages/Home';

// Simple Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const isAuth = localStorage.getItem('admin_auth') === 'true';
  return isAuth ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/queue/:id" element={<CustomerQueue />} />
        <Route path="/login" element={<AdminLogin />} />

        <Route path="/admin" element={
          <ProtectedRoute>
            <AdminDashboard />
          </ProtectedRoute>
        } />
      </Routes>
      <Toaster position="bottom-center" />
    </>
  );
}

export default App;
