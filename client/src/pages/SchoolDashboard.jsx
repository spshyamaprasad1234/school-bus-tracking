  import { useState, useEffect, useRef } from 'react';
  import { useNavigate, Link, Routes, Route } from 'react-router-dom';
  import { Bus, GraduationCap, Users, Route as RouteIcon, Plus, Pencil, Trash2, Search, X, AlertTriangle } from 'lucide-react';
  import { schoolAPI, tripAPI } from '../api';
  import { clearAuth } from '../auth';
  import { useToast } from '../App';
  import gsap from 'gsap';

  function Dashboard() {
    const [stats, setStats] = useState({ driverCount: 0, busCount: 0, routeCount: 0, studentCount: 0 });
    const [info, setInfo] = useState({});
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const navigate = useNavigate();
    const statsRef = useRef(null);

    useEffect(() => {
      loadData();
      loadTrips();
      if (statsRef.current) {
        gsap.fromTo(statsRef.current.children,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.4, stagger: 0.08, delay: 0.15, ease: 'power2.out' }
        );
      }
    }, []);

    const loadData = async () => {
      try {
        const [dashboardRes, infoRes] = await Promise.all([
          schoolAPI.getDashboard(),
          schoolAPI.getInfo()
        ]);
        setStats(dashboardRes.data);
        setInfo(infoRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const loadTrips = async () => {
      try {
        const res = await tripAPI.getActiveTrips();
        setTrips(res.data);
      } catch (err) {
        console.error(err);
      }
    };

    const handleLogout = () => setShowLogoutConfirm(true);
    const confirmLogout = () => { clearAuth(); navigate('/login'); };

    return (
      <div className="dashboard">
        <nav className="dashboard-nav">
          <div className="nav-section nav-left">
            <Link to="">Overview</Link>
            <Link to="drivers">Drivers</Link>
            <Link to="buses">Buses</Link>
            <Link to="routes">Routes</Link>
            <Link to="students">Students</Link>
          </div>
          <div className="nav-section nav-center">
            <h2>School Dashboard</h2>
          </div>
          <div className="nav-section nav-right">
            <button onClick={handleLogout} className="logout-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Logout
            </button>
          </div>
        </nav>

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

    useEffect(() => { loadDrivers(); }, []);

    const loadDrivers = async () => {
      try {
        const res = await schoolAPI.getDrivers();
        setDrivers(res.data);
      } catch { toast.error('Failed to load drivers'); }
    };

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

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
      try {
        const [busesRes, driversRes, routesRes] = await Promise.all([schoolAPI.getBuses(), schoolAPI.getDrivers(), schoolAPI.getRoutes()]);
        setBuses(busesRes.data);
        setDrivers(driversRes.data);
        setRoutes(routesRes.data);
      } catch { toast.error('Failed to load data'); }
    };

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
    const [newStop, setNewStop] = useState({ name: '', address: '', order: 0 });
    const [search, setSearch] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const toast = useToast();

    useEffect(() => { loadRoutes(); }, []);

    const loadRoutes = async () => {
      try {
        const res = await schoolAPI.getRoutes();
        setRoutes(res.data);
      } catch { toast.error('Failed to load routes'); }
    };

    const openAdd = () => {
      setEditingRoute(null);
      setFormData({ name: '', startLocation: '', endLocation: '', estimatedTime: '', stops: [] });
      setNewStop({ name: '', address: '', order: 0 });
      setShowForm(true);
    };

    const openEdit = (route) => {
      setEditingRoute(route);
      setFormData({ name: route.name, startLocation: route.start_location, endLocation: route.end_location, estimatedTime: route.estimated_time, stops: route.stops || [] });
      setShowForm(true);
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      try {
        const stopsWithOrder = formData.stops.map((stop, idx) => ({ ...stop, order: idx + 1 }));
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

    const addStop = () => {
      if (!newStop.name.trim()) return;
      setFormData({
        ...formData,
        stops: [...formData.stops, { ...newStop, order: formData.stops.length + 1 }]
      });
      setNewStop({ name: '', address: '', order: 0 });
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
                    <label>Stops</label>
                    <div className="stop-input-row" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input type="text" placeholder="Stop name" value={newStop.name} onChange={e => setNewStop({...newStop, name: e.target.value})} style={{ flex: 1 }} />
                      <input type="text" placeholder="Address" value={newStop.address} onChange={e => setNewStop({...newStop, address: e.target.value})} style={{ flex: 2 }} />
                      <button type="button" onClick={addStop} className="btn btn-success btn-sm">+ Add</button>
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
                            <span style={{ flex: 1, color: 'var(--gray-400)', fontSize: 13 }}>{stop.address}</span>
                            <button type="button" onClick={() => removeStop(index)} className="btn btn-sm btn-danger" style={{ width: 26, height: 26, padding: 0 }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="form-actions">
                    <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
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

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
      try {
        const [studentsRes, routesRes] = await Promise.all([schoolAPI.getStudents(), schoolAPI.getRoutes()]);
        setStudents(studentsRes.data);
        setRoutes(routesRes.data);
      } catch { toast.error('Failed to load data'); }
    };

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
          const res = await schoolAPI.addStudent(formData);
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
                    <td><span className="badge badge-info" style={{ fontFamily: 'monospace', fontSize: 11 }}>{s.qr_code?.slice(0, 10)}...</span></td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-sm btn-outline" onClick={() => openEdit(s)}><Pencil size={13} /></button>
                        <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(s._id)}><Trash2 size={13} /></button>
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
                <h3>{editingStudent ? 'Edit Student' : 'Add Student'}</h3>
                <button className="close-btn" onClick={() => setShowForm(false)}><X size={16} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-modal-body">
                  <div className="form-group"><label>Student Name</label><input type="text" placeholder="e.g. Jane Doe" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required /></div>
                  <div className="form-group"><label>Parent Phone</label><input type="tel" placeholder="+1 (555) 000-0000" value={formData.parentPhone} onChange={e => setFormData({...formData, parentPhone: e.target.value})} required /></div>
                  <div className="form-group"><label>Pickup Location</label><input type="text" placeholder="e.g. 123 Main St" value={formData.pickupLocation} onChange={e => setFormData({...formData, pickupLocation: e.target.value})} /></div>
                  <div className="form-group">
                    <label>Route</label>
                    <select value={formData.routeId} onChange={e => setFormData({...formData, routeId: e.target.value, stopId: ''})}>
                      <option value="">— No route —</option>
                      {routes.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                    </select>
                  </div>
                  {formData.routeId && stops.length > 0 && (
                    <div className="form-group">
                      <label>Pickup Stop</label>
                      <select value={formData.stopId} onChange={e => setFormData({...formData, stopId: e.target.value})}>
                        <option value="">— Select stop —</option>
                        {stops.map(stop => (
                          <option key={stop.order} value={stop.order}>{stop.order}. {stop.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
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
                <p>This will permanently remove this student from the system.</p>
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

  function SchoolDashboard() {
    return (
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/drivers" element={<Drivers />} />
        <Route path="/buses" element={<Buses />} />
        <Route path="/routes" element={<Routes_ />} />
        <Route path="/students" element={<Students />} />
      </Routes>
    );
  }

  export default SchoolDashboard;
