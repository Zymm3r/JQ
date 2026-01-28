import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import CustomerQueue from './pages/CustomerQueue';
import AdminDashboard from './pages/AdminDashboard';
import Home from './pages/Home';
import Monitor from './pages/Monitor';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/queue/:id" element={<CustomerQueue />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/monitor" element={<Monitor />} />
      </Routes>
      <Toaster position="bottom-center" />
    </>
  );
}

export default App;
