import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import Containers from './pages/Containers'; // Import the new Containers component
import Users from './pages/Users';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { useAuth } from './hooks/useAuth.tsx';
import { setUnauthorizedCallback } from './lib/api';

// A wrapper for routes that require authentication
const PrivateRoute = ({ children }: { children: JSX.Element }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

function App() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    // 设置 API 401 错误的回调逻辑
    setUnauthorizedCallback(() => {
      logout();
      navigate('/login');
    });
  }, [logout, navigate]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="servers" element={<Servers />} />
        <Route path="servers/:serverId/containers" element={<Containers />} /> {/* New route for containers */}
        <Route path="users" element={<Users />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      {/* Redirect any other paths to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;