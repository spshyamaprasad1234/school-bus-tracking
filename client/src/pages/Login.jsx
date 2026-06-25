import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bus, GraduationCap, User, Mail, Lock, Building2, Phone } from 'lucide-react';
import { schoolAPI, driverAPI, parentAPI } from '../api';
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
        </form>

        {role === 'school' && (
          <Link to="/school-signup">Don't have an account? Register your school</Link>
        )}
      </div>
    </div>
  );
}

export default Login;
