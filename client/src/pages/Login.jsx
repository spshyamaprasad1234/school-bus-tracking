import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Bus, GraduationCap, User, Mail, Lock, Building2, Phone, 
  Radio, CheckCircle2, ArrowRight 
} from 'lucide-react';
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
  const containerRef = useRef(null);
  const formRef = useRef(null);
  const heroRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(containerRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
      );
      if (heroRef.current) {
        gsap.fromTo(heroRef.current.children,
          { opacity: 0, x: -20 },
          { opacity: 1, x: 0, duration: 0.4, stagger: 0.08, delay: 0.1, ease: 'power2.out' }
        );
      }
    }, containerRef);
    return () => ctx.revert();
  }, []);

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
      const msg = err.response?.data?.error || 'Login failed. Please verify your credentials and try again.';
      setError(msg);
      gsap.fromTo('.login-error-banner', { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.25 });
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
      <div className="login-split-card" ref={containerRef}>
        {/* Left Side: Brand & Feature Hero */}
        <div className="login-hero" ref={heroRef}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '9999px', border: '1px solid rgba(255, 255, 255, 0.15)', marginBottom: '24px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', letterSpacing: '0.04em' }}>SMART FLEET DISPATCH</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 16px rgba(37, 99, 235, 0.4)' }}>
                <Bus size={28} color="#ffffff" />
              </div>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>SmartBus Tracker</h2>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>School Transportation Management Platform</p>
              </div>
            </div>

            <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#ffffff', lineHeight: 1.25, margin: '24px 0 16px 0', letterSpacing: '-0.03em' }}>
              Safe journeys.<br />Real-time visibility.
            </h1>
            <p style={{ color: '#cbd5e1', fontSize: '15px', lineHeight: 1.6, marginBottom: '32px', maxWidth: '380px' }}>
              Connecting school administrators, drivers, and parents with live telemetry, dynamic QR verification, and automated safety tracking.
            </p>

            {/* Feature Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                  <CheckCircle2 size={14} />
                </div>
                <span style={{ fontSize: '14px', color: '#f1f5f9', fontWeight: 500 }}>Live GPS tracking with heading rotation</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                  <CheckCircle2 size={14} />
                </div>
                <span style={{ fontSize: '14px', color: '#f1f5f9', fontWeight: 500 }}>Dynamic anti-fraud QR student boarding</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                  <CheckCircle2 size={14} />
                </div>
                <span style={{ fontSize: '14px', color: '#f1f5f9', fontWeight: 500 }}>One-tap SOS emergency broadcasts & alerts</span>
              </div>
            </div>
          </div>

          {/* Floating mini status badge */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Radio size={18} color="#10b981" />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff' }}>Live Fleet Network Active</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Real-time Socket.IO stream connected</div>
              </div>
            </div>
            <span style={{ background: '#10b981', color: '#ffffff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px' }}>99.9% UPTIME</span>
          </div>
        </div>

        {/* Right Side: Authentication Card */}
        <div className="login-box">
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>Welcome Back</h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Choose your portal and sign in to continue.</p>
          </div>

          {/* Role Tabs */}
          <div className="role-tabs">
            {[
              { key: 'school', icon: GraduationCap, label: 'School Admin' },
              { key: 'driver', icon: Bus, label: 'Driver' },
              { key: 'parent', icon: User, label: 'Parent' },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                className={role === key ? 'active' : ''}
                onClick={() => handleRoleChange(key)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} ref={formRef}>
            {role === 'school' && (
              <>
                <div className="form-group">
                  <label>Administrator Email</label>
                  <div style={{ position: 'relative' }}>
                    <span className="input-icon"><Mail size={16} /></span>
                    <input
                      type="email"
                      placeholder="admin@school.edu"
                      value={formData.email || ''}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      required
                      style={{ paddingLeft: '38px' }}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <div style={{ position: 'relative' }}>
                    <span className="input-icon"><Lock size={16} /></span>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={formData.password || ''}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      required
                      style={{ paddingLeft: '38px' }}
                    />
                  </div>
                </div>
              </>
            )}

            {role === 'driver' && (
              <>
                <div className="form-group">
                  <label>Driver Email</label>
                  <div style={{ position: 'relative' }}>
                    <span className="input-icon"><Mail size={16} /></span>
                    <input
                      type="email"
                      placeholder="driver@school.edu"
                      value={formData.email || ''}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      required
                      style={{ paddingLeft: '38px' }}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <div style={{ position: 'relative' }}>
                    <span className="input-icon"><Lock size={16} /></span>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={formData.password || ''}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      required
                      style={{ paddingLeft: '38px' }}
                    />
                  </div>
                </div>
              </>
            )}

            {role === 'parent' && (
              <>
                <div className="form-group">
                  <label>School Code (6 Characters)</label>
                  <div style={{ position: 'relative' }}>
                    <span className="input-icon"><Building2 size={16} /></span>
                    <input
                      type="text"
                      placeholder="e.g. ABC123"
                      value={formData.schoolCode || ''}
                      onChange={e => setFormData({ ...formData, schoolCode: e.target.value.toUpperCase() })}
                      required
                      maxLength={6}
                      style={{
                        paddingLeft: '38px',
                        textTransform: 'uppercase',
                        letterSpacing: '3px',
                        fontWeight: 700,
                        fontFamily: 'monospace'
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                    Issued by your child's school administration
                  </span>
                </div>
                <div className="form-group">
                  <label>Registered Phone Number</label>
                  <div style={{ position: 'relative' }}>
                    <span className="input-icon"><Phone size={16} /></span>
                    <input
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={formData.parentPhone || ''}
                      onChange={e => setFormData({ ...formData, parentPhone: e.target.value })}
                      required
                      style={{ paddingLeft: '38px' }}
                    />
                  </div>
                </div>
              </>
            )}

            {error && (
              <div
                className="login-error-banner"
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '13px',
                  color: '#b91c1c',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>⚠️ {error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', padding: '12px', fontSize: '15px', borderRadius: '10px', marginTop: '8px' }}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Portal</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {role === 'school' && (
            <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                New educational institution?{' '}
                <Link to="/school-signup" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                  Register your school
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;
