import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { MapPin, Bus, LogOut, Clock, QrCode, RefreshCw, Bell, X, Check, AlertTriangle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { parentAPI } from '../api';
import { clearAuth } from '../auth';
import { useToast } from '../App';
import { connectSocket, onTripLocationUpdate, onTripEnded, joinTripRoom } from '../socket';
import gsap from 'gsap';

const mapContainerStyle = { width: '100%', height: '300px' };
const defaultCenter = { lat: 40.7128, lng: -74.0060 };
const mapOptions = { disableDefaultUI: false, zoomControl: true, streetViewControl: false, mapTypeControl: false, fullscreenControl: true };

function ParentDashboard() {
  const [tripStatus, setTripStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [countdown, setCountdown] = useState(10);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const toast = useToast();
  const contentRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

  useEffect(() => {
    connectSocket();
    loadData();
    loadNotifications();

    const notifInterval = setInterval(loadNotifications, 10000);

    const unsubLocation = onTripLocationUpdate((data) => {
      setCurrentLocation({ lat: data.lat, lng: data.lng });
    });

    const unsubEnded = onTripEnded(() => {
      setTripStatus(null);
      setCurrentLocation(null);
    });

    return () => {
      clearInterval(notifInterval);
      unsubLocation();
      unsubEnded();
    };
  }, []);

  useEffect(() => {
    const ci = setInterval(() => {
      setCountdown(prev => prev <= 1 ? 10 : prev - 1);
    }, 1000);
    return () => clearInterval(ci);
  }, []);

  useEffect(() => {
    gsap.fromTo(contentRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.4, ease: 'power2.out' }
    );
  }, []);

  const loadData = async () => {
    try {
      const res = await parentAPI.getTripStatus();
      setTripStatus(res.data);
      if (res.data?._id) {
        joinTripRoom(res.data._id);
      }
      if (res.data?.current_lat && res.data?.current_lng) {
        setCurrentLocation({ lat: res.data.current_lat, lng: res.data.current_lng });
      }
      setCountdown(10);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadNotifications = async () => {
    try {
      const res = await parentAPI.getNotifications();
      setNotifications(res.data || []);
      setUnreadCount((res.data || []).filter(n => !n.read).length);
    } catch { /* ignore */ }
  };

  const markAsRead = async (id) => {
    try {
      await parentAPI.markNotificationRead(id);
      loadNotifications();
    } catch { toast.error('Failed to mark as read'); }
  };

  const handleLogout = () => setShowLogoutConfirm(true);
  const confirmLogout = () => {
    gsap.to(contentRef.current, {
      opacity: 0, x: -50, duration: 0.25,
      onComplete: () => { clearAuth(); navigate('/login'); }
    });
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case 'approaching': return { icon: '🚌', bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' };
      case 'arrived': return { icon: '📍', bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' };
      case 'picked_up': return { icon: '✓', bg: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' };
      case 'delayed': return { icon: '⏰', bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' };
      default: return { icon: 'ℹ', bg: 'var(--gray-100)', color: 'var(--gray-500)' };
    }
  };

  return (
    <div className="parent-dashboard">
      <nav>
        <div className="nav-section nav-left">
          <button className="logout-btn notification-btn-wrap" onClick={() => { setShowNotifications(true); loadNotifications(); }}
            style={{ position: 'relative' }}>
            <Bell size={16} />
            {unreadCount > 0 && <span className="badge-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
        </div>
        <div className="nav-section nav-center">
          <h2>Parent Dashboard</h2>
        </div>
        <div className="nav-section nav-right">
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </nav>

      <div className="content" ref={contentRef} style={{ maxWidth: 600, margin: '0 auto' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div className="spinner spinner-dark" style={{ width: 28, height: 28, margin: '0 auto 12px' }}></div>
            <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>Loading trip information...</p>
          </div>
        ) : tripStatus ? (
          <>
            <div className="trip-status-card">
              <h3 style={{ color: 'var(--gray-500)', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Trip Status</h3>
              <div className="status-badge live">
                <span className="pulse-dot active"></span>
                Bus is on the way!
              </div>
              <div className="status-grid">
                <div className="status-item"><label>Bus</label><span>{tripStatus.bus_number || 'N/A'}</span></div>
                <div className="status-item"><label>Route</label><span>{tripStatus.route_name || 'N/A'}</span></div>
                <div className="status-item"><label>Student</label><span>{tripStatus.student_name || 'N/A'}</span></div>
              </div>
            </div>

            <div className="qr-card">
              <h3><QrCode size={18} /> Boarding Pass</h3>
              <p className="qr-subtitle">Show this QR code to the bus driver when boarding</p>
              <div className="qr-display">
                <QRCodeSVG value={tripStatus.qr_code || 'loading...'} size={170} level="M" includeMargin={true} />
                <div className="qr-timer">
                  <div className="timer-ring">
                    <span style={{ fontSize: 10, position: 'absolute' }}>{countdown}</span>
                  </div>
                  <span>Refreshes in {countdown}s</span>
                </div>
              </div>
            </div>

            {isLoaded && currentLocation && (
              <div className="map-wrapper" style={{ marginBottom: 20 }}>
                <div className="map-header">
                  <h3><MapPin size={16} /> Live Bus Location</h3>
                  <span className="badge badge-success">Live</span>
                </div>
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={currentLocation}
                  zoom={15}
                  options={mapOptions}
                >
                  <Marker position={currentLocation} label="B" />
                </GoogleMap>
                <div className="map-coords">
                  <span><MapPin size={12} /> {currentLocation.lat.toFixed(6)}</span>
                  <span><MapPin size={12} /> {currentLocation.lng.toFixed(6)}</span>
                </div>
              </div>
            )}
            {loadError && <div className="error-message">Error loading Google Maps</div>}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Clock size={32} style={{ color: 'var(--gray-400)' }} />
            </div>
            <h3 style={{ color: 'var(--secondary)', fontSize: 18, marginBottom: 8 }}>No Active Trip</h3>
            <p style={{ color: 'var(--gray-400)', fontSize: 14, maxWidth: 320, margin: '0 auto' }}>
              The bus is not currently on a trip. Check back later or contact the school for updates.
            </p>
          </div>
        )}
      </div>

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

      {showNotifications && (
        <>
          <div className="notification-panel-overlay" onClick={() => setShowNotifications(false)} />
          <div className="notification-panel">
            <div className="notification-panel-header">
              <h3><Bell size={18} /> Notifications</h3>
              <button onClick={() => setShowNotifications(false)}><X size={18} /></button>
            </div>
            <div className="notification-list">
              {notifications.length === 0 ? (
                <div className="no-notifications">
                  <Bell size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
                  <p>No notifications yet</p>
                </div>
              ) : (
                notifications.map((n, i) => {
                  const style = getNotifIcon(n.type);
                  return (
                    <div key={n._id || i} className={`notification-item ${n.read ? 'read' : 'unread'}`}>
                      <div className="notif-icon" style={{ background: style.bg, color: style.color }}>
                        {style.icon}
                      </div>
                      <div className="notif-content">
                        <div className="notif-message">{n.message}</div>
                        <div className="notif-time">
                          {new Date(n.created_at).toLocaleString([], {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </div>
                      </div>
                      {!n.read && (
                        <button className="mark-read" onClick={() => markAsRead(n._id)} title="Mark as read">
                          <Check size={14} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ParentDashboard;
