import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Building2, Mail, Lock, MapPin, Phone } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { schoolAPI, authAPI } from '../api';
import { useToast } from '../App';
import gsap from 'gsap';

function SchoolSignup() {
  const navigate = useNavigate();
  const toast = useToast();
  const [formData, setFormData] = useState({ name: '', email: '', password: '', address: '', phone: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const successRef = useRef(null);

  useEffect(() => {
    gsap.fromTo(boxRef.current,
      { opacity: 0, y: 30, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power2.out' }
    );
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await schoolAPI.signup(formData);
      setSuccess(`Registered successfully! Your school code is: ${response.data.schoolCode}`);
      toast.success('School registered successfully!');
      if (successRef.current) {
        gsap.fromTo(successRef.current,
          { opacity: 0, scale: 0.92 },
          { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.7)' }
        );
      }
      setTimeout(() => navigate('/login'), 4000);
    } catch (err) {
      const msg = err.response?.data?.error || 'Signup failed. Please try again.';
      setError(msg);
      gsap.fromTo('.error-message', { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.25 });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    setError('');
    try {
      const res = await authAPI.googleSignup({ credential: credentialResponse.credential, address: formData.address, phone: formData.phone });
      setSuccess(`Registered successfully with Google! Your school code is: ${res.data.schoolCode}`);
      toast.success('School registered with Google!');
      if (successRef.current) {
        gsap.fromTo(successRef.current,
          { opacity: 0, scale: 0.92 },
          { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.7)' }
        );
      }
      setTimeout(() => navigate('/login'), 4000);
    } catch (err) {
      setError(err.response?.data?.error || 'Google signup failed');
    } finally {
      setLoading(false);
    }
  };

  const googleSignup = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => setError('Google signup failed. Please try again.'),
    flow: 'implicit',
  });

  const handleBack = () => {
    gsap.to(boxRef.current, {
      opacity: 0, x: -50, duration: 0.25,
      onComplete: () => navigate('/login')
    });
  };

  return (
    <div className="login-container">
      <div className="login-box" ref={boxRef}>
        <button onClick={handleBack} className="back-btn" style={{ marginBottom: 16 }}>
          <ArrowLeft size={16} /> Back to Login
        </button>

        <div className="brand" style={{ marginBottom: 24 }}>
          <div className="brand-icon">
            <Building2 size={28} />
          </div>
          <h1>Register School</h1>
          <p className="subtitle">Create your school account</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>School Name</label>
            <div style={{ position: 'relative' }}>
              <span className="input-icon"><Building2 size={16} /></span>
              <input type="text" placeholder="e.g. Springfield Elementary" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            </div>
          </div>
          <div className="form-group">
            <label>Email Address</label>
            <div style={{ position: 'relative' }}>
              <span className="input-icon"><Mail size={16} /></span>
              <input type="email" placeholder="admin@school.edu" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
            </div>
          </div>
          <div className="form-group">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <span className="input-icon"><Lock size={16} /></span>
              <input type="password" placeholder="Create a strong password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required minLength={6} />
            </div>
          </div>
          <div className="form-group">
            <label>Address</label>
            <div style={{ position: 'relative' }}>
              <span className="input-icon"><MapPin size={16} /></span>
              <input type="text" placeholder="School address" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
            </div>
          </div>
          <div className="form-group">
            <label>Phone Number</label>
            <div style={{ position: 'relative' }}>
              <span className="input-icon"><Phone size={16} /></span>
              <input type="tel" placeholder="+1 (555) 000-0000" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
            </div>
          </div>
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message" ref={successRef}>{success}</div>}
          <button type="submit" disabled={loading}>
            {loading ? <><span className="spinner"></span> Creating account...</> : 'Create Account'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--gray-200)' }}></div>
            <span style={{ fontSize: 13, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>or sign up with</span>
            <div style={{ flex: 1, height: 1, background: 'var(--gray-200)' }}></div>
          </div>
          <button
            type="button"
            onClick={() => googleSignup()}
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
            Sign up with Google
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--gray-400)' }}>
          Already have an account? <Link to="/login" style={{ display: 'inline', marginTop: 0 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default SchoolSignup;
