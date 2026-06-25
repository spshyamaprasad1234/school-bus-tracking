import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, createContext, useContext, useCallback, createPortal } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import gsap from 'gsap';
import Login from './pages/Login';
import SchoolSignup from './pages/SchoolSignup';
import SchoolDashboard from './pages/SchoolDashboard';
import DriverDashboard from './pages/DriverDashboard';
import ParentDashboard from './pages/ParentDashboard';

const ModalContext = createContext();

export function useModalPortal() {
  return useContext(ModalContext);
}

const ToastContext = createContext();

export function useToast() {
  return useContext(ToastContext);
}

function ModalPortalProvider({ children }) {
  const portalRef = useRef(null);

  useEffect(() => {
    const el = document.createElement('div');
    el.id = 'modal-portal';
    document.body.appendChild(el);
    portalRef.current = el;
    return () => { if (el.parentNode) el.parentNode.removeChild(el); };
  }, []);

  const renderInPortal = useCallback((node) => {
    if (portalRef.current) {
      return createPortal(node, portalRef.current);
    }
    return node;
  }, []);

  return (
    <ModalContext.Provider value={renderInPortal}>
      {children}
    </ModalContext.Provider>
  );
}

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type, exiting: false }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 300);
    }, duration);
  }, []);

  const toast = useCallback({
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    info: (msg) => addToast(msg, 'info'),
    warning: (msg) => addToast(msg, 'warning'),
  }, [addToast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type} ${t.exiting ? 'toast-exit' : ''}`}>
            {t.type === 'success' && '✓'}
            {t.type === 'error' && '✕'}
            {t.type === 'info' && 'ℹ'}
            {t.type === 'warning' && '⚠'}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ProtectedRoute({ children, allowedType }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userType = localStorage.getItem('userType');
    if (token && userType) {
      setUser({ type: userType });
    }
    setLoading(false);
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '16px' }}>
      <div className="spinner spinner-dark" style={{ width: 32, height: 32 }}></div>
      <span style={{ color: 'var(--gray-400)', fontSize: 14 }}>Loading dashboard...</span>
    </div>
  );
  if (!user) return <Navigate to="/login" />;
  if (allowedType && user.type !== allowedType) return <Navigate to="/login" />;

  return children;
}

function AnimatedRoutes() {
  const location = useLocation();
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.3, ease: 'power2.out' }
      );
    }
  }, [location.pathname]);

  return (
    <div ref={containerRef} style={{ minHeight: '100vh' }}>
      <Routes location={location}>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/school-signup" element={<SchoolSignup />} />
        <Route
          path="/school-dashboard/*"
          element={
            <ProtectedRoute allowedType="school">
              <SchoolDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver-dashboard"
          element={
            <ProtectedRoute allowedType="driver">
              <DriverDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/parent-dashboard"
          element={
            <ProtectedRoute allowedType="parent">
              <ParentDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  );
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function App() {
  return (
    <BrowserRouter>
      <GoogleOAuthProvider clientId={googleClientId}>
        <ModalPortalProvider>
          <ToastProvider>
            <AnimatedRoutes />
          </ToastProvider>
        </ModalPortalProvider>
      </GoogleOAuthProvider>
    </BrowserRouter>
  );
}

export default App;
