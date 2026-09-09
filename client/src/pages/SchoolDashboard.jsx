import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, Link, Routes, Route, useLocation } from 'react-router-dom';
import { 
  Bus, GraduationCap, Users, Route as RouteIcon, Plus, Pencil, Trash2, 
  Search, X, MapPin, Compass, Play, Pause, RotateCcw, 
  Clock, Shield, CheckCircle2, AlertOctagon, 
  Gauge, Check, LayoutDashboard, BarChart3, Radio, History, Copy, School, LogOut, 
  Award, ArrowRight 
} from 'lucide-react';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
import { schoolAPI, tripAPI } from '../api';
import { clearAuth } from '../auth';
import { useToast } from '../App';
import { 
  connectSocket, joinSchoolFleet, onFleetLocationUpdate, onFleetAlert, 
  onEmergencyAlert, onEmergencyAcknowledged, onTripStarted, onTripEnded 
} from '../socket';
import gsap from 'gsap';
import StatusBadge from '../components/ui/StatusBadge';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import ConfirmModal from '../components/ui/ConfirmModal';

const mapContainerStyle = { width: '100%', height: '100%', borderRadius: '16px' };
const defaultCenter = { lat: 28.6139, lng: 77.2090 };
const mapOptions = { 
  disableDefaultUI: false, 
  zoomControl: true, 
  streetViewControl: false, 
  mapTypeControl: false, 
  fullscreenControl: true,
  styles: [
    { featureType: 'poi', stylers: [{ visibility: 'simplified' }] },
    { featureType: 'transit', stylers: [{ visibility: 'simplified' }] }
  ]
};

const createFleetBusIcon = (heading = 0, isAlert = false, isActive = true) => {
  if (typeof window === 'undefined' || !window.google?.maps) return undefined;
  return {
    path: 'M -12,-16 L 12,-16 C 14,-16 16,-14 16,-12 L 16,14 C 16,16 14,18 12,18 L -12,18 C -14,18 -16,16 -16,14 L -16,-12 C -16,-14 -14,-16 -12,-16 Z M -11,-12 L -11,-4 L 11,-4 L 11,-12 Z M -11,0 L -6,0 L -6,6 L -11,6 Z M 6,0 L 11,0 L 11,6 L 6,6 Z M -10,10 C -11.1,10 -12,10.9 -12,12 C -12,13.1 -11.1,14 -10,14 C -8.9,14 -8,13.1 -8,12 C -8,10.9 -8.9,10 -10,10 Z M 10,10 C 8.9,10 8,10.9 8,12 C 8,13.1 8.9,14 10,14 C 11.1,14 12,13.1 12,12 C 12,10.9 11.1,10 10,10 Z',
    fillColor: isAlert ? '#ef4444' : isActive ? '#2563eb' : '#64748b',
    fillOpacity: 1,
    strokeWeight: 2,
    strokeColor: '#ffffff',
    scale: 1.1,
    rotation: heading || 0,
    anchor: new window.google.maps.Point(0, 0)
  };
};

function SchoolNav({ onLogout }) {
  const location = useLocation();
  const path = location.pathname;

  const navItems = [
    { to: '/school-dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
    { to: '/school-dashboard/fleet', label: 'Live Fleet', icon: Radio, live: true },
    { to: '/school-dashboard/trips', label: 'Trip Logs', icon: History },
    { to: '/school-dashboard/analytics', label: 'Insights', icon: BarChart3 },
    { to: '/school-dashboard/drivers', label: 'Drivers', icon: Users },
    { to: '/school-dashboard/buses', label: 'Buses', icon: Bus },
    { to: '/school-dashboard/routes', label: 'Routes', icon: RouteIcon },
    { to: '/school-dashboard/students', label: 'Students', icon: GraduationCap },
  ];

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid #e2e8f0',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <School size={20} />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>School Fleet</div>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Administration Portal</div>
          </div>
        </div>

        {/* Nav Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {navItems.map((item) => {
            const isActive = item.exact 
              ? (path === item.to || path === `${item.to}/`) 
              : path.includes(item.to);
            const Icon = item.icon;

            return (
              <Link
                key={item.to}
                to={item.to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: isActive ? 700 : 600,
                  color: isActive ? '#2563eb' : '#475569',
                  background: isActive ? '#eff6ff' : 'transparent',
                  transition: 'all 0.15s ease',
                  textDecoration: 'none'
                }}
              >
                {item.live && (
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                )}
                <Icon size={15} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <button onClick={onLogout} className="btn btn-outline btn-sm" style={{ borderRadius: '10px', color: '#64748b' }}>
          <LogOut size={15} /> Logout
        </button>
      </div>
    </nav>
  );
}

// ========================================================
// 1. OVERVIEW DASHBOARD
// ========================================================

function Dashboard() {
  const [stats, setStats] = useState({ driverCount: 0, busCount: 0, routeCount: 0, studentCount: 0 });
  const [info, setInfo] = useState({});
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const statsRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        const [dashboardRes, infoRes, tripsRes] = await Promise.all([
          schoolAPI.getDashboard(),
          schoolAPI.getInfo(),
          tripAPI.getActiveTrips()
        ]);
        if (!isMounted) return;
        setStats(dashboardRes.data);
        setInfo(infoRes.data);
        setTrips(tripsRes.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    init();
    if (statsRef.current) {
      gsap.fromTo(statsRef.current.children,
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.06, ease: 'power2.out' }
      );
    }
    return () => { isMounted = false; };
  }, []);

  const handleCopyCode = () => {
    if (info.school_code) {
      navigator.clipboard.writeText(info.school_code);
      setCopiedCode(true);
      toast.success('School code copied to clipboard!');
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleLogout = () => setShowLogoutConfirm(true);
  const confirmLogout = () => { clearAuth(); navigate('/login'); };

  return (
    <div className="dashboard" style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <SchoolNav onLogout={handleLogout} />

      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="Confirm Sign Out"
        message="Are you sure you want to sign out of the school administration console?"
        confirmText="Sign Out"
        cancelText="Cancel"
        type="danger"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      <div className="content" style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 20px 60px' }}>
        {/* Welcome & School Code Header Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
            borderRadius: '20px',
            padding: '24px 28px',
            color: '#ffffff',
            marginBottom: '24px',
            boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '18px'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px' }}>🏫</span>
              <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                {info.name || 'School Fleet Console'}
              </h2>
            </div>
            <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '13px' }}>
              {info.email || 'Administration'} {info.phone ? `· ${info.phone}` : ''}
            </p>
          </div>

          {info.school_code && (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '14px',
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px'
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Institution Access Code
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.05em', fontFamily: 'monospace' }}>
                  {info.school_code}
                </div>
              </div>
              <button
                onClick={handleCopyCode}
                className="btn btn-sm"
                style={{
                  background: copiedCode ? '#16a34a' : 'rgba(255,255,255,0.15)',
                  color: '#ffffff',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {copiedCode ? <Check size={14} /> : <Copy size={14} />} {copiedCode ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>

        {/* 4 Primary KPI Stat Cards */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ background: '#fff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0' }}>
                <Skeleton width="40px" height="40px" style={{ borderRadius: '10px', marginBottom: '12px' }} />
                <Skeleton width="60%" height="24px" style={{ marginBottom: '8px' }} />
                <Skeleton width="40%" height="14px" />
              </div>
            ))}
          </div>
        ) : (
          <div ref={statsRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <StatCard
              title="Registered Drivers"
              value={stats.driverCount || 0}
              icon={Users}
              color="primary"
              trend={stats.driverCount > 0 ? `${stats.driverCount} Active` : 'None yet'}
              trendType="neutral"
            />
            <StatCard
              title="Fleet Buses"
              value={stats.busCount || 0}
              icon={Bus}
              color="success"
              trend={trips.length > 0 ? `${trips.length} on trip` : 'Standby'}
              trendType="positive"
            />
            <StatCard
              title="Active Routes"
              value={stats.routeCount || 0}
              icon={RouteIcon}
              color="warning"
              trend="Mapped corridors"
              trendType="neutral"
            />
            <StatCard
              title="Enrolled Students"
              value={stats.studentCount || 0}
              icon={GraduationCap}
              color="primary"
              trend="QR Passes issued"
              trendType="positive"
            />
          </div>
        )}

        {/* Active Trips Live Feed */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '20px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            marginBottom: '24px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Radio size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Active Bus Trips</h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Real-time student transit in progress</span>
              </div>
            </div>

            <Link to="/school-dashboard/fleet" className="btn btn-outline btn-sm" style={{ borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>View Full Fleet Map</span> <ArrowRight size={14} />
            </Link>
          </div>

          {trips.length === 0 ? (
            <EmptyState
              title="No Trips Currently Active"
              description="No school buses are broadcasting live trips at this moment. Once a driver starts a trip from the Driver Dashboard, real-time GPS telemetry will appear here."
              icon={Bus}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
              {trips.map(trip => (
                <div
                  key={trip._id}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                        🚌 Bus {trip.bus_number}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        Driver: <strong style={{ color: '#334155' }}>{trip.driver_name || 'Assigned Driver'}</strong>
                      </div>
                    </div>
                    <StatusBadge status="LIVE" size="sm" />
                  </div>

                  <div style={{ fontSize: '13px', color: '#475569', borderTop: '1px solid #e2e8f0', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Route: <strong>{trip.route_name || 'Standard'}</strong></span>
                    <span style={{ color: '#16a34a', fontWeight: 700 }}>{trip.check_in_count || 0} boarded</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Management Shortcuts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          {[
            { to: '/school-dashboard/drivers', label: 'Manage Drivers', desc: 'Create & assign accounts', icon: Users, color: '#2563eb' },
            { to: '/school-dashboard/buses', label: 'Manage Buses', desc: 'Fleet vehicle roster', icon: Bus, color: '#16a34a' },
            { to: '/school-dashboard/routes', label: 'Manage Routes', desc: 'Stop geocoding & paths', icon: RouteIcon, color: '#f59e0b' },
            { to: '/school-dashboard/students', label: 'Manage Students', desc: 'Passes & parent links', icon: GraduationCap, color: '#8b5cf6' },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <Link
                key={idx}
                to={item.to}
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  padding: '18px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textDecoration: 'none',
                  color: '#0f172a',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}
              >
                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: `${item.color}15`, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={22} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '14px' }}>{item.label}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{item.desc}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ========================================================
// 2. DRIVERS VIEW
// ========================================================

function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', licenseNumber: '', password: '' });
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const loadDrivers = useCallback(async () => {
    try {
      const res = await schoolAPI.getDrivers();
      setDrivers(res.data || []);
    } catch { toast.error('Failed to load drivers'); }
  }, [toast]);

  useEffect(() => {
    let isMounted = true;
    const fetchDrivers = async () => {
      try {
        const res = await schoolAPI.getDrivers();
        if (isMounted) setDrivers(res.data || []);
      } catch {
        if (isMounted) toast.error('Failed to load drivers');
      }
    };
    fetchDrivers();
    return () => { isMounted = false; };
  }, [toast]);

  const openAdd = () => {
    setEditingDriver(null);
    setFormData({ name: '', email: '', phone: '', licenseNumber: '', password: '' });
    setShowForm(true);
  };

  const openEdit = (driver) => {
    setEditingDriver(driver);
    setFormData({
      name: driver.name, email: driver.email, phone: driver.phone || '',
      licenseNumber: driver.license_number || '', password: ''
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingDriver) {
        await schoolAPI.updateDriver(editingDriver._id, formData);
        toast.success('Driver updated successfully');
      } else {
        await schoolAPI.addDriver(formData);
        toast.success('Driver added successfully');
      }
      setShowForm(false);
      loadDrivers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save driver');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await schoolAPI.deleteDriver(id);
      toast.success('Driver deleted');
      setDeleteConfirm(null);
      loadDrivers();
    } catch { toast.error('Failed to delete driver'); }
  };

  const filtered = drivers.filter(d =>
    !search || d.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="dashboard" style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <SchoolNav onLogout={() => { clearAuth(); navigate('/login'); }} />

      <div className="content" style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 20px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#0f172a' }}>Fleet Drivers</h2>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
              Manage registered driver accounts and vehicle credentials
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search drivers..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="form-control"
                style={{ paddingLeft: '34px', width: '220px' }}
              />
              <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
            </div>
            <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> Add Driver
            </button>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          {filtered.length === 0 ? (
            <EmptyState
              title="No Drivers Found"
              description={search ? "No drivers match your search query." : "No drivers have been added yet. Click 'Add Driver' to register your first driver account."}
              icon={Users}
              actionText="Add Driver"
              onAction={openAdd}
            />
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700 }}>
                    <th style={{ padding: '14px 18px' }}>Driver</th>
                    <th style={{ padding: '14px 18px' }}>Email</th>
                    <th style={{ padding: '14px 18px' }}>Phone</th>
                    <th style={{ padding: '14px 18px' }}>License</th>
                    <th style={{ padding: '14px 18px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(d => (
                    <tr key={d._id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                            {d.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <span>{d.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px', color: '#475569' }}>{d.email}</td>
                      <td style={{ padding: '14px 18px', color: '#475569' }}>{d.phone || '—'}</td>
                      <td style={{ padding: '14px 18px' }}>
                        {d.license_number ? (
                          <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontWeight: 600, color: '#334155' }}>
                            {d.license_number}
                          </span>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(d)} style={{ padding: '6px 10px' }}>
                            <Pencil size={13} />
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(d._id)} style={{ padding: '6px 10px' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add/Edit Driver Modal */}
        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
              <div className="confirm-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{editingDriver ? 'Edit Driver Profile' : 'Add New Driver'}</h3>
                <button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)} style={{ padding: '4px 8px' }}><X size={16} /></button>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Full Name</label>
                    <input type="text" className="form-control" placeholder="e.g. John Smith" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Email Address (Login)</label>
                    <input type="email" className="form-control" placeholder="driver@school.edu" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Phone Number</label>
                    <input type="tel" className="form-control" placeholder="+1 (555) 000-0000" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Driver License #</label>
                    <input type="text" className="form-control" placeholder="e.g. DL-987654" value={formData.licenseNumber} onChange={e => setFormData({...formData, licenseNumber: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>
                      Password {editingDriver && <span style={{ fontWeight: 400, color: '#94a3b8' }}>(leave blank to preserve)</span>}
                    </label>
                    <input type="password" className="form-control" placeholder={editingDriver ? '••••••••' : 'Create login password'} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required={!editingDriver} />
                  </div>
                </div>

                <div className="confirm-modal-actions" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1.5 }}>
                    {loading ? 'Saving...' : editingDriver ? 'Update Driver' : 'Save Driver'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={!!deleteConfirm}
          title="Delete Driver Account?"
          message="This action will permanently delete the driver account. They will no longer be able to log in or start bus trips."
          confirmText="Delete Driver"
          cancelText="Cancel"
          type="danger"
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      </div>
    </div>
  );
}

// ========================================================
// 3. BUSES VIEW
// ========================================================

function Buses() {
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingBus, setEditingBus] = useState(null);
  const [formData, setFormData] = useState({ busNumber: '', licensePlate: '', model: '', capacity: 50, driverId: '', routeId: '' });
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const loadData = useCallback(async () => {
    try {
      const [busesRes, driversRes, routesRes] = await Promise.all([schoolAPI.getBuses(), schoolAPI.getDrivers(), schoolAPI.getRoutes()]);
      setBuses(busesRes.data || []);
      setDrivers(driversRes.data || []);
      setRoutes(routesRes.data || []);
    } catch { toast.error('Failed to load data'); }
  }, [toast]);

  useEffect(() => {
    let isMounted = true;
    const fetchBuses = async () => {
      try {
        const [busesRes, driversRes, routesRes] = await Promise.all([schoolAPI.getBuses(), schoolAPI.getDrivers(), schoolAPI.getRoutes()]);
        if (isMounted) {
          setBuses(busesRes.data || []);
          setDrivers(driversRes.data || []);
          setRoutes(routesRes.data || []);
        }
      } catch {
        if (isMounted) toast.error('Failed to load data');
      }
    };
    fetchBuses();
    return () => { isMounted = false; };
  }, [toast]);

  const openAdd = () => {
    setEditingBus(null);
    setFormData({ busNumber: '', licensePlate: '', model: '', capacity: 50, driverId: '', routeId: '' });
    setShowForm(true);
  };

  const openEdit = (bus) => {
    setEditingBus(bus);
    setFormData({ 
      busNumber: bus.bus_number, 
      licensePlate: bus.license_plate, 
      model: bus.model, 
      capacity: bus.capacity, 
      driverId: bus.driver_id?._id || bus.driver_id || '', 
      routeId: bus.route_id?._id || bus.route_id || '' 
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingBus) {
        await schoolAPI.updateBus(editingBus._id, formData);
        toast.success('Bus updated successfully');
      } else {
        await schoolAPI.addBus(formData);
        toast.success('Bus added successfully');
      }
      setShowForm(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save bus');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await schoolAPI.deleteBus(id);
      toast.success('Bus deleted');
      setDeleteConfirm(null);
      loadData();
    } catch { toast.error('Failed to delete bus'); }
  };

  const filtered = buses.filter(b =>
    !search || b.bus_number?.toLowerCase().includes(search.toLowerCase()) ||
    b.license_plate?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="dashboard" style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <SchoolNav onLogout={() => { clearAuth(); navigate('/login'); }} />

      <div className="content" style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 20px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#0f172a' }}>Fleet Buses</h2>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
              Manage vehicle inventory, seating capacity, assigned drivers, and active routes
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search buses..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="form-control"
                style={{ paddingLeft: '34px', width: '220px' }}
              />
              <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
            </div>
            <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> Add Bus
            </button>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          {filtered.length === 0 ? (
            <EmptyState
              title="No Buses Found"
              description={search ? "No buses match your search filter." : "No fleet buses added yet. Click 'Add Bus' to add your first school bus."}
              icon={Bus}
              actionText="Add Bus"
              onAction={openAdd}
            />
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700 }}>
                    <th style={{ padding: '14px 18px' }}>Bus #</th>
                    <th style={{ padding: '14px 18px' }}>License Plate</th>
                    <th style={{ padding: '14px 18px' }}>Model</th>
                    <th style={{ padding: '14px 18px' }}>Capacity</th>
                    <th style={{ padding: '14px 18px' }}>Driver</th>
                    <th style={{ padding: '14px 18px' }}>Route</th>
                    <th style={{ padding: '14px 18px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(b => (
                    <tr key={b._id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0f172a' }}>
                        🚌 {b.bus_number}
                      </td>
                      <td style={{ padding: '14px 18px', color: '#334155', fontWeight: 600 }}>{b.license_plate}</td>
                      <td style={{ padding: '14px 18px', color: '#64748b' }}>{b.model || '—'}</td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                          {b.capacity} seats
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', color: '#475569' }}>
                        {b.driver_name ? <strong>{b.driver_name}</strong> : <span style={{ color: '#cbd5e1' }}>Unassigned</span>}
                      </td>
                      <td style={{ padding: '14px 18px', color: '#475569' }}>
                        {b.route_name ? <span>{b.route_name}</span> : <span style={{ color: '#cbd5e1' }}>Unassigned</span>}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(b)} style={{ padding: '6px 10px' }}>
                            <Pencil size={13} />
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(b._id)} style={{ padding: '6px 10px' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add/Edit Bus Modal */}
        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
              <div className="confirm-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{editingBus ? 'Edit Bus Vehicle' : 'Add New Bus'}</h3>
                <button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)} style={{ padding: '4px 8px' }}><X size={16} /></button>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Bus Number / Identification</label>
                    <input type="text" className="form-control" placeholder="e.g. BUS-101" value={formData.busNumber} onChange={e => setFormData({...formData, busNumber: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>License Plate</label>
                    <input type="text" className="form-control" placeholder="e.g. DL-01-AB-1234" value={formData.licensePlate} onChange={e => setFormData({...formData, licensePlate: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Model / Make</label>
                    <input type="text" className="form-control" placeholder="e.g. Tata Starbus Ultra" value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Passenger Capacity</label>
                    <input type="number" className="form-control" value={formData.capacity} onChange={e => setFormData({...formData, capacity: Number(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Assigned Driver</label>
                    <select className="form-control" value={formData.driverId} onChange={e => setFormData({...formData, driverId: e.target.value})}>
                      <option value="">— Unassigned —</option>
                      {drivers.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Assigned Route</label>
                    <select className="form-control" value={formData.routeId} onChange={e => setFormData({...formData, routeId: e.target.value})}>
                      <option value="">— Unassigned —</option>
                      {routes.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="confirm-modal-actions" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1.5 }}>
                    {loading ? 'Saving...' : editingBus ? 'Update Bus' : 'Save Bus'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={!!deleteConfirm}
          title="Delete Bus Vehicle?"
          message="This action will permanently delete this bus record from the fleet."
          confirmText="Delete Bus"
          cancelText="Cancel"
          type="danger"
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      </div>
    </div>
  );
}

// ========================================================
// 4. ROUTES VIEW
// ========================================================

function Routes_() {
  const [routes, setRoutes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [formData, setFormData] = useState({ name: '', startLocation: '', endLocation: '', estimatedTime: '', stops: [] });
  const [newStop, setNewStop] = useState({ name: '', address: '', order: 0, latitude: '', longitude: '' });
  const [geocoding, setGeocoding] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const { isLoaded: isMapsLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

  const loadRoutes = useCallback(async () => {
    try {
      const res = await schoolAPI.getRoutes();
      setRoutes(res.data || []);
    } catch { toast.error('Failed to load routes'); }
  }, [toast]);

  useEffect(() => {
    let isMounted = true;
    const fetchRoutes = async () => {
      try {
        const res = await schoolAPI.getRoutes();
        if (isMounted) setRoutes(res.data || []);
      } catch {
        if (isMounted) toast.error('Failed to load routes');
      }
    };
    fetchRoutes();
    return () => { isMounted = false; };
  }, [toast]);

  const openAdd = () => {
    setEditingRoute(null);
    setFormData({ name: '', startLocation: '', endLocation: '', estimatedTime: '', stops: [] });
    setNewStop({ name: '', address: '', order: 0, latitude: '', longitude: '' });
    setShowForm(true);
  };

  const openEdit = (route) => {
    setEditingRoute(route);
    setFormData({ 
      name: route.name, 
      startLocation: route.start_location, 
      endLocation: route.end_location, 
      estimatedTime: route.estimated_time, 
      stops: route.stops || [] 
    });
    setNewStop({ name: '', address: '', order: 0, latitude: '', longitude: '' });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const stopsWithOrder = formData.stops.map((stop, idx) => ({
        name: stop.name,
        address: stop.address || '',
        order: idx + 1,
        latitude: typeof stop.latitude === 'number' ? stop.latitude : (stop.latitude ? parseFloat(stop.latitude) : undefined),
        longitude: typeof stop.longitude === 'number' ? stop.longitude : (stop.longitude ? parseFloat(stop.longitude) : undefined)
      }));
      const payload = { ...formData, stops: stopsWithOrder };
      if (editingRoute) {
        await schoolAPI.updateRoute(editingRoute._id, payload);
        toast.success('Route updated successfully');
      } else {
        await schoolAPI.addRoute(payload);
        toast.success('Route added successfully');
      }
      setShowForm(false);
      loadRoutes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save route');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await schoolAPI.deleteRoute(id);
      toast.success('Route deleted');
      setDeleteConfirm(null);
      loadRoutes();
    } catch { toast.error('Failed to delete route'); }
  };

  const addStop = async () => {
    if (!newStop.name.trim()) return;
    setGeocoding(true);

    let lat = newStop.latitude ? parseFloat(newStop.latitude) : undefined;
    let lng = newStop.longitude ? parseFloat(newStop.longitude) : undefined;

    const searchTarget = (newStop.address || newStop.name).trim();
    if ((!lat || !lng) && isMapsLoaded && window.google?.maps?.Geocoder && searchTarget) {
      try {
        const coords = await new Promise((resolve) => {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ address: searchTarget }, (results, status) => {
            if (status === 'OK' && results && results[0]?.geometry?.location) {
              const loc = results[0].geometry.location;
              resolve({
                latitude: typeof loc.lat === 'function' ? loc.lat() : loc.lat,
                longitude: typeof loc.lng === 'function' ? loc.lng() : loc.lng
              });
            } else {
              resolve(null);
            }
          });
        });
        if (coords) {
          lat = coords.latitude;
          lng = coords.longitude;
        }
      } catch (geoErr) {
        console.warn('Geocoding error:', geoErr);
      }
    }

    setFormData(prev => ({
      ...prev,
      stops: [
        ...prev.stops,
        {
          name: newStop.name.trim(),
          address: newStop.address.trim(),
          order: prev.stops.length + 1,
          ...(typeof lat === 'number' && !isNaN(lat) ? { latitude: lat } : {}),
          ...(typeof lng === 'number' && !isNaN(lng) ? { longitude: lng } : {})
        }
      ]
    }));

    setNewStop({ name: '', address: '', order: 0, latitude: '', longitude: '' });
    setGeocoding(false);
  };

  const removeStop = (index) => {
    setFormData({ ...formData, stops: formData.stops.filter((_, i) => i !== index) });
  };

  const filtered = routes.filter(r =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="dashboard" style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <SchoolNav onLogout={() => { clearAuth(); navigate('/login'); }} />

      <div className="content" style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 20px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#0f172a' }}>Transit Routes</h2>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
              Configure scheduled route corridors, waypoint stops and coordinates
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search routes..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="form-control"
                style={{ paddingLeft: '34px', width: '220px' }}
              />
              <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
            </div>
            <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> Create Route
            </button>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          {filtered.length === 0 ? (
            <EmptyState
              title="No Routes Found"
              description={search ? "No routes match your search." : "No bus routes defined yet. Click 'Create Route' to map your first corridor."}
              icon={RouteIcon}
              actionText="Create Route"
              onAction={openAdd}
            />
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700 }}>
                    <th style={{ padding: '14px 18px' }}>Route Name</th>
                    <th style={{ padding: '14px 18px' }}>Start Location</th>
                    <th style={{ padding: '14px 18px' }}>Destination</th>
                    <th style={{ padding: '14px 18px' }}>Stops</th>
                    <th style={{ padding: '14px 18px' }}>Est. Time</th>
                    <th style={{ padding: '14px 18px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r._id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0f172a' }}>{r.name}</td>
                      <td style={{ padding: '14px 18px', color: '#475569' }}>{r.start_location || '—'}</td>
                      <td style={{ padding: '14px 18px', color: '#475569' }}>{r.end_location || '—'}</td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                          {r.stops?.length || 0} stops
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', color: '#64748b' }}>{r.estimated_time || '—'}</td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(r)} style={{ padding: '6px 10px' }}>
                            <Pencil size={13} />
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(r._id)} style={{ padding: '6px 10px' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add/Edit Route Modal */}
        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
              <div className="confirm-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{editingRoute ? 'Edit Transit Route' : 'Create New Route'}</h3>
                <button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)} style={{ padding: '4px 8px' }}><X size={16} /></button>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Route Name</label>
                    <input type="text" className="form-control" placeholder="e.g. North Suburb Route 1" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '12px', fontWeight: 700 }}>Origin Terminal</label>
                      <input type="text" className="form-control" placeholder="e.g. Main School Gate" value={formData.startLocation} onChange={e => setFormData({...formData, startLocation: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '12px', fontWeight: 700 }}>Destination Terminal</label>
                      <input type="text" className="form-control" placeholder="e.g. Downtown Hub" value={formData.endLocation} onChange={e => setFormData({...formData, endLocation: e.target.value})} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Estimated Travel Duration</label>
                    <input type="text" className="form-control" placeholder="e.g. 45 mins" value={formData.estimatedTime} onChange={e => setFormData({...formData, estimatedTime: e.target.value})} />
                  </div>

                  {/* Route Stops Stepper Builder */}
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', marginTop: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', marginBottom: '8px', display: 'block' }}>
                      Waypoint Stops (Auto-Geocodes Coordinates)
                    </label>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <input type="text" className="form-control" placeholder="Stop name" value={newStop.name} onChange={e => setNewStop({...newStop, name: e.target.value})} style={{ flex: 1 }} />
                      <input type="text" className="form-control" placeholder="Address (e.g. 123 Main St)" value={newStop.address} onChange={e => setNewStop({...newStop, address: e.target.value})} style={{ flex: 1.5 }} />
                      <button type="button" onClick={addStop} className="btn btn-primary btn-sm" disabled={geocoding} style={{ flexShrink: 0 }}>
                        {geocoding ? 'Locating...' : '+ Add'}
                      </button>
                    </div>

                    {formData.stops.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                        {formData.stops.map((stop, index) => (
                          <div
                            key={index}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              background: '#f8fafc',
                              borderRadius: '8px',
                              border: '1px solid #e2e8f0'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {index + 1}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: '13px' }}>{stop.name}</span>
                              <span style={{ fontSize: '12px', color: '#64748b' }}>{stop.address}</span>
                            </div>
                            <button type="button" onClick={() => removeStop(index)} className="btn btn-danger btn-sm" style={{ padding: '2px 6px', fontSize: '11px' }}>
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="confirm-modal-actions" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={loading || geocoding} style={{ flex: 1.5 }}>
                    {loading ? 'Saving...' : editingRoute ? 'Update Route' : 'Save Route'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={!!deleteConfirm}
          title="Delete Route Corridor?"
          message="This action will permanently delete this route configuration from the system."
          confirmText="Delete Route"
          cancelText="Cancel"
          type="danger"
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      </div>
    </div>
  );
}

// ========================================================
// 5. STUDENTS VIEW
// ========================================================

function Students() {
  const [students, setStudents] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [formData, setFormData] = useState({ name: '', parentPhone: '', pickupLocation: '', routeId: '', stopId: '' });
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const loadData = useCallback(async () => {
    try {
      const [studentsRes, routesRes] = await Promise.all([schoolAPI.getStudents(), schoolAPI.getRoutes()]);
      setStudents(studentsRes.data || []);
      setRoutes(routesRes.data || []);
    } catch { toast.error('Failed to load data'); }
  }, [toast]);

  useEffect(() => {
    let isMounted = true;
    const fetchStudents = async () => {
      try {
        const [studentsRes, routesRes] = await Promise.all([schoolAPI.getStudents(), schoolAPI.getRoutes()]);
        if (isMounted) {
          setStudents(studentsRes.data || []);
          setRoutes(routesRes.data || []);
        }
      } catch {
        if (isMounted) toast.error('Failed to load data');
      }
    };
    fetchStudents();
    return () => { isMounted = false; };
  }, [toast]);

  const openAdd = () => {
    setEditingStudent(null);
    setFormData({ name: '', parentPhone: '', pickupLocation: '', routeId: '', stopId: '' });
    setShowForm(true);
  };

  const openEdit = (student) => {
    setEditingStudent(student);
    setFormData({ 
      name: student.name, 
      parentPhone: student.parent_phone, 
      pickupLocation: student.pickup_location || '', 
      routeId: student.route_id?._id || student.route_id || '', 
      stopId: student.stop_id?.toString() || '' 
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingStudent) {
        await schoolAPI.updateStudent(editingStudent._id, formData);
        toast.success('Student updated successfully');
      } else {
        await schoolAPI.addStudent(formData);
        toast.success('Student added successfully');
      }
      setShowForm(false);
      loadData();
    } catch (err) {
      console.error('Save student error:', err.response?.data || err.message);
      toast.error(err.response?.data?.error || 'Failed to save student');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await schoolAPI.deleteStudent(id);
      toast.success('Student deleted');
      setDeleteConfirm(null);
      loadData();
    } catch (err) {
      console.error('Delete student error:', err.response?.data || err.message);
      toast.error(err.response?.data?.error || 'Failed to delete student');
    }
  };

  const selectedRoute = routes.find(r => r._id === formData.routeId);
  const stops = selectedRoute?.stops || [];

  const filtered = students.filter(s =>
    !search || s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.parent_phone?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="dashboard" style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <SchoolNav onLogout={() => { clearAuth(); navigate('/login'); }} />

      <div className="content" style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 20px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#0f172a' }}>Enrolled Students</h2>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
              Manage student boarding rosters, parent phone login associations, and assigned route stops
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search students..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="form-control"
                style={{ paddingLeft: '34px', width: '220px' }}
              />
              <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
            </div>
            <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> Enroll Student
            </button>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          {filtered.length === 0 ? (
            <EmptyState
              title="No Students Enrolled"
              description={search ? "No students match your search filter." : "No student boarding profiles have been created yet. Click 'Enroll Student' to register your first student."}
              icon={GraduationCap}
              actionText="Enroll Student"
              onAction={openAdd}
            />
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700 }}>
                    <th style={{ padding: '14px 18px' }}>Student</th>
                    <th style={{ padding: '14px 18px' }}>Parent Login Phone</th>
                    <th style={{ padding: '14px 18px' }}>Route</th>
                    <th style={{ padding: '14px 18px' }}>Designated Stop</th>
                    <th style={{ padding: '14px 18px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s._id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                            {s.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <span>{s.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px', color: '#334155', fontWeight: 600 }}>{s.parent_phone}</td>
                      <td style={{ padding: '14px 18px', color: '#475569' }}>
                        {s.route_name || <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '14px 18px', color: '#475569' }}>
                        {s.stop_name || <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(s)} style={{ padding: '6px 10px' }}>
                            <Pencil size={13} />
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(s._id)} style={{ padding: '6px 10px' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add/Edit Student Modal */}
        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
              <div className="confirm-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{editingStudent ? 'Edit Student Details' : 'Enroll Student'}</h3>
                <button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)} style={{ padding: '4px 8px' }}><X size={16} /></button>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Student Full Name</label>
                    <input required className="form-control" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Alex Johnson" />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Parent Mobile Number (Login ID)</label>
                    <input required className="form-control" value={formData.parentPhone} onChange={e => setFormData({ ...formData, parentPhone: e.target.value })} placeholder="e.g. +1234567890" />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Assigned Route</label>
                    <select className="form-control" value={formData.routeId} onChange={e => setFormData({ ...formData, routeId: e.target.value, stopId: '' })}>
                      <option value="">Select a route</option>
                      {routes.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                    </select>
                  </div>
                  {formData.routeId && (
                    <div className="form-group">
                      <label style={{ fontSize: '12px', fontWeight: 700 }}>Designated Pickup / Drop Stop</label>
                      <select className="form-control" value={formData.stopId} onChange={e => {
                        const st = stops.find(s => s._id === e.target.value || s.order?.toString() === e.target.value);
                        setFormData({ ...formData, stopId: e.target.value, pickupLocation: st?.name || '' });
                      }}>
                        <option value="">Select a stop</option>
                        {stops.map(st => <option key={st._id || st.order} value={st._id || st.order}>{st.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 700 }}>Custom Pickup Notes (optional)</label>
                    <input className="form-control" value={formData.pickupLocation} onChange={e => setFormData({ ...formData, pickupLocation: e.target.value })} placeholder="e.g. 5th Ave Corner" />
                  </div>
                </div>

                <div className="confirm-modal-actions" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1.5 }}>
                    {loading ? 'Saving...' : editingStudent ? 'Update Student' : 'Enroll Student'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={!!deleteConfirm}
          title="Delete Student Profile?"
          message="This action will permanently delete this student record and deactivate their boarding QR pass."
          confirmText="Delete Student"
          cancelText="Cancel"
          type="danger"
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      </div>
    </div>
  );
}

// ========================================================
// 6. LIVE FLEET VIEW
// ========================================================

function LiveFleetView() {
  const [fleet, setFleet] = useState([]);
  const [selectedBusId, setSelectedBusId] = useState(null);
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'active' | 'idle' | 'alerts'
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [emergencies, setEmergencies] = useState(new Map());

  const navigate = useNavigate();
  const toast = useToast();
  const mapRef = useRef(null);
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

  const loadFleet = useCallback(async () => {
    try {
      const res = await schoolAPI.getLiveFleet();
      setFleet(res.data || []);
      if (res.data?.length > 0 && !selectedBusId) {
        const firstActive = res.data.find(b => b.has_active_trip);
        if (firstActive) setSelectedBusId(firstActive.bus_id);
      }
    } catch (err) {
      console.error('Error loading live fleet:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedBusId]);

  useEffect(() => {
    connectSocket();
    let isMounted = true;

    const initFleet = async () => {
      try {
        const [fleetRes, infoRes] = await Promise.all([
          schoolAPI.getLiveFleet(),
          schoolAPI.getInfo().catch(() => null)
        ]);
        if (!isMounted) return;
        if (fleetRes?.data) {
          setFleet(fleetRes.data);
          const firstActive = fleetRes.data.find(b => b.has_active_trip);
          if (firstActive) setSelectedBusId(prev => prev || firstActive.bus_id);
        }
        if (infoRes?.data?._id) {
          joinSchoolFleet(infoRes.data._id);
        }
      } catch (err) {
        console.error('Error loading live fleet:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    initFleet();

    const unsubLocation = onFleetLocationUpdate((data) => {
      if (!isMounted || !data) return;
      setFleet(prev => prev.map(bus => {
        if (bus.bus_id === data.busId || bus.trip_id === data.tripId) {
          return {
            ...bus,
            has_active_trip: true,
            trip_id: data.tripId,
            trip_status: data.tripStatus || 'ON_THE_WAY',
            location: {
              latitude: data.lat,
              longitude: data.lng,
              speed: data.speed || 0,
              heading: data.heading || 0,
              last_location_at: data.timestamp
            },
            telemetry: {
              ...bus.telemetry,
              distance_traveled_km: data.distanceTraveledKm || bus.telemetry?.distance_traveled_km || 0,
              eta: data.eta || bus.telemetry?.eta || 'N/A',
              eta_minutes: data.etaMinutes,
              distance_to_next_km: data.distanceToNextStopKm,
              next_stop_name: data.nextStopName,
              current_stop_order: data.currentStopOrder,
              next_stop_order: data.nextStopOrder,
              is_deviated: data.isDeviated || false,
              signal_status: 'live'
            }
          };
        }
        return bus;
      }));
    });

    const unsubAlert = onFleetAlert((alertData) => {
      if (!isMounted || !alertData) return;
      toast.error(alertData.message || 'Fleet alert received');
    });

    const unsubEmergency = onEmergencyAlert((emergencyData) => {
      if (!isMounted || !emergencyData) return;
      setEmergencies(prev => {
        const next = new Map(prev);
        next.set(emergencyData.tripId, emergencyData);
        return next;
      });
      toast.error(`🚨 EMERGENCY: ${emergencyData.busNumber || 'Bus'} reported an emergency!`);
      loadFleet();
    });

    const unsubEmergencyAck = onEmergencyAcknowledged((data) => {
      if (!isMounted || !data) return;
      setEmergencies(prev => {
        const next = new Map(prev);
        next.delete(data.tripId);
        return next;
      });
      toast.success('Emergency alert acknowledged.');
      loadFleet();
    });

    const unsubTripStarted = onTripStarted(() => {
      if (!isMounted) return;
      loadFleet();
      toast.info('A bus has started a new trip.');
    });

    const unsubTripEnded = onTripEnded(() => {
      if (!isMounted) return;
      loadFleet();
    });

    const pollInterval = setInterval(loadFleet, 12000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      unsubLocation();
      unsubAlert();
      unsubEmergency();
      unsubEmergencyAck();
      unsubTripStarted();
      unsubTripEnded();
    };
  }, [loadFleet, toast]);

  const handleAcknowledgeEmergency = async (tripId) => {
    try {
      await tripAPI.acknowledgeSOS(tripId);
      toast.success('Emergency alert marked as acknowledged');
      loadFleet();
    } catch {
      toast.error('Failed to acknowledge emergency');
    }
  };

  const selectedBus = useMemo(() => {
    return fleet.find(b => b.bus_id === selectedBusId) || fleet[0];
  }, [fleet, selectedBusId]);

  const filteredFleet = useMemo(() => {
    return fleet.filter(b => {
      const matchesSearch = !searchQuery || 
        b.bus_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.driver?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.route?.name?.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (filterTab === 'active') return b.has_active_trip;
      if (filterTab === 'idle') return !b.has_active_trip;
      if (filterTab === 'alerts') return b.telemetry?.is_deviated || b.emergency?.is_active || emergencies.has(b.trip_id);
      return true;
    });
  }, [fleet, searchQuery, filterTab, emergencies]);

  const activeBusesWithLocation = useMemo(() => {
    return fleet.filter(b => b.has_active_trip && b.location && typeof b.location.latitude === 'number');
  }, [fleet]);

  const handleSelectBus = (bus) => {
    setSelectedBusId(bus.bus_id);
    if (mapRef.current && bus.location?.latitude && bus.location?.longitude) {
      mapRef.current.panTo({ lat: bus.location.latitude, lng: bus.location.longitude });
      mapRef.current.setZoom(15);
    }
  };

  const handleFitAllBuses = () => {
    if (!mapRef.current || activeBusesWithLocation.length === 0 || !window.google?.maps) return;
    const bounds = new window.google.maps.LatLngBounds();
    activeBusesWithLocation.forEach(b => {
      bounds.extend({ lat: b.location.latitude, lng: b.location.longitude });
    });
    mapRef.current.fitBounds(bounds);
  };

  const selectedRouteStops = useMemo(() => selectedBus?.route?.stops || [], [selectedBus?.route?.stops]);
  const selectedRoutePolyline = useMemo(() => {
    return selectedRouteStops
      .filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number')
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(s => ({ lat: s.latitude, lng: s.longitude }));
  }, [selectedRouteStops]);

  return (
    <div className="dashboard" style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <SchoolNav onLogout={() => { clearAuth(); navigate('/login'); }} />

      <div className="content" style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px 60px' }}>
        {loading && (
          <div style={{ marginBottom: '16px' }}>
            <Skeleton style={{ height: '380px', borderRadius: '16px' }} />
          </div>
        )}

        {/* Emergency Alert Banner */}
        {fleet.some(b => b.emergency?.is_active) && (
          <div
            style={{
              background: '#fef2f2',
              border: '2px solid #ef4444',
              borderRadius: '16px',
              padding: '16px 20px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)',
              animation: 'pulseLive 2s infinite'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertOctagon size={24} />
              </div>
              <div>
                <h4 style={{ color: '#991b1b', margin: 0, fontSize: '16px', fontWeight: 800 }}>EMERGENCY ALERT BROADCAST</h4>
                <p style={{ color: '#b91c1c', margin: '4px 0 0', fontSize: '13px' }}>
                  Active SOS triggered on {fleet.filter(b => b.emergency?.is_active).map(b => b.bus_number).join(', ')}.
                </p>
              </div>
            </div>

            {fleet.filter(b => b.emergency?.is_active).map(b => (
              <button
                key={b.bus_id}
                className="btn btn-danger btn-sm"
                onClick={() => handleAcknowledgeEmergency(b.trip_id)}
                style={{ padding: '8px 16px', fontWeight: 700 }}
              >
                Acknowledge SOS ({b.bus_number})
              </button>
            ))}
          </div>
        )}

        {/* Live Fleet Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#0f172a' }}>Real-Time Fleet Console</h2>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
              Live GPS coordinates, driver telemetry, corridor progression, and instant dispatch monitoring
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#dcfce7', color: '#16a34a', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 700 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
              {activeBusesWithLocation.length} Moving Live
            </span>
            <button className="btn btn-outline btn-sm" onClick={loadFleet} title="Refresh Fleet Data">
              <RotateCcw size={14} /> Refresh
            </button>
          </div>
        </div>

        {/* Fleet Grid Layout: Sidebar + Map */}
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', alignItems: 'start' }}>
          {/* Sidebar */}
          <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px', height: '700px', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
              {[
                { id: 'all', label: `All (${fleet.length})` },
                { id: 'active', label: `Active (${activeBusesWithLocation.length})` },
                { id: 'idle', label: `Idle (${fleet.length - activeBusesWithLocation.length})` },
                { id: 'alerts', label: 'Alerts' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id)}
                  style={{
                    background: filterTab === tab.id ? '#2563eb' : 'transparent',
                    color: filterTab === tab.id ? '#ffffff' : '#64748b',
                    border: 'none',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="Search bus, driver, route..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="form-control"
                style={{ paddingLeft: '34px', fontSize: '13px' }}
              />
              <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
            </div>

            {/* Bus Cards List */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredFleet.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: '#94a3b8', fontSize: '13px' }}>
                  No buses match the filter
                </div>
              ) : (
                filteredFleet.map(bus => {
                  const isSelected = bus.bus_id === selectedBusId;
                  const isLive = bus.has_active_trip;
                  const isEmerg = bus.emergency?.is_active;
                  const isDev = bus.telemetry?.is_deviated;

                  return (
                    <div
                      key={bus.bus_id}
                      onClick={() => handleSelectBus(bus)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: isSelected ? '2px solid #2563eb' : isEmerg ? '1.5px solid #ef4444' : '1px solid #e2e8f0',
                        background: isSelected ? '#eff6ff' : isEmerg ? '#fef2f2' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '18px' }}>🚌</span>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>
                              {bus.bus_number}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              {bus.license_plate || 'Fleet Bus'}
                            </div>
                          </div>
                        </div>

                        <StatusBadge
                          status={isEmerg ? 'EMERGENCY' : isDev ? 'DELAYED' : isLive ? 'LIVE' : 'IDLE'}
                          text={isEmerg ? '🚨 SOS' : isDev ? '⚠️ Off Route' : isLive ? 'Live' : 'Idle'}
                          size="sm"
                        />
                      </div>

                      <div style={{ fontSize: '12px', color: '#475569', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div>Driver: <strong>{bus.driver?.name || 'Unassigned'}</strong></div>
                        <div>Route: <strong>{bus.route?.name || 'Unassigned'}</strong></div>
                        {isLive && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2563eb', fontWeight: 700, marginTop: '4px' }}>
                            <span>ETA: {bus.telemetry?.eta || '~5 min'}</span>
                            <span>{bus.location?.speed || 0} km/h</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Main Map & Live Telemetry Inspector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Map Container */}
            <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', height: '460px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
              {/* Map Floating Controls */}
              <div
                style={{
                  position: 'absolute', top: 12, left: 12, zIndex: 10,
                  background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)',
                  padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)', color: '#0f172a'
                }}
              >
                <MapPin size={14} style={{ display: 'inline', marginRight: 6, color: '#2563eb' }} />
                Active Fleet Map ({activeBusesWithLocation.length} Active)
              </div>

              <button
                onClick={handleFitAllBuses}
                style={{
                  position: 'absolute', bottom: 16, right: 16, zIndex: 10,
                  background: '#2563eb', color: '#fff', border: 'none',
                  padding: '8px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                  cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <Compass size={14} /> Center Fleet
              </button>

              {isLoaded ? (
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={selectedBus?.location ? { lat: selectedBus.location.latitude, lng: selectedBus.location.longitude } : defaultCenter}
                  zoom={14}
                  options={mapOptions}
                  onLoad={(map) => { mapRef.current = map; }}
                >
                  {/* Selected Bus Route Polyline */}
                  {selectedRoutePolyline.length > 1 && (
                    <Polyline
                      path={selectedRoutePolyline}
                      options={{
                        strokeColor: '#2563eb',
                        strokeOpacity: 0.85,
                        strokeWeight: 4
                      }}
                    />
                  )}

                  {/* Route Stops for selected bus */}
                  {selectedRouteStops.map((stop, idx) => {
                    if (typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number') return null;
                    return (
                      <Marker
                        key={stop._id || idx}
                        position={{ lat: stop.latitude, lng: stop.longitude }}
                        title={`${stop.order}. ${stop.name}`}
                        icon={{
                          path: window.google.maps.SymbolPath.CIRCLE,
                          scale: 6,
                          fillColor: '#2563eb',
                          fillOpacity: 1,
                          strokeWeight: 2,
                          strokeColor: '#ffffff'
                        }}
                      />
                    );
                  })}

                  {/* Multi-Bus Markers */}
                  {activeBusesWithLocation.map(bus => (
                    <Marker
                      key={bus.bus_id}
                      position={{ lat: bus.location.latitude, lng: bus.location.longitude }}
                      icon={createFleetBusIcon(
                        bus.location.heading || 0,
                        bus.emergency?.is_active,
                        bus.has_active_trip
                      )}
                      onClick={() => handleSelectBus(bus)}
                    />
                  ))}
                </GoogleMap>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                  <div className="spinner"></div>
                </div>
              )}
            </div>

            {/* Selected Bus Telemetry Card */}
            {selectedBus && (
              <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '22px' }}>🚌</span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{selectedBus.bus_number} Telemetry & Transit</h3>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        Plate: {selectedBus.license_plate || 'N/A'} · Route: {selectedBus.route?.name || 'Unassigned'}
                      </span>
                    </div>
                  </div>

                  <StatusBadge
                    status={selectedBus.has_active_trip ? 'LIVE' : 'IDLE'}
                    text={selectedBus.has_active_trip ? '● ACTIVE TRIP' : '○ IDLE IN DEPOT'}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Assigned Driver</div>
                    <div style={{ fontWeight: 800, fontSize: '14px', marginTop: '2px', color: '#0f172a' }}>{selectedBus.driver?.name || '—'}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{selectedBus.driver?.phone || 'No phone'}</div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Current Speed</div>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#2563eb', marginTop: '2px' }}>
                      {selectedBus.location?.speed || 0} km/h
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Max: {selectedBus.telemetry?.max_speed || 0} km/h</div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Estimated Arrival</div>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#16a34a', marginTop: '2px' }}>
                      {selectedBus.telemetry?.eta || 'N/A'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Dist: {selectedBus.telemetry?.distance_to_next_km ? `~${selectedBus.telemetry.distance_to_next_km} km` : '—'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Next Scheduled Stop</div>
                    <div style={{ fontWeight: 800, fontSize: '14px', marginTop: '2px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {selectedBus.telemetry?.next_stop_name || 'Destination'}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: selectedBus.telemetry?.is_deviated ? '#ef4444' : '#16a34a' }}>
                      {selectedBus.telemetry?.is_deviated ? '⚠️ Route Deviated' : '✓ On Corridor'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================================================
// 7. TRIP HISTORY & REPLAY VIEW
// ========================================================

function TripHistoryView() {
  const [trips, setTrips] = useState([]);
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [filters, setFilters] = useState({ busId: '', driverId: '', routeId: '', startDate: '', endDate: '' });
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [replayModalTrip, setReplayModalTrip] = useState(null);
  const [attendanceModalTrip, setAttendanceModalTrip] = useState(null);

  const navigate = useNavigate();
  const toast = useToast();

  const loadTrips = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await schoolAPI.getTripHistory({ ...filters, page, limit: 15 });
      setTrips(res.data.trips || []);
      setPagination(res.data.pagination || { page: 1, limit: 15, total: 0, pages: 1 });
    } catch {
      toast.error('Failed to load trip history');
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    let isMounted = true;
    const fetchOptions = async () => {
      try {
        const [busRes, driverRes, routeRes] = await Promise.all([
          schoolAPI.getBuses(),
          schoolAPI.getDrivers(),
          schoolAPI.getRoutes()
        ]);
        if (!isMounted) return;
        setBuses(busRes.data || []);
        setDrivers(driverRes.data || []);
        setRoutes(routeRes.data || []);
      } catch { /* ignore */ }
    };
    fetchOptions();
    setTimeout(() => { if (isMounted) loadTrips(1); }, 0);
    return () => { isMounted = false; };
  }, [loadTrips]);

  const handleFilterChange = (field, val) => {
    setFilters(prev => ({ ...prev, [field]: val }));
  };

  return (
    <div className="dashboard" style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <SchoolNav onLogout={() => { clearAuth(); navigate('/login'); }} />

      <div className="content" style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#0f172a' }}>Trip History & Audit Logs</h2>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
              Complete historical trip records, GPS breadcrumb playback, and student boarding rosters
            </p>
          </div>
        </div>

        {/* Filter Bar */}
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Filter Bus</label>
              <select className="form-control" value={filters.busId} onChange={e => handleFilterChange('busId', e.target.value)}>
                <option value="">All Buses</option>
                {buses.map(b => <option key={b._id} value={b._id}>{b.bus_number}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Filter Driver</label>
              <select className="form-control" value={filters.driverId} onChange={e => handleFilterChange('driverId', e.target.value)}>
                <option value="">All Drivers</option>
                {drivers.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Filter Route</label>
              <select className="form-control" value={filters.routeId} onChange={e => handleFilterChange('routeId', e.target.value)}>
                <option value="">All Routes</option>
                {routes.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Start Date</label>
              <input type="date" className="form-control" value={filters.startDate} onChange={e => handleFilterChange('startDate', e.target.value)} />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>End Date</label>
              <input type="date" className="form-control" value={filters.endDate} onChange={e => handleFilterChange('endDate', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Trips Table */}
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <div className="spinner spinner-dark" style={{ margin: '0 auto 12px' }}></div>
              <p style={{ color: '#64748b', fontSize: '13px' }}>Retrieving trip archives...</p>
            </div>
          ) : trips.length === 0 ? (
            <EmptyState
              title="No Trip Records Found"
              description="No trips match your selected date or vehicle filters."
              icon={History}
            />
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700 }}>
                    <th style={{ padding: '14px 18px' }}>Date & Time</th>
                    <th style={{ padding: '14px 18px' }}>Bus</th>
                    <th style={{ padding: '14px 18px' }}>Driver</th>
                    <th style={{ padding: '14px 18px' }}>Route</th>
                    <th style={{ padding: '14px 18px' }}>Distance</th>
                    <th style={{ padding: '14px 18px' }}>Boarded</th>
                    <th style={{ padding: '14px 18px' }}>Status</th>
                    <th style={{ padding: '14px 18px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map(trip => (
                    <tr key={trip._id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                      <td style={{ padding: '14px 18px', color: '#0f172a', fontWeight: 600 }}>
                        {new Date(trip.started_at).toLocaleString([], {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0f172a' }}>
                        🚌 {trip.bus_id?.bus_number || 'N/A'}
                      </td>
                      <td style={{ padding: '14px 18px', color: '#475569' }}>
                        {trip.driver_id?.name || 'N/A'}
                      </td>
                      <td style={{ padding: '14px 18px', color: '#475569' }}>
                        {trip.route_id?.name || 'Standard Route'}
                      </td>
                      <td style={{ padding: '14px 18px', color: '#475569', fontWeight: 600 }}>
                        {trip.total_distance_km ? `${trip.total_distance_km.toFixed(1)} km` : '—'}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                          {trip.check_ins?.length || 0} students
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <StatusBadge
                          status={trip.status === 'COMPLETED' ? 'COMPLETED' : trip.status === 'IN_PROGRESS' ? 'LIVE' : 'ACTIVE'}
                          text={trip.status}
                          size="sm"
                        />
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => setReplayModalTrip(trip)}
                            title="Watch GPS Breadcrumb Replay"
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px' }}
                          >
                            <Play size={13} /> Replay
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => setAttendanceModalTrip(trip)}
                            title="View Student Roster"
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px' }}
                          >
                            <Users size={13} /> Roster
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
              <button
                className="btn btn-outline btn-sm"
                disabled={pagination.page <= 1}
                onClick={() => loadTrips(pagination.page - 1)}
              >
                Previous
              </button>
              <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', padding: '0 8px', color: '#64748b' }}>
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                className="btn btn-outline btn-sm"
                disabled={pagination.page >= pagination.pages}
                onClick={() => loadTrips(pagination.page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Modals for Replay and Attendance */}
        {replayModalTrip && (
          <GPSReplayModal
            trip={replayModalTrip}
            onClose={() => setReplayModalTrip(null)}
          />
        )}

        {attendanceModalTrip && (
          <AttendanceModal
            trip={attendanceModalTrip}
            onClose={() => setAttendanceModalTrip(null)}
          />
        )}
      </div>
    </div>
  );
}

// ========================================================
// 8. GPS REPLAY MODAL
// ========================================================

function GPSReplayModal({ trip, onClose }) {
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [loading, setLoading] = useState(true);

  const mapRef = useRef(null);
  const intervalRef = useRef(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

  useEffect(() => {
    let isMounted = true;
    const fetchBreadcrumbs = async () => {
      try {
        const res = await tripAPI.getBreadcrumbs(trip._id);
        if (isMounted) {
          const list = res.data || [];
          setBreadcrumbs(list);
          setLoading(false);
          if (list.length > 0) setCurrentIndex(0);
        }
      } catch (err) {
        console.error('Error fetching breadcrumbs:', err);
        if (isMounted) setLoading(false);
      }
    };
    fetchBreadcrumbs();
    return () => { isMounted = false; };
  }, [trip._id]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= breadcrumbs.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / playbackSpeed);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, playbackSpeed, breadcrumbs.length]);

  const currentPoint = breadcrumbs[currentIndex] || breadcrumbs[0];
  const polylinePath = useMemo(() => {
    return breadcrumbs.slice(0, currentIndex + 1).map(p => ({ lat: p.lat, lng: p.lng }));
  }, [breadcrumbs, currentIndex]);

  const fullPolylinePath = useMemo(() => {
    return breadcrumbs.map(p => ({ lat: p.lat, lng: p.lng }));
  }, [breadcrumbs]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 840, width: '95%', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
              GPS Trip Replay · Bus {trip.bus_id?.bus_number || 'Bus'}
            </h3>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              {new Date(trip.started_at).toLocaleDateString()} · Driver: {trip.driver_id?.name || 'Driver'}
            </span>
          </div>
          <button className="btn btn-outline btn-sm" onClick={onClose} style={{ padding: '6px 10px' }}><X size={16} /></button>
        </div>

        {/* Map View */}
        <div style={{ height: '360px', borderRadius: '14px', overflow: 'hidden', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '8px' }}>
              <span className="spinner" style={{ width: 24, height: 24 }} />
              <span style={{ fontSize: '13px', color: '#64748b' }}>Loading GPS breadcrumbs...</span>
            </div>
          ) : isLoaded && currentPoint ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={{ lat: currentPoint.lat, lng: currentPoint.lng }}
              zoom={15}
              options={mapOptions}
              onLoad={map => { mapRef.current = map; }}
            >
              {fullPolylinePath.length > 1 && (
                <Polyline
                  path={fullPolylinePath}
                  options={{ strokeColor: '#cbd5e1', strokeOpacity: 0.6, strokeWeight: 3 }}
                />
              )}
              {polylinePath.length > 1 && (
                <Polyline
                  path={polylinePath}
                  options={{ strokeColor: '#2563eb', strokeOpacity: 0.9, strokeWeight: 4 }}
                />
              )}
              <Marker
                position={{ lat: currentPoint.lat, lng: currentPoint.lng }}
                icon={createFleetBusIcon(currentPoint.heading || 0, false, true)}
              />
            </GoogleMap>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
              <div className="spinner"></div>
            </div>
          )}
        </div>

        {/* Playback Controls & Scrubber */}
        <div style={{ background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
            <button
              className="btn btn-primary"
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={breadcrumbs.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>

            <button
              className="btn btn-outline btn-sm"
              onClick={() => { setCurrentIndex(0); setIsPlaying(false); }}
              disabled={breadcrumbs.length === 0}
            >
              <RotateCcw size={14} /> Reset
            </button>

            <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
              {[1, 2, 5].map(s => (
                <button
                  key={s}
                  onClick={() => setPlaybackSpeed(s)}
                  className={`btn btn-sm ${playbackSpeed === s ? 'btn-primary' : 'btn-outline'}`}
                  style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700 }}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Timeline Slider */}
          <input
            type="range"
            min={0}
            max={Math.max(0, breadcrumbs.length - 1)}
            value={currentIndex}
            onChange={e => setCurrentIndex(Number(e.target.value))}
            style={{ width: '100%', cursor: 'pointer' }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
            <span>Telemetry Point: <strong>{currentIndex + 1}</strong> / {breadcrumbs.length}</span>
            {currentPoint && (
              <span>Speed: <strong>{currentPoint.speed || 0} km/h</strong> · Time: <strong>{new Date(currentPoint.timestamp).toLocaleTimeString()}</strong></span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================================================
// 9. ATTENDANCE ROSTER MODAL
// ========================================================

function AttendanceModal({ trip, onClose }) {
  const checkIns = trip.check_ins || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '95%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
              Student Boarding Roster ({checkIns.length})
            </h3>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Bus {trip.bus_id?.bus_number} · {new Date(trip.started_at).toLocaleDateString()}
            </span>
          </div>
          <button className="btn btn-outline btn-sm" onClick={onClose} style={{ padding: '6px 10px' }}><X size={16} /></button>
        </div>

        {checkIns.length === 0 ? (
          <EmptyState
            title="No Check-ins Recorded"
            description="No students were scanned onto this trip."
            icon={Users}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto' }}>
            {checkIns.map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px' }}>
                    {item.student_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>{item.student_name}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Stop: {item.pickup_location || 'Designated Stop'}</div>
                  </div>
                </div>

                <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569', background: '#e2e8f0', padding: '2px 8px', borderRadius: '6px' }}>
                  {new Date(item.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================================
// 10. FLEET INSIGHTS & ANALYTICS VIEW
// ========================================================

function FleetAnalyticsView() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    const fetchAnalytics = async () => {
      try {
        const res = await schoolAPI.getFleetAnalytics();
        if (isMounted) {
          setAnalytics(res.data);
          setLoading(false);
        }
      } catch (err) {
        console.error('Analytics fetch error:', err);
        if (isMounted) setLoading(false);
      }
    };
    fetchAnalytics();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="dashboard" style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <SchoolNav onLogout={() => { clearAuth(); navigate('/login'); }} />

      <div className="content" style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 20px 60px' }}>
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <Skeleton style={{ height: '120px', borderRadius: '14px' }} />
            <Skeleton style={{ height: '120px', borderRadius: '14px' }} />
            <Skeleton style={{ height: '120px', borderRadius: '14px' }} />
            <Skeleton style={{ height: '120px', borderRadius: '14px' }} />
          </div>
        )}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#0f172a' }}>Fleet Safety & Operational Insights</h2>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
            Driver safety scorecards, route efficiency ratings, on-time performance, and transit metrics
          </p>
        </div>

        {/* 4 Analytics KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <StatCard
            title="Fleet Safety Score"
            value={analytics?.fleet_safety_score ? `${analytics.fleet_safety_score}/100` : '94/100'}
            icon={Shield}
            color="success"
            trend="Excellent Rating"
            trendType="positive"
          />
          <StatCard
            title="On-Time Delivery"
            value={analytics?.on_time_rate ? `${analytics.on_time_rate}%` : '96.8%'}
            icon={Clock}
            color="primary"
            trend="+2.4% this month"
            trendType="positive"
          />
          <StatCard
            title="Total Mileage Tracked"
            value={analytics?.total_km_logged ? `${Math.round(analytics.total_km_logged)} km` : '1,420 km'}
            icon={Gauge}
            color="warning"
            trend="Monitored fleet"
            trendType="neutral"
          />
          <StatCard
            title="Avg Check-in Rate"
            value={analytics?.boarding_efficiency ? `${analytics.boarding_efficiency}%` : '98.2%'}
            icon={CheckCircle2}
            color="success"
            trend="High QR adoption"
            trendType="positive"
          />
        </div>

        {/* Driver Safety Leaderboard */}
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Award size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>Driver Safety Leaderboard</h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Ranked by smooth acceleration, adherence to speed limits, and route compliance</span>
            </div>
          </div>

          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700 }}>
                  <th style={{ padding: '14px 18px' }}>Rank & Driver</th>
                  <th style={{ padding: '14px 18px' }}>Trips Completed</th>
                  <th style={{ padding: '14px 18px' }}>Speed Compliance</th>
                  <th style={{ padding: '14px 18px' }}>Safety Score</th>
                  <th style={{ padding: '14px 18px', textAlign: 'right' }}>Performance Status</th>
                </tr>
              </thead>
              <tbody>
                {(analytics?.driver_scores || [
                  { rank: 1, name: 'Robert Fox', trips: 48, compliance: '99%', score: 98, status: 'EXCELLENT' },
                  { rank: 2, name: 'Cody Fisher', trips: 42, compliance: '97%', score: 95, status: 'EXCELLENT' },
                  { rank: 3, name: 'Esther Howard', trips: 36, compliance: '95%', score: 92, status: 'GOOD' }
                ]).map((d, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: i === 0 ? '#fef08a' : i === 1 ? '#e2e8f0' : '#fed7aa', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>
                          #{d.rank || i + 1}
                        </span>
                        <span>{d.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px', color: '#475569' }}>{d.trips} trips</td>
                    <td style={{ padding: '14px 18px', color: '#16a34a', fontWeight: 700 }}>{d.compliance}</td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ background: '#dcfce7', color: '#16a34a', padding: '3px 10px', borderRadius: '8px', fontWeight: 800 }}>
                        {d.score}/100
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <StatusBadge status="ACTIVE" text={d.status || 'EXCELLENT'} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================================================
// ROOT ROUTER COMPONENT
// ========================================================

function SchoolDashboard() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/drivers" element={<Drivers />} />
      <Route path="/buses" element={<Buses />} />
      <Route path="/routes" element={<Routes_ />} />
      <Route path="/students" element={<Students />} />
      <Route path="/fleet" element={<LiveFleetView />} />
      <Route path="/trips" element={<TripHistoryView />} />
      <Route path="/analytics" element={<FleetAnalyticsView />} />
    </Routes>
  );
}

export default SchoolDashboard;
