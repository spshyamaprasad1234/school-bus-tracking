import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Building2, Mail, Lock, MapPin, Phone, ArrowLeft, 
  CheckCircle2 
} from 'lucide-react';
import { schoolAPI } from '../api';
import { useToast } from '../App';
import gsap from 'gsap';

function SchoolSignup() {
  const navigate = useNavigate();
  const toast = useToast();
  const [formData, setFormData] = useState({ name: '', email: '', password: '', address: '', phone: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const successRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
      );
    }
  }, []);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password || !formData.address || !formData.phone) {
      setError('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await schoolAPI.signup(formData);
      setSchoolCode(res.data.school_code);
      setSuccess('School registered successfully!');
      toast.success('Registration successful! Save your school code.');
      setTimeout(() => {
        if (successRef.current) {
          gsap.fromTo(successRef.current,
            { scale: 0.9, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
          );
        }
      }, 50);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (success && schoolCode) {
    return (
      <div className="login-container">
        <div className="login-box glassmorphism" ref={successRef} style={{ textAlign: 'center', maxWidth: '480px' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success, #10b981)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', border: '2px solid rgba(16, 185, 129, 0.2)'
          }}>
            <CheckCircle2 size={40} />
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--slate-900)', marginBottom: '8px' }}>
            Registration Complete!
          </h2>
          <p style={{ color: 'var(--slate-600)', fontSize: '14px', marginBottom: '24px', lineHeight: 1.5 }}>
            Your institution is now ready. Save your unique School Code to share with your drivers and parents.
          </p>

          <div style={{
            background: 'var(--slate-50)', border: '2px dashed var(--primary)',
            borderRadius: '16px', padding: '24px', marginBottom: '24px'
          }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--slate-500)', display: 'block', marginBottom: '8px' }}>
              Your School Code
            </span>
            <div style={{
              fontSize: '32px', fontWeight: 800, letterSpacing: '0.15em',
              color: 'var(--primary)', fontFamily: 'monospace'
            }}>
              {schoolCode}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--slate-500)', marginTop: '6px', display: 'block' }}>
              Drivers & parents need this code during registration
            </span>
          </div>

          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={() => navigate('/login')}
          >
            Proceed to School Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box glassmorphism" ref={containerRef} style={{ maxWidth: '520px' }}>
        <div className="login-header">
          <Link to="/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            color: 'var(--slate-500)', fontSize: '13px', fontWeight: 600,
            textDecoration: 'none', marginBottom: '16px', transition: 'color 0.2s'
          }}>
            <ArrowLeft size={16} /> Back to Sign In
          </Link>
          <div style={{
            width: 48, height: 48, borderRadius: '12px',
            background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px'
          }}>
            <Building2 size={26} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--slate-900)', margin: 0 }}>
            Register Your School
          </h2>
          <p style={{ color: 'var(--slate-600)', fontSize: '14px', marginTop: '6px' }}>
            Set up real-time live fleet tracking & smart student check-ins
          </p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '20px' }}>
            <span>✕</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>School / Institution Name</label>
            <div className="input-with-icon">
              <Building2 size={18} className="input-icon" />
              <input
                type="text"
                name="name"
                placeholder="e.g. St. Xavier's International School"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label>Official Email</label>
              <div className="input-with-icon">
                <Mail size={18} className="input-icon" />
                <input
                  type="email"
                  name="email"
                  placeholder="admin@school.edu"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <div className="input-with-icon">
                <Phone size={18} className="input-icon" />
                <input
                  type="tel"
                  name="phone"
                  placeholder="+1 (555) 000-0000"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>School Address</label>
            <div className="input-with-icon">
              <MapPin size={18} className="input-icon" />
              <input
                type="text"
                name="address"
                placeholder="Campus address, City, State"
                value={formData.address}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Administrator Password</label>
            <div className="input-with-icon">
              <Lock size={18} className="input-icon" />
              <input
                type="password"
                name="password"
                placeholder="Create a strong password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            disabled={loading}
            style={{ marginTop: '8px' }}
          >
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span className="spinner" style={{ width: 16, height: 16 }}></span>
                Registering School...
              </span>
            ) : (
              'Create School Account'
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--slate-500)' }}>
          Already registered?{' '}
          <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>
            Sign In here
          </Link>
        </div>
      </div>
    </div>
  );
}

export default SchoolSignup;
