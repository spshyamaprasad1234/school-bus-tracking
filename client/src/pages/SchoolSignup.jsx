import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Building2, Mail, Lock, MapPin, Phone } from 'lucide-react';
import { schoolAPI } from '../api';
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
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--gray-400)' }}>
          Already have an account? <Link to="/login" style={{ display: 'inline', marginTop: 0 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default SchoolSignup;
