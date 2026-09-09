import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, Link, Routes, Route, useLocation } from 'react-router-dom';
import { 
  Bus, GraduationCap, Users, Route as RouteIcon, Plus, Pencil, Trash2, 
  Search, X, AlertTriangle, MapPin, Compass, Play, Pause, RotateCcw, 
  TrendingUp, Clock, Shield, CheckCircle2, AlertOctagon, Activity, 
  ChevronRight, Calendar, Filter, Phone, Gauge, Navigation, Eye, Check
} from 'lucide-react';
import { GoogleMap, useJsApiLoader, Marker, Polyline, InfoWindow } from '@react-google-maps/api';
import { schoolAPI, tripAPI } from '../api';
import { clearAuth } from '../auth';
import { useToast } from '../App';
import { 
  connectSocket, joinSchoolFleet, onFleetLocationUpdate, onFleetAlert, 
  onEmergencyAlert, onEmergencyAcknowledged, onTripStarted, onTripEnded 
} from '../socket';
import gsap from 'gsap';

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

  return (
    <nav className="dashboard-nav" style={{ position: 'sticky', top: 0, zIndex: 100 }}>
      <div className="nav-section nav-left" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Link to="/school-dashboard" className={path === '/school-dashboard' || path === '/school-dashboard/' ? 'active' : ''}>Overview</Link>
        <Link to="/school-dashboard/fleet" className={path.includes('/fleet') ? 'active' : ''}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
            Live Fleet
          </span>
        </Link>
        <Link to="/school-dashboard/trips" className={path.includes('/trips') ? 'active' : ''}>Trip History</Link>
        <Link to="/school-dashboard/analytics" className={path.includes('/analytics') ? 'active' : ''}>Insights</Link>
        <Link to="/school-dashboard/drivers" className={path.includes('/drivers') ? 'active' : ''}>Drivers</Link>
        <Link to="/school-dashboard/buses" className={path.includes('/buses') ? 'active' : ''}>Buses</Link>
        <Link to="/school-dashboard/routes" className={path.includes('/routes') ? 'active' : ''}>Routes</Link>
        <Link to="/school-dashboard/students" className={path.includes('/students') ? 'active' : ''}>Students</Link>
      </div>
      <div className="nav-section nav-center">
        <h2>School Dashboard</h2>
      </div>
      <div className="nav-section nav-right">
        <button onClick={onLogout} className="logout-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Logout
        </button>
      </div>
    </nav>
  );
}

function Dashboard() {
  const [stats, setStats] = useState({ driverCount: 0, busCount: 0, routeCount: 0, studentCount: 0 });
  const [info, setInfo] = useState({});
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const navigate = useNavigate();
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
        setTrips(tripsRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    init();
    if (statsRef.current) {
      gsap.fromTo(statsRef.current.children,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.08, delay: 0.15, ease: 'power2.out' }
      );
    }
    return () => { isMounted = false; };
  }, []);

  const handleLogout = () => setShowLogoutConfirm(true);
  const confirmLogout = () => { clearAuth(); navigate('/login'); };

  return (
    <div className="dashboard">
      <SchoolNav onLogout={handleLogout} />


        {showLogoutConfirm && (
          <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="confirm-modal-header">
                <div className="confirm-icon danger"><AlertTriangle size={24} /></div>
                <h3>Confirm Logout</h3>
                <p>Are you sure you want to logout?</p>
              </div>
              <div className="confirm-modal-actions">
                <button className="cancel-btn" onClick={() => setShowLogoutConfirm(false)}>Cancel</button>
                <button className="confirm-btn" onClick={confirmLogout}>Logout</button>
              </div>
            </div>
          </div>
        )}

        <div className="dashboard-content">
          {loading ? (
            <div className="stats">
              {[1,2,3,4].map(i => (
                <div key={i} className="stat-card" style={{ padding: '28px' }}>
                  <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 'var(--radius)', marginBottom: 16 }}></div>
                  <div className="skeleton skeleton-text"></div>
                  <div className="skeleton skeleton-text short"></div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="stats" ref={statsRef}>
                {[
                  { icon: Users, count: stats.driverCount, label: 'Drivers' },
                  { icon: Bus, count: stats.busCount, label: 'Buses' },
                  { icon: RouteIcon, count: stats.routeCount, label: 'Routes' },
                  { icon: GraduationCap, count: stats.studentCount, label: 'Students' },
                ].map(({ icon: Icon, count, label }, i) => (
                  <div key={i} className="stat-card">
                    <div className="stat-icon"><Icon size={22} /></div>
                    <h3>{count}</h3>
                    <p>{label}</p>
                  </div>
                ))}
              </div>

              <div className="school-info-card">
                <div>
                  <h3>{info.name || 'Your School'}</h3>
                  <div className="school-code">
                    Code: {info.school_code || 'N/A'}
                  </div>
                </div>
                <div className="school-meta">
                  <span>{info.email || ''}</span>
                  <span>{info.phone || ''}</span>
                </div>
              </div>

              <div className="section-card">
                <h3><Bus size={18} /> Active Trips</h3>
                {trips.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon"><Bus size={40} /></div>
                    <h4>No Active Trips</h4>
                    <p>There are no bus trips in progress right now.</p>
                  </div>
                ) : (
                  <div className="trip-list">
                    {trips.map(trip => (
                      <div key={trip._id} className="trip-item">
                        <div>
                          <span className="trip-bus">Bus {trip.bus_number}</span>
                          <span className="trip-detail" style={{ marginLeft: 12 }}>Driver: {trip.driver_name}</span>
                        </div>
                        <div className="trip-detail">
                          {trip.route_name || 'Unknown route'} · {trip.check_in_count || 0} boarded
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

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
        setDrivers(res.data);
      } catch { toast.error('Failed to load drivers'); }
    }, [toast]);

    useEffect(() => {
      let isMounted = true;
      const fetchDrivers = async () => {
        try {
          const res = await schoolAPI.getDrivers();
          if (isMounted) setDrivers(res.data);
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
      <div className="dashboard">
        <nav className="dashboard-nav" style={{ position: 'sticky', top: 0 }}>
          <div className="nav-section nav-left">
            <button onClick={() => navigate('/school-dashboard')} className="back-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
          </div>
          <div className="nav-section nav-center">
            <h2>Drivers</h2>
          </div>
          <div className="nav-section nav-right"></div>
        </nav>
        <div className="content">
          <div className="table-container">
            <div className="table-toolbar">
              <h3>All Drivers ({drivers.length})</h3>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="table-search">
                  <span className="search-icon"><Search size={14} /></span>
                  <input placeholder="Search drivers..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <button className="btn btn-primary btn-sm" onClick={openAdd}>
                  <Plus size={14} /> Add Driver
                </button>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>License</th>
                  <th style={{ width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>No drivers found</td></tr>
                ) : filtered.map(d => (
                  <tr key={d._id}>
                    <td style={{ fontWeight: 600, color: 'var(--secondary)' }}>{d.name}</td>
                    <td>{d.email}</td>
                    <td>{d.phone || '—'}</td>
                    <td>
                      {d.license_number ?
                        <span className="badge badge-info">{d.license_number}</span> :
                        <span style={{ color: 'var(--gray-300)' }}>—</span>
                      }
                    </td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-sm btn-outline" onClick={() => openEdit(d)}><Pencil size={13} /></button>
                        <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(d._id)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showForm && (
          <div className="form-overlay" onClick={() => setShowForm(false)}>
            <div className="form-modal" onClick={e => e.stopPropagation()}>
              <div className="form-modal-header">
                <h3>{editingDriver ? 'Edit Driver' : 'Add Driver'}</h3>
                <button className="close-btn" onClick={() => setShowForm(false)}><X size={16} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-modal-body">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input type="text" placeholder="e.g. John Smith" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" placeholder="driver@school.edu" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input type="tel" placeholder="+1 (555) 000-0000" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>License Number</label>
                    <input type="text" placeholder="e.g. DL-123456" value={formData.licenseNumber} onChange={e => setFormData({...formData, licenseNumber: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Password {editingDriver && <span style={{ fontWeight: 400, color: 'var(--gray-400)', fontSize: 12 }}>(leave blank to keep current)</span>}</label>
                    <input type="password" placeholder={editingDriver ? 'Leave blank to keep current' : 'Create password'} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required={!editingDriver} />
                  </div>
                  <div className="form-actions">
                    <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? <><span className="spinner"></span> Saving...</> : (editingDriver ? 'Update Driver' : 'Add Driver')}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="confirm-modal-header">
                <div className="confirm-icon danger"><AlertTriangle size={24} /></div>
                <h3>Delete Driver?</h3>
                <p>This action cannot be undone. The driver will lose access to the system.</p>
              </div>
              <div className="confirm-modal-actions">
                <button className="cancel-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                <button className="confirm-btn" onClick={() => handleDelete(deleteConfirm)}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

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
        setBuses(busesRes.data);
        setDrivers(driversRes.data);
        setRoutes(routesRes.data);
      } catch { toast.error('Failed to load data'); }
    }, [toast]);

    useEffect(() => {
      let isMounted = true;
      const fetchBuses = async () => {
        try {
          const [busesRes, driversRes, routesRes] = await Promise.all([schoolAPI.getBuses(), schoolAPI.getDrivers(), schoolAPI.getRoutes()]);
          if (isMounted) {
            setBuses(busesRes.data);
            setDrivers(driversRes.data);
            setRoutes(routesRes.data);
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
      setFormData({ busNumber: bus.bus_number, licensePlate: bus.license_plate, model: bus.model, capacity: bus.capacity, driverId: bus.driver_id || '', routeId: bus.route_id || '' });
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
      <div className="dashboard">
        <nav className="dashboard-nav" style={{ position: 'sticky', top: 0 }}>
          <div className="nav-section nav-left">
            <button onClick={() => navigate('/school-dashboard')} className="back-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
          </div>
          <div className="nav-section nav-center"><h2>Buses</h2></div>
          <div className="nav-section nav-right"></div>
        </nav>
        <div className="content">
          <div className="table-container">
            <div className="table-toolbar">
              <h3>All Buses ({buses.length})</h3>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="table-search">
                  <span className="search-icon"><Search size={14} /></span>
                  <input placeholder="Search buses..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={14} /> Add Bus</button>
              </div>
            </div>
            <table>
              <thead>
                <tr><th>Bus #</th><th>License Plate</th><th>Model</th><th>Capacity</th><th>Driver</th><th>Route</th><th style={{ width: 100 }}>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>No buses found</td></tr>
                ) : filtered.map(b => (
                  <tr key={b._id}>
                    <td style={{ fontWeight: 600, color: 'var(--secondary)' }}>{b.bus_number}</td>
                    <td>{b.license_plate}</td>
                    <td>{b.model || '—'}</td>
                    <td><span className="badge badge-info">{b.capacity} seats</span></td>
                    <td>{b.driver_name || <span style={{ color: 'var(--gray-300)' }}>Unassigned</span>}</td>
                    <td>{b.route_name || <span style={{ color: 'var(--gray-300)' }}>Unassigned</span>}</td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-sm btn-outline" onClick={() => openEdit(b)}><Pencil size={13} /></button>
                        <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(b._id)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showForm && (
          <div className="form-overlay" onClick={() => setShowForm(false)}>
            <div className="form-modal" onClick={e => e.stopPropagation()}>
              <div className="form-modal-header">
                <h3>{editingBus ? 'Edit Bus' : 'Add Bus'}</h3>
                <button className="close-btn" onClick={() => setShowForm(false)}><X size={16} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-modal-body">
                  <div className="form-group"><label>Bus Number</label><input type="text" placeholder="e.g. BUS-001" value={formData.busNumber} onChange={e => setFormData({...formData, busNumber: e.target.value})} required /></div>
                  <div className="form-group"><label>License Plate</label><input type="text" placeholder="e.g. ABC 1234" value={formData.licensePlate} onChange={e => setFormData({...formData, licensePlate: e.target.value})} required /></div>
                  <div className="form-group"><label>Model</label><input type="text" placeholder="e.g. Bluebird Vision" value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} /></div>
                  <div className="form-group"><label>Capacity</label><input type="number" value={formData.capacity} onChange={e => setFormData({...formData, capacity: e.target.value})} /></div>
                  <div className="form-group">
                    <label>Assigned Driver</label>
                    <select value={formData.driverId} onChange={e => setFormData({...formData, driverId: e.target.value})}>
                      <option value="">— No driver —</option>
                      {drivers.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Assigned Route</label>
                    <select value={formData.routeId} onChange={e => setFormData({...formData, routeId: e.target.value})}>
                      <option value="">— No route —</option>
                      {routes.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="form-actions">
                    <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? <><span className="spinner"></span> Saving...</> : (editingBus ? 'Update Bus' : 'Add Bus')}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="confirm-modal-header">
                <div className="confirm-icon danger"><AlertTriangle size={24} /></div>
                <h3>Delete Bus?</h3>
                <p>This will permanently remove this bus from the system.</p>
              </div>
              <div className="confirm-modal-actions">
                <button className="cancel-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                <button className="confirm-btn" onClick={() => handleDelete(deleteConfirm)}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

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
        setRoutes(res.data);
      } catch { toast.error('Failed to load routes'); }
    }, [toast]);

    useEffect(() => {
      let isMounted = true;
      const fetchRoutes = async () => {
        try {
          const res = await schoolAPI.getRoutes();
          if (isMounted) setRoutes(res.data);
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
      setFormData({ name: route.name, startLocation: route.start_location, endLocation: route.end_location, estimatedTime: route.estimated_time, stops: route.stops || [] });
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
      <div className="dashboard">
        <nav className="dashboard-nav" style={{ position: 'sticky', top: 0 }}>
          <div className="nav-section nav-left">
            <button onClick={() => navigate('/school-dashboard')} className="back-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
          </div>
          <div className="nav-section nav-center"><h2>Routes</h2></div>
          <div className="nav-section nav-right"></div>
        </nav>
        <div className="content">
          <div className="table-container">
            <div className="table-toolbar">
              <h3>All Routes ({routes.length})</h3>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="table-search">
                  <span className="search-icon"><Search size={14} /></span>
                  <input placeholder="Search routes..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={14} /> Add Route</button>
              </div>
            </div>
            <table>
              <thead>
                <tr><th>Name</th><th>Start</th><th>End</th><th>Est. Time</th><th>Stops</th><th style={{ width: 100 }}>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>No routes found</td></tr>
                ) : filtered.map(r => (
                  <tr key={r._id}>
                    <td style={{ fontWeight: 600, color: 'var(--secondary)' }}>{r.name}</td>
                    <td>{r.start_location || '—'}</td>
                    <td>{r.end_location || '—'}</td>
                    <td>{r.estimated_time || '—'}</td>
                    <td><span className="badge badge-info">{r.stops?.length || 0} stops</span></td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-sm btn-outline" onClick={() => openEdit(r)}><Pencil size={13} /></button>
                        <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(r._id)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showForm && (
          <div className="form-overlay" onClick={() => setShowForm(false)}>
            <div className="form-modal" onClick={e => e.stopPropagation()}>
              <div className="form-modal-header">
                <h3>{editingRoute ? 'Edit Route' : 'Add Route'}</h3>
                <button className="close-btn" onClick={() => setShowForm(false)}><X size={16} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-modal-body">
                  <div className="form-group"><label>Route Name</label><input type="text" placeholder="e.g. North Route" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required /></div>
                  <div className="form-group"><label>Start Location</label><input type="text" placeholder="e.g. School Main Gate" value={formData.startLocation} onChange={e => setFormData({...formData, startLocation: e.target.value})} /></div>
                  <div className="form-group"><label>End Location</label><input type="text" placeholder="e.g. Downtown Terminal" value={formData.endLocation} onChange={e => setFormData({...formData, endLocation: e.target.value})} /></div>
                  <div className="form-group"><label>Estimated Time</label><input type="text" placeholder="e.g. 45 mins" value={formData.estimatedTime} onChange={e => setFormData({...formData, estimatedTime: e.target.value})} /></div>

                  <div className="form-group" style={{ borderTop: '1px solid var(--gray-100)', paddingTop: 16, marginTop: 4 }}>
                    <label>Stops (Address automatically geocodes coordinates)</label>
                    <div className="stop-input-row" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input type="text" placeholder="Stop name" value={newStop.name} onChange={e => setNewStop({...newStop, name: e.target.value})} style={{ flex: 1 }} />
                      <input type="text" placeholder="Address (e.g. 123 Main St)" value={newStop.address} onChange={e => setNewStop({...newStop, address: e.target.value})} style={{ flex: 2 }} />
                      <button type="button" onClick={addStop} className="btn btn-success btn-sm" disabled={geocoding}>
                        {geocoding ? 'Locating...' : '+ Add'}
                      </button>
                    </div>
                    {formData.stops.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {formData.stops.map((stop, index) => (
                          <div key={index} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 12px', background: 'var(--gray-50)',
                            borderRadius: 'var(--radius-sm)',
                            borderLeft: '3px solid var(--primary)'
                          }}>
                            <span style={{
                              width: 22, height: 22, borderRadius: '50%',
                              background: 'var(--primary)', color: 'white',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 600, flexShrink: 0
                            }}>{index + 1}</span>
                            <span style={{ fontWeight: 600, color: 'var(--secondary)', fontSize: 14 }}>{stop.name}</span>
                            <span style={{ flex: 1, color: 'var(--gray-400)', fontSize: 13 }}>
                              {stop.address}
                              {typeof stop.latitude === 'number' && typeof stop.longitude === 'number' ? (
                                <span style={{
                                  marginLeft: 8, fontSize: 11, color: '#16a34a',
                                  background: 'rgba(22,163,74,0.1)', padding: '2px 6px',
                                  borderRadius: 4, fontWeight: 500
                                }}>
                                  📍 {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                                </span>
                              ) : null}
                            </span>
                            <button type="button" onClick={() => removeStop(index)} className="btn btn-sm btn-danger" style={{ width: 26, height: 26, padding: 0 }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="form-actions">
                    <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={loading || geocoding}>
                      {loading ? <><span className="spinner"></span> Saving...</> : (editingRoute ? 'Update Route' : 'Add Route')}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="confirm-modal-header">
                <div className="confirm-icon danger"><AlertTriangle size={24} /></div>
                <h3>Delete Route?</h3>
                <p>This will permanently remove this route from the system.</p>
              </div>
              <div className="confirm-modal-actions">
                <button className="cancel-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                <button className="confirm-btn" onClick={() => handleDelete(deleteConfirm)}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

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
        setStudents(studentsRes.data);
        setRoutes(routesRes.data);
      } catch { toast.error('Failed to load data'); }
    }, [toast]);

    useEffect(() => {
      let isMounted = true;
      const fetchStudents = async () => {
        try {
          const [studentsRes, routesRes] = await Promise.all([schoolAPI.getStudents(), schoolAPI.getRoutes()]);
          if (isMounted) {
            setStudents(studentsRes.data);
            setRoutes(routesRes.data);
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
      setFormData({ name: student.name, parentPhone: student.parent_phone, pickupLocation: student.pickup_location || '', routeId: student.route_id?._id || student.route_id || '', stopId: student.stop_id?.toString() || '' });
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
      <div className="dashboard">
        <nav className="dashboard-nav" style={{ position: 'sticky', top: 0 }}>
          <div className="nav-section nav-left">
            <button onClick={() => navigate('/school-dashboard')} className="back-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
          </div>
          <div className="nav-section nav-center"><h2>Students</h2></div>
          <div className="nav-section nav-right"></div>
        </nav>
        <div className="content">
          <div className="table-container">
            <div className="table-toolbar">
              <h3>All Students ({students.length})</h3>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="table-search">
                  <span className="search-icon"><Search size={14} /></span>
                  <input placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={14} /> Add Student</button>
              </div>
            </div>
            <table>
              <thead>
                <tr><th>Name</th><th>Parent Phone</th><th>Route</th><th>Pickup Stop</th><th>QR Code</th><th style={{ width: 100 }}>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>No students found</td></tr>
                ) : filtered.map(s => (
                  <tr key={s._id}>
                    <td style={{ fontWeight: 600, color: 'var(--secondary)' }}>{s.name}</td>
                    <td>{s.parent_phone}</td>
                    <td>{s.route_name || <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                    <td>{s.stop_name || <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(s)}><Pencil size={12} /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(s._id)}><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{editingStudent ? 'Edit Student' : 'Add Student'}</h3>
                <button onClick={() => setShowForm(false)} className="close-btn"><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Student Name</label>
                    <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Alex Johnson" />
                  </div>
                  <div className="form-group">
                    <label>Parent Phone (Login Identifier)</label>
                    <input required value={formData.parentPhone} onChange={e => setFormData({ ...formData, parentPhone: e.target.value })} placeholder="e.g. +1234567890" />
                  </div>
                  <div className="form-group">
                    <label>Route</label>
                    <select value={formData.routeId} onChange={e => setFormData({ ...formData, routeId: e.target.value, stopId: '' })}>
                      <option value="">Select a route</option>
                      {routes.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                    </select>
                  </div>
                  {formData.routeId && (
                    <div className="form-group">
                      <label>Pickup / Drop Stop</label>
                      <select value={formData.stopId} onChange={e => {
                        const st = stops.find(s => s._id === e.target.value || s.order?.toString() === e.target.value);
                        setFormData({ ...formData, stopId: e.target.value, pickupLocation: st?.name || '' });
                      }}>
                        <option value="">Select a stop</option>
                        {stops.map(st => <option key={st._id || st.order} value={st._id || st.order}>{st.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="form-group">
                    <label>Custom Pickup Location / Notes</label>
                    <input value={formData.pickupLocation} onChange={e => setFormData({ ...formData, pickupLocation: e.target.value })} placeholder="e.g. 5th Ave Corner" />
                  </div>
                  <div className="form-actions">
                    <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? <><span className="spinner"></span> Saving...</> : (editingStudent ? 'Update Student' : 'Add Student')}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="confirm-modal-header">
                <div className="confirm-icon danger"><AlertTriangle size={24} /></div>
                <h3>Delete Student?</h3>
                <p>This will permanently remove this student and their QR boarding pass.</p>
              </div>
              <div className="confirm-modal-actions">
                <button className="cancel-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                <button className="confirm-btn" onClick={() => handleDelete(deleteConfirm)}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

// ========================================================
// LIVE FLEET TRACKING VIEW (SCHOOL ADMIN)
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
  const { isLoaded, loadError } = useJsApiLoader({
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
    const socket = connectSocket();
    let isMounted = true;

    loadFleet();

    const fetchSchoolInfo = async () => {
      try {
        const infoRes = await schoolAPI.getInfo();
        if (infoRes.data?._id) {
          joinSchoolFleet(infoRes.data._id);
        }
      } catch { /* ignore */ }
    };
    fetchSchoolInfo();

    // Socket listeners for real-time fleet updates
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

  // Center map on selected bus
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

  const selectedRouteStops = selectedBus?.route?.stops || [];
  const selectedRoutePolyline = useMemo(() => {
    return selectedRouteStops
      .filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number')
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(s => ({ lat: s.latitude, lng: s.longitude }));
  }, [selectedRouteStops]);

  return (
    <div className="dashboard">
      <SchoolNav onLogout={() => { clearAuth(); navigate('/login'); }} />

      <div className="content" style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
        {/* Emergency Alert Banner */}
        {fleet.some(b => b.emergency?.is_active) && (
          <div style={{
            background: '#fef2f2',
            border: '2px solid #ef4444',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: '#ef4444', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <AlertOctagon size={24} />
              </div>
              <div>
                <h4 style={{ color: '#991b1b', margin: 0, fontSize: 16 }}>EMERGENCY ALERT BROADCAST</h4>
                <p style={{ color: '#b91c1c', margin: '4px 0 0', fontSize: 13 }}>
                  Active SOS signal triggered on {fleet.filter(b => b.emergency?.is_active).map(b => b.bus_number).join(', ')}.
                </p>
              </div>
            </div>

            {fleet.filter(b => b.emergency?.is_active).map(b => (
              <button
                key={b.bus_id}
                className="btn btn-sm btn-danger"
                onClick={() => handleAcknowledgeEmergency(b.trip_id)}
                style={{ padding: '8px 16px', fontWeight: 600 }}
              >
                Acknowledge Emergency ({b.bus_number})
              </button>
            ))}
          </div>
        )}

        {/* Live Fleet Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--secondary)' }}>
              Real-Time Fleet Visibility
            </h2>
            <p style={{ color: 'var(--gray-400)', fontSize: 13, margin: '4px 0 0' }}>
              Live GPS tracking, route telemetry and next stop progression for all school buses
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(34, 197, 94, 0.1)', color: '#16a34a',
              padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
              {activeBusesWithLocation.length} Active On Trip
            </span>
            <button className="btn btn-outline btn-sm" onClick={loadFleet} title="Refresh Fleet Data">
              <RotateCcw size={14} /> Refresh
            </button>
          </div>
        </div>

        {/* Fleet Grid Layout: Sidebar + Map */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '360px 1fr',
          gap: 20,
          alignItems: 'start'
        }}>
          {/* Sidebar */}
          <div className="section-card" style={{ padding: 18, height: '700px', display: 'flex', flexDirection: 'column' }}>
            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: '1px solid var(--gray-100)', paddingBottom: 10 }}>
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
                    background: filterTab === tab.id ? 'var(--primary)' : 'transparent',
                    color: filterTab === tab.id ? '#fff' : 'var(--gray-500)',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <input
                type="text"
                placeholder="Search bus, driver, or route..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 34px',
                  borderRadius: 8,
                  border: '1px solid var(--gray-200)',
                  fontSize: 13
                }}
              />
              <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--gray-400)' }} />
            </div>

            {/* Bus Cards List */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredFleet.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)', fontSize: 13 }}>
                  No buses found matching filter
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
                        borderRadius: 12,
                        border: isSelected ? '2px solid var(--primary)' : isEmerg ? '1px solid #ef4444' : '1px solid var(--gray-100)',
                        background: isSelected ? 'rgba(59, 130, 246, 0.05)' : isEmerg ? 'rgba(239, 68, 68, 0.04)' : 'var(--gray-50)',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18 }}>🚌</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--secondary)' }}>
                              {bus.bus_number}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                              {bus.license_plate || bus.model || 'Standard Bus'}
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 12,
                          background: isEmerg ? '#fee2e2' : isDev ? '#fef3c7' : isLive ? '#dcfce7' : 'var(--gray-200)',
                          color: isEmerg ? '#ef4444' : isDev ? '#d97706' : isLive ? '#16a34a' : 'var(--gray-500)'
                        }}>
                          {isEmerg ? '🚨 SOS' : isDev ? '⚠️ Deviated' : isLive ? '🟢 Live' : '⚪ Idle'}
                        </span>
                      </div>

                      <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div>Driver: <strong>{bus.driver?.name}</strong></div>
                        <div>Route: <strong>{bus.route?.name}</strong></div>
                        {isLive && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2563eb', fontWeight: 600, marginTop: 4 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Map Container */}
            <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', height: '440px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
              {/* Map Floating Controls */}
              <div style={{
                position: 'absolute', top: 12, left: 12, zIndex: 10,
                background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)',
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                <MapPin size={14} style={{ display: 'inline', marginRight: 6, color: '#2563eb' }} />
                Active Fleet Map ({activeBusesWithLocation.length} Moving)
              </div>

              <button
                onClick={handleFitAllBuses}
                style={{
                  position: 'absolute', bottom: 16, right: 16, zIndex: 10,
                  background: '#2563eb', color: '#fff', border: 'none',
                  padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
                  display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <Compass size={14} /> Center Fleet
              </button>

              {isLoaded ? (
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '100%' }}
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
                        strokeColor: '#3b82f6',
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
                          fillColor: '#3b82f6',
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
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
                  <div className="spinner"></div>
                </div>
              )}
            </div>

            {/* Selected Bus Telemetry Card */}
            {selectedBus && (
              <div className="section-card" style={{ padding: '18px 22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22 }}>🚌</span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16 }}>{selectedBus.bus_number} Telemetry & Status</h3>
                      <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                        Model: {selectedBus.model || 'Standard'} · Plate: {selectedBus.license_plate || 'N/A'}
                      </span>
                    </div>
                  </div>

                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                    background: selectedBus.has_active_trip ? 'rgba(34, 197, 94, 0.1)' : 'var(--gray-100)',
                    color: selectedBus.has_active_trip ? '#16a34a' : 'var(--gray-500)'
                  }}>
                    {selectedBus.has_active_trip ? '● ACTIVE TRIP' : '○ IDLE / IN DEPOT'}
                  </span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 14,
                  background: 'var(--gray-50)',
                  padding: 14,
                  borderRadius: 12
                }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Assigned Driver</div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{selectedBus.driver?.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{selectedBus.driver?.phone || 'No Phone'}</div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Current Speed</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#2563eb', marginTop: 2 }}>
                      {selectedBus.location?.speed || 0} km/h
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Max: {selectedBus.telemetry?.max_speed || 0} km/h</div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Estimated Arrival</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#16a34a', marginTop: 2 }}>
                      {selectedBus.telemetry?.eta || 'N/A'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                      Dist: {selectedBus.telemetry?.distance_to_next_km ? `~${selectedBus.telemetry.distance_to_next_km} km` : '—'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Next Scheduled Stop</div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {selectedBus.telemetry?.next_stop_name || 'Destination'}
                    </div>
                    <div style={{ fontSize: 12, color: selectedBus.telemetry?.is_deviated ? '#ef4444' : '#16a34a' }}>
                      {selectedBus.telemetry?.is_deviated ? '⚠️ Route Deviated' : '✓ On Route'}
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
// TRIP HISTORY & REPLAY VIEW (SCHOOL ADMIN)
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
    loadTrips(1);
    return () => { isMounted = false; };
  }, [loadTrips]);

  const handleFilterChange = (field, val) => {
    setFilters(prev => ({ ...prev, [field]: val }));
  };

  return (
    <div className="dashboard">
      <SchoolNav onLogout={() => { clearAuth(); navigate('/login'); }} />

      <div className="content" style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--secondary)' }}>Trip History & Audit</h2>
            <p style={{ color: 'var(--gray-400)', fontSize: 13, margin: '4px 0 0' }}>
              Historical trip logs, route distance, student boarding rates and safety telemetry
            </p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="section-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto', gap: 12, alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Filter Bus</label>
              <select value={filters.busId} onChange={e => handleFilterChange('busId', e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13 }}>
                <option value="">All Buses</option>
                {buses.map(b => <option key={b._id} value={b._id}>{b.bus_number}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Filter Driver</label>
              <select value={filters.driverId} onChange={e => handleFilterChange('driverId', e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13 }}>
                <option value="">All Drivers</option>
                {drivers.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Filter Route</label>
              <select value={filters.routeId} onChange={e => handleFilterChange('routeId', e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13 }}>
                <option value="">All Routes</option>
                {routes.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Start Date</label>
              <input type="date" value={filters.startDate} onChange={e => handleFilterChange('startDate', e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 13 }} />
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase' }}>End Date</label>
              <input type="date" value={filters.endDate} onChange={e => handleFilterChange('endDate', e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 13 }} />
            </div>

            <div style={{ paddingTop: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => loadTrips(1)}>
                <Filter size={14} /> Filter
              </button>
            </div>
          </div>
        </div>

        {/* Trips Table */}
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Bus</th>
                <th>Driver</th>
                <th>Route</th>
                <th>Duration</th>
                <th>Distance</th>
                <th>Boarded Students</th>
                <th>Safety Score</th>
                <th>Status</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40 }}><span className="spinner spinner-dark"></span></td></tr>
              ) : trips.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>No trips found matching criteria</td></tr>
              ) : (
                trips.map(t => (
                  <tr key={t._id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--secondary)' }}>
                        {new Date(t.started_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                        {new Date(t.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td><strong>{t.bus_number}</strong></td>
                    <td>{t.driver_name}</td>
                    <td>{t.route_name}</td>
                    <td>{t.duration_minutes} min</td>
                    <td>{t.distance_km} km</td>
                    <td>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{t.boarded_students} / {t.expected_students} ({t.boarding_percentage}%)</div>
                      <div style={{ width: 80, height: 4, background: 'var(--gray-200)', borderRadius: 2, marginTop: 3 }}>
                        <div style={{ width: `${t.boarding_percentage}%`, height: '100%', background: '#22c55e', borderRadius: 2 }}></div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${t.safety_score >= 90 ? 'badge-success' : t.safety_score >= 75 ? 'badge-warning' : 'badge-danger'}`}>
                        {t.safety_score}/100
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${t.status === 'completed' ? 'badge-success' : 'badge-info'}`}>
                        {t.status === 'completed' ? 'Completed' : 'Ongoing'}
                      </span>
                    </td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-sm btn-outline" onClick={() => setReplayModalTrip(t)} title="Replay GPS Trail">
                          <Play size={13} /> Replay
                        </button>
                        <button className="btn btn-sm btn-outline" onClick={() => setAttendanceModalTrip(t)} title="View Attendance Log">
                          <Eye size={13} /> Boarding
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Replay Modal */}
        {replayModalTrip && (
          <TripReplayModal trip={replayModalTrip} onClose={() => setReplayModalTrip(null)} />
        )}

        {/* Attendance Modal */}
        {attendanceModalTrip && (
          <AttendanceModal trip={attendanceModalTrip} onClose={() => setAttendanceModalTrip(null)} />
        )}
      </div>
    </div>
  );
}

// ========================================================
// TRIP REPLAY MODAL WITH 1x / 2x / 4x ANIMATION
// ========================================================

function TripReplayModal({ trip, onClose }) {
  const [replayData, setReplayData] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [multiplier, setMultiplier] = useState(1);
  const [loading, setLoading] = useState(true);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

  useEffect(() => {
    let isMounted = true;
    const fetchReplay = async () => {
      try {
        const res = await tripAPI.getReplay(trip._id);
        if (isMounted) {
          setReplayData(res.data);
          setLoading(false);
        }
      } catch {
        if (isMounted) setLoading(false);
      }
    };
    fetchReplay();
    return () => { isMounted = false; };
  }, [trip._id]);

  // Playback timer ticker
  useEffect(() => {
    if (!isPlaying || !replayData?.locations || replayData.locations.length === 0) return;

    const intervalMs = Math.max(100, Math.floor(600 / multiplier));
    const timer = setInterval(() => {
      setCurrentIndex(idx => {
        if (idx >= replayData.locations.length - 1) {
          setIsPlaying(false);
          return idx;
        }
        return idx + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, multiplier, replayData]);

  const locations = replayData?.locations || [];
  const currentLocation = locations[currentIndex] || locations[0];
  const polylinePath = locations.map(l => ({ lat: l.lat, lng: l.lng }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 800, width: '90%', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>🚌 Trip Replay: Bus {trip.bus_number}</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--gray-400)' }}>
              Route: {trip.route_name} · Date: {new Date(trip.started_at).toLocaleDateString()}
            </p>
          </div>
          <button className="close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {loading ? (
          <div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="spinner spinner-dark"></span>
          </div>
        ) : locations.length === 0 ? (
          <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
            No GPS breadcrumbs recorded for this trip.
          </div>
        ) : (
          <>
            <div style={{ height: 360, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              {isLoaded && currentLocation && (
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '100%' }}
                  center={{ lat: currentLocation.lat, lng: currentLocation.lng }}
                  zoom={15}
                  options={mapOptions}
                >
                  {polylinePath.length > 1 && (
                    <Polyline path={polylinePath} options={{ strokeColor: '#2563eb', strokeWeight: 4, strokeOpacity: 0.75 }} />
                  )}
                  <Marker
                    position={{ lat: currentLocation.lat, lng: currentLocation.lng }}
                    icon={createFleetBusIcon(currentLocation.heading || 0, false, true)}
                  />
                </GoogleMap>
              )}
            </div>

            {/* Playback Controls */}
            <div style={{ background: 'var(--gray-50)', padding: '14px 18px', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
                  </button>

                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => { setCurrentIndex(0); setIsPlaying(false); }}
                  >
                    <RotateCcw size={14} /> Restart
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--gray-500)', marginRight: 4 }}>Speed:</span>
                  {[1, 2, 4].map(s => (
                    <button
                      key={s}
                      onClick={() => setMultiplier(s)}
                      style={{
                        padding: '4px 10px', borderRadius: 4, border: 'none',
                        background: multiplier === s ? 'var(--primary)' : 'var(--gray-200)',
                        color: multiplier === s ? '#fff' : 'var(--gray-600)',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      {s}x
                    </button>
                  ))}
                </div>

                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  <span>{new Date(currentLocation.timestamp).toLocaleTimeString()}</span> · <span style={{ color: '#2563eb' }}>{currentLocation.speed} km/h</span>
                </div>
              </div>

              {/* Scrubber slider */}
              <input
                type="range"
                min="0"
                max={locations.length - 1}
                value={currentIndex}
                onChange={e => setCurrentIndex(parseInt(e.target.value, 10))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ========================================================
// ATTENDANCE & BOARDING LOG MODAL
// ========================================================

function AttendanceModal({ trip, onClose }) {
  const checkIns = trip.check_ins || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, width: '90%', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>Student Boarding Audit</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--gray-400)' }}>
              Bus {trip.bus_number} · {checkIns.length} Boarded Students
            </p>
          </div>
          <button className="close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          {checkIns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>
              No QR scans recorded for this trip.
            </div>
          ) : (
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Pickup Stop</th>
                  <th>Scanned Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {checkIns.map((ci, idx) => (
                  <tr key={idx}>
                    <td><strong>{ci.student_name}</strong></td>
                    <td>{ci.pickup_location || 'Assigned Stop'}</td>
                    <td>{new Date(ci.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td><span className="badge badge-success">✓ Boarded</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ========================================================
// AI OPERATIONS & ANALYTICS VIEW
// ========================================================

function AnalyticsView() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    const fetchAnalytics = async () => {
      try {
        const res = await schoolAPI.getAnalytics();
        if (isMounted) {
          setAnalytics(res.data);
          setLoading(false);
        }
      } catch {
        if (isMounted) setLoading(false);
      }
    };
    fetchAnalytics();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="dashboard">
      <SchoolNav onLogout={() => { clearAuth(); navigate('/login'); }} />

      <div className="content" style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--secondary)' }}>AI Operations Insights & Fleet Intelligence</h2>
          <p style={{ color: 'var(--gray-400)', fontSize: 13, margin: '4px 0 0' }}>
            Automated bottleneck discovery, schedule variance diagnostics and driver safety metrics
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner spinner-dark"></span></div>
        ) : !analytics ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>Failed to load insights</div>
        ) : (
          <>
            {/* Stat Cards */}
            <div className="stats" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 24 }}>
              <div className="stat-card">
                <div className="stat-icon"><Clock size={20} /></div>
                <h3>{analytics.total_trips_analyzed}</h3>
                <p>Trips (30 Days)</p>
              </div>

              <div className="stat-card">
                <div className="stat-icon"><MapPin size={20} /></div>
                <h3>{analytics.total_distance_km}</h3>
                <p>Kilometers Run</p>
              </div>

              <div className="stat-card">
                <div className="stat-icon"><Activity size={20} /></div>
                <h3>{analytics.total_hours_traveled}</h3>
                <p>Fleet Transit Hours</p>
              </div>

              <div className="stat-card">
                <div className="stat-icon"><AlertTriangle size={20} /></div>
                <h3>{analytics.speeding_events}</h3>
                <p>Speeding Events</p>
              </div>

              <div className="stat-card">
                <div className="stat-icon"><Navigation size={20} /></div>
                <h3>{analytics.route_deviations}</h3>
                <p>Route Deviations</p>
              </div>
            </div>

            {/* AI Insights Recommendations List */}
            <div className="section-card" style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={18} color="#2563eb" /> Schedule Optimization & AI Insights
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {analytics.insights?.map((item, idx) => (
                  <div key={idx} style={{
                    padding: '14px 18px',
                    borderRadius: 10,
                    background: item.type === 'warning' ? '#fef3c7' : item.type === 'success' ? '#dcfce7' : 'var(--gray-50)',
                    borderLeft: `4px solid ${item.type === 'warning' ? '#f59e0b' : item.type === 'success' ? '#22c55e' : '#3b82f6'}`
                  }}>
                    <h4 style={{ margin: 0, fontSize: 14, color: item.type === 'warning' ? '#92400e' : item.type === 'success' ? '#166534' : 'var(--secondary)' }}>
                      {item.title}
                    </h4>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--gray-600)' }}>
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Driver Safety Leaderboard */}
            <div className="section-card">
              <h3 style={{ fontSize: 16, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={18} color="#2563eb" /> Driver Safety & Performance Leaderboard
              </h3>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Driver Name</th>
                    <th>Trips Completed</th>
                    <th>Max Observed Speed</th>
                    <th>Average Speed</th>
                    <th>Safety Score</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.driver_rankings?.map((dr, idx) => (
                    <tr key={idx}>
                      <td><strong>{dr.name}</strong></td>
                      <td>{dr.trips_completed}</td>
                      <td>{dr.max_speed} km/h</td>
                      <td>{dr.average_speed} km/h</td>
                      <td>
                        <span className={`badge ${dr.safety_score >= 90 ? 'badge-success' : dr.safety_score >= 75 ? 'badge-warning' : 'badge-danger'}`}>
                          {dr.safety_score}/100
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SchoolDashboard() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/fleet" element={<LiveFleetView />} />
      <Route path="/trips" element={<TripHistoryView />} />
      <Route path="/analytics" element={<AnalyticsView />} />
      <Route path="/drivers" element={<Drivers />} />
      <Route path="/buses" element={<Buses />} />
      <Route path="/routes" element={<Routes_ />} />
      <Route path="/students" element={<Students />} />
    </Routes>
  );
}

export default SchoolDashboard;

