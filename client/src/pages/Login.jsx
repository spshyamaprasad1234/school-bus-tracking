import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bus, GraduationCap, User, Mail, Lock, Building2, Phone } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { schoolAPI, driverAPI, parentAPI, authAPI } from '../api';
import { setAuth } from '../auth';
import { useToast } from '../App';
import gsap from 'gsap';

function Login() {
  const navigate = useNavigate();
  const toast = useToast();
  const [role, setRole] = useState('school');
  const [formData, setFormData] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const tabsRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(boxRef.current,
        { opacity: 0, y: 30, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power2.out' }
      );
    }, boxRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (tabsRef.current) {
      gsap.fromTo(tabsRef.current.children,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.25, stagger: 0.04, ease: 'power2.out' }
      );
    }
  }, [role]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let response;
      if (role === 'school') {
        response = await schoolAPI.login(formData);
        setAuth(response.data.token, 'school');
        toast.success('Welcome back, ' + (response.data.school?.name || 'School') + '!');
        navigate('/school-dashboard');
      } else if (role === 'driver') {
        response = await driverAPI.login(formData);
        setAuth(response.data.token, 'driver');
        toast.success('Welcome, ' + (response.data.driver?.name || 'Driver') + '!');
        navigate('/driver-dashboard');
      } else {
        response = await parentAPI.login(formData);
        setAuth(response.data.token, 'parent');
        toast.success('Welcome, ' + (response.data.parent?.studentName || 'Parent') + '!');
        navigate('/parent-dashboard');
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed. Please try again.';
      setError(msg);
      gsap.fromTo('.error-message', { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.25 });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    setError('');
    setFormData({});
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    if (role === 'parent') {
      setError('Google login is not available for parents. Please use your school code and phone number.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await authAPI.googleLogin({ credential: credentialResponse.credential, role });
      if (role === 'school') {
        setAuth(res.data.token, 'school');
        toast.success('Welcome, ' + (res.data.school?.name || 'School') + '!');
        navigate('/school-dashboard');
      } else {
        setAuth(res.data.token, 'driver');
        toast.success('Welcome, ' + (res.data.driver?.name || 'Driver') + '!');
        navigate('/driver-dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Google login failed');
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => setError('Google login failed. Please try again.'),
    flow: 'implicit',
  });

  return (
    <div className="login-container">
      <div className="login-box" ref={boxRef}>
        <div className="brand">
          <div className="brand-icon">
            <Bus size={28} />
          </div>
          <h1>School Bus Tracker</h1>
          <p className="subtitle">Smart tracking solution for schools</p>
        </div>

        <div className="role-tabs" ref={tabsRef}>
          {[
            { key: 'school', icon: GraduationCap, label: 'School' },
            { key: 'driver', icon: Bus, label: 'Driver' },
            { key: 'parent', icon: User, label: 'Parent' },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              className={role === key ? 'active' : ''}
              onClick={() => handleRoleChange(key)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {role === 'school' && (
            <>
              <div className="form-group">
                <label>Email Address</label>
                <div style={{ position: 'relative' }}>
                  <span className="input-icon"><Mail size={16} /></span>
                  <input
                    type="email"
                    placeholder="school@example.com"
                    value={formData.email || ''}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <span className="input-icon"><Lock size={16} /></span>
                  <input
                    type="password"
                    placeholder="Enter your password"
                    value={formData.password || ''}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    required
                  />
                </div>
              </div>
            </>
          )}
          {role === 'driver' && (
            <>
              <div className="form-group">
                <label>Email Address</label>
                <div style={{ position: 'relative' }}>
                  <span className="input-icon"><Mail size={16} /></span>
                  <input
                    type="email"
                    placeholder="driver@example.com"
                    value={formData.email || ''}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <span className="input-icon"><Lock size={16} /></span>
                  <input
                    type="password"
                    placeholder="Enter your password"
                    value={formData.password || ''}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    required
                  />
                </div>
              </div>
            </>
          )}
          {role === 'parent' && (
            <>
              <div className="form-group">
                <label>School Code</label>
                <div style={{ position: 'relative' }}>
                  <span className="input-icon"><Building2 size={16} /></span>
                  <input
                    type="text"
                    placeholder="e.g. ABC123"
                    value={formData.schoolCode || ''}
                    onChange={e => setFormData({...formData, schoolCode: e.target.value.toUpperCase()})}
                    required
                    maxLength={6}
                    style={{ textTransform: 'uppercase', letterSpacing: '2px', fontFamily: 'monospace' }}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Parent Phone Number</label>
                <div style={{ position: 'relative' }}>
                  <span className="input-icon"><Phone size={16} /></span>
                  <input
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={formData.parentPhone || ''}
                    onChange={e => setFormData({...formData, parentPhone: e.target.value})}
                    required
                  />
                </div>
              </div>
            </>
          )}
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner"></span>
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
          {role !== 'parent' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--gray-200)' }}></div>
                <span style={{ fontSize: 13, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>or continue with</span>
                <div style={{ flex: 1, height: 1, background: 'var(--gray-200)' }}></div>
              </div>
              <button
                type="button"
                onClick={() => googleLogin()}
                disabled={loading}
                style={{
                  width: '100%', padding: '11px', border: '1.5px solid var(--gray-200)',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                  background: 'var(--white)', color: 'var(--secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  transition: 'var(--transition)', opacity: loading ? 0.6 : 1
                }}
                onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = 'var(--gray-300)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray-200)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                  <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                  <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                  <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
                </svg>
                Sign in with Google
              </button>
            </>
          )}
        </form>

        {role === 'school' && (
          <Link to="/school-signup">Don't have an account? Register your school</Link>
        )}
      </div>
    </div>
  );
}

export default Login;
