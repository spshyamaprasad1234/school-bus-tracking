import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, Marker, Polyline, InfoWindow } from '@react-google-maps/api';
import { 
  MapPin, LogOut, Clock, QrCode, Bell, X, Check, AlertTriangle, 
  Navigation, Gauge, Compass, User, AlertOctagon, 
  UserCheck 
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { parentAPI } from '../api';
import { clearAuth } from '../auth';
import { useToast } from '../App';
import { 
  connectSocket, onTripLocationUpdate, onTripEnded, joinTripRoom, 
  onNewNotification, onEmergencyAlert, onEmergencyAcknowledged 
} from '../socket';
import gsap from 'gsap';
import StatusBadge from '../components/ui/StatusBadge';
import ConfirmModal from '../components/ui/ConfirmModal';
import EmptyState from '../components/ui/EmptyState';

const mapContainerStyle = { width: '100%', height: '380px', borderRadius: '16px' };

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

// SVG bus icon with directional heading rotation
const createBusSvgIcon = (heading = 0) => {
  if (typeof window === 'undefined' || !window.google?.maps) return undefined;
  return {
    path: 'M -12,-16 L 12,-16 C 14,-16 16,-14 16,-12 L 16,14 C 16,16 14,18 12,18 L -12,18 C -14,18 -16,16 -16,14 L -16,-12 C -16,-14 -14,-16 -12,-16 Z M -11,-12 L -11,-4 L 11,-4 L 11,-12 Z M -11,0 L -6,0 L -6,6 L -11,6 Z M 6,0 L 11,0 L 11,6 L 6,6 Z M -10,10 C -11.1,10 -12,10.9 -12,12 C -12,13.1 -11.1,14 -10,14 C -8.9,14 -8,13.1 -8,12 C -8,10.9 -8.9,10 -10,10 Z M 10,10 C 8.9,10 8,10.9 8,12 C 8,13.1 8.9,14 10,14 C 11.1,14 12,13.1 12,12 C 12,10.9 11.1,10 10,10 Z',
    fillColor: '#2563eb',
    fillOpacity: 1,
    strokeWeight: 2,
    strokeColor: '#ffffff',
    scale: 1.1,
    rotation: heading || 0,
    anchor: new window.google.maps.Point(0, 0)
  };
};

function ParentDashboard() {
  const [tripStatus, setTripStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Real-time telemetry state
  const [currentLocation, setCurrentLocation] = useState(null);
  const [targetLocation, setTargetLocation] = useState(null);
  const [heading, setHeading] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [etaText, setEtaText] = useState('Calculating ETA...');
  const [distanceToNext, setDistanceToNext] = useState(null);
  const [nextStopName, setNextStopName] = useState('');
  const [currentStopOrder, setCurrentStopOrder] = useState(0);
  const [isDeviated, setIsDeviated] = useState(false);
  const [emergency, setEmergency] = useState(null);
  
  // Connection diagnostics
  const [socketStatus, setSocketStatus] = useState('connecting'); // 'live' | 'weak' | 'reconnecting'
  const [lastUpdatedTime, setLastUpdatedTime] = useState(() => Date.now());
  const [secondsAgo, setSecondsAgo] = useState(0);
  
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [countdown, setCountdown] = useState(() => {
    const now = Math.floor(Date.now() / 1000);
    const rem = 10 - (now % 10);
    return rem === 0 ? 10 : rem;
  });
  
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const navigate = useNavigate();
  const toast = useToast();
  const contentRef = useRef(null);
  const mapRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

  const loadNotifications = useCallback(async () => {
    try {
      const res = await parentAPI.getNotifications();
      setNotifications(res.data || []);
      setUnreadCount((res.data || []).filter(n => !n.read).length);
    } catch { /* ignore */ }
  }, []);

  // Smooth marker interpolation loop
  useEffect(() => {
    if (!targetLocation) return;
    let animId = null;
    const startTime = performance.now();
    const duration = 1000;

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setCurrentLocation(prev => {
        const startLat = prev?.lat || targetLocation.lat;
        const startLng = prev?.lng || targetLocation.lng;
        const nextLat = startLat + (targetLocation.lat - startLat) * progress;
        const nextLng = startLng + (targetLocation.lng - startLng) * progress;
        return { lat: nextLat, lng: nextLng };
      });

      if (progress < 1) {
        animId = requestAnimationFrame(animate);
      }
    };

    animId = requestAnimationFrame(animate);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [targetLocation]);

  // Main initial fetch & Socket room setup
  useEffect(() => {
    const socket = connectSocket();
    let isMounted = true;

    if (socket) {
      if (socket.connected) {
        setTimeout(() => isMounted && setSocketStatus('live'), 0);
      }
      socket.on('connect', () => isMounted && setSocketStatus('live'));
      socket.on('disconnect', () => isMounted && setSocketStatus('reconnecting'));
      socket.on('connect_error', () => isMounted && setSocketStatus('reconnecting'));
    }

    const initialize = async () => {
      try {
        const [tripRes, notifRes] = await Promise.all([
          parentAPI.getTripStatus(),
          parentAPI.getNotifications()
        ]);
        if (!isMounted) return;

        if (tripRes.data) {
          const t = tripRes.data;
          setTripStatus(t);
          if (t._id) joinTripRoom(t._id);
          
          if (typeof t.current_lat === 'number' && typeof t.current_lng === 'number') {
            const loc = { lat: t.current_lat, lng: t.current_lng };
            setCurrentLocation(loc);
            setTargetLocation(loc);
          }
          setHeading(t.current_heading || 0);
          setSpeed(t.current_speed || 0);
          setEtaText(t.eta || 'Calculating ETA...');
          setDistanceToNext(t.distance_to_next_km || 0);
          setNextStopName(t.next_stop_name || 'Upcoming Stop');
          setCurrentStopOrder(t.current_stop_order || 0);
          setIsDeviated(t.is_deviated || false);
          setEmergency(t.emergency || null);
          setLastUpdatedTime(t.last_location_at ? new Date(t.last_location_at).getTime() : Date.now());
        }

        setNotifications(notifRes.data || []);
        setUnreadCount((notifRes.data || []).filter(n => !n.read).length);
      } catch (err) {
        console.error('Parent initialize error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initialize();
    const notifInterval = setInterval(loadNotifications, 10000);

    const unsubLocation = onTripLocationUpdate((data) => {
      if (!isMounted || !data) return;
      setTargetLocation({ lat: data.lat, lng: data.lng });
      setHeading(data.heading || 0);
      setSpeed(data.speed || 0);
      if (data.eta) setEtaText(data.eta);
      if (typeof data.distanceToNextStopKm === 'number') setDistanceToNext(data.distanceToNextStopKm);
      if (data.nextStopName) setNextStopName(data.nextStopName);
      if (typeof data.currentStopOrder === 'number') setCurrentStopOrder(data.currentStopOrder);
      if (typeof data.isDeviated === 'boolean') setIsDeviated(data.isDeviated);
      if (data.emergency) setEmergency(data.emergency);
      setLastUpdatedTime(Date.now());
      setSocketStatus('live');
    });

    const unsubEnded = onTripEnded(() => {
      if (!isMounted) return;
      setTripStatus(null);
      setCurrentLocation(null);
      setTargetLocation(null);
      toast.info('The bus trip has concluded.');
    });

    const unsubEmergency = onEmergencyAlert((alertData) => {
      if (!isMounted) return;
      setEmergency({ is_active: true, reason: alertData.reason, triggered_at: alertData.timestamp });
      toast.error(`🚨 Emergency reported for ${alertData.busNumber || 'bus'}!`);
    });

    const unsubEmergencyAck = onEmergencyAcknowledged(() => {
      if (!isMounted) return;
      setEmergency(null);
      toast.success('Emergency alert acknowledged by school administration.');
    });

    const unsubNotif = onNewNotification((newNotif) => {
      if (!isMounted || !newNotif) return;
      setNotifications(prev => [newNotif, ...prev.filter(n => n._id !== newNotif._id)]);
      setUnreadCount(prev => prev + 1);
      if (newNotif.message) toast.info(newNotif.message);
    });

    return () => {
      isMounted = false;
      clearInterval(notifInterval);
      unsubLocation();
      unsubEnded();
      unsubEmergency();
      unsubEmergencyAck();
      unsubNotif();
    };
  }, [loadNotifications, toast]);

  // Dynamic seconds ago counter
  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.max(0, Math.floor((Date.now() - lastUpdatedTime) / 1000));
      setSecondsAgo(diff);
      if (diff > 40 && socketStatus === 'live') {
        setSocketStatus('weak');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdatedTime, socketStatus]);

  // QR auto-refresh countdown
  useEffect(() => {
    let mounted = true;
    const getSecondsRemaining = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = 10 - (now % 10);
      return remaining === 0 ? 10 : remaining;
    };

    const qrInterval = setInterval(async () => {
      const remaining = getSecondsRemaining();
      setCountdown(remaining);

      if (remaining === 10) {
        try {
          const res = await parentAPI.getTripStatus();
          if (mounted && res.data) {
            setTripStatus(res.data);
            if (res.data?._id) joinTripRoom(res.data._id);
          }
        } catch (err) {
          console.error('QR auto-refresh error:', err);
        }
      }
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(qrInterval);
    };
  }, []);

  useEffect(() => {
    gsap.fromTo(contentRef.current,
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
    );
  }, []);

  const handleCenterOnBus = () => {
    if (mapRef.current && currentLocation) {
      mapRef.current.panTo(currentLocation);
      mapRef.current.setZoom(16);
    }
  };

  const markAsRead = async (id) => {
    try {
      await parentAPI.markNotificationRead(id);
      loadNotifications();
    } catch { toast.error('Failed to mark as read'); }
  };

  const handleLogout = () => setShowLogoutConfirm(true);
  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    clearAuth();
    navigate('/login');
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case 'approaching': return { icon: '🚌', bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' };
      case 'arrived': return { icon: '📍', bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' };
      case 'picked_up': return { icon: '✓', bg: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' };
      case 'delayed': return { icon: '⏰', bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' };
      case 'emergency': return { icon: '🚨', bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' };
      default: return { icon: 'ℹ', bg: 'var(--slate-100)', color: 'var(--slate-500)' };
    }
  };

  const routeStops = useMemo(() => tripStatus?.stops || [], [tripStatus?.stops]);
  const polylinePath = useMemo(() => {
    return routeStops
      .filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number')
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(s => ({ lat: s.latitude, lng: s.longitude }));
  }, [routeStops]);

  const isStudentBoarded = tripStatus?.student_boarded === true || tripStatus?.is_boarded === true;

  return (
    <div className="parent-dashboard" style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Top Navigation Bar */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #e2e8f0',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <User size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#0f172a' }}>Parent Portal</h3>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Live Bus & Safety Tracking</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            className="btn btn-outline btn-sm"
            onClick={() => { setShowNotifications(true); loadNotifications(); }}
            style={{ position: 'relative', padding: '8px', borderRadius: '10px' }}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  background: '#ef4444',
                  color: '#ffffff',
                  fontSize: '10px',
                  fontWeight: 700,
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)'
                }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <button onClick={handleLogout} className="btn btn-outline btn-sm" style={{ borderRadius: '10px', color: '#64748b' }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </nav>

      <div className="content" ref={contentRef} style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px 40px' }}>
        {loading ? (
          <div style={{ padding: '80px 20px', textAlign: 'center' }}>
            <div className="spinner spinner-dark" style={{ width: '36px', height: '36px', margin: '0 auto 16px' }} />
            <h4 style={{ fontSize: '16px', color: '#0f172a', margin: '0 0 6px 0' }}>Connecting to Live Bus Telemetry</h4>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Retrieving active GPS coordinates and route status...</p>
          </div>
        ) : tripStatus ? (
          <>
            {/* Emergency Alert Banner */}
            {emergency?.is_active && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '2px solid #ef4444',
                  borderRadius: '14px',
                  padding: '16px 18px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  color: '#b91c1c',
                  animation: 'pulseLive 2s infinite'
                }}
              >
                <AlertOctagon size={28} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '15px' }}>EMERGENCY ALERT BROADCAST</div>
                  <div style={{ fontSize: '13px', color: '#7f1d1d', marginTop: '2px' }}>
                    The driver signaled an alert ({emergency.reason || 'Assistance requested'}). School dispatch is responding.
                  </div>
                </div>
              </div>
            )}

            {/* Route Deviation Banner */}
            {isDeviated && !emergency?.is_active && (
              <div
                style={{
                  background: '#fffbeb',
                  border: '1.5px solid #f59e0b',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#b45309',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                <AlertTriangle size={18} />
                <span>The bus is currently navigating slightly off the primary scheduled corridor.</span>
              </div>
            )}

            {/* Uber / Zomato Style Live Tracking Hero Card */}
            <div
              style={{
                background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
                color: '#ffffff',
                borderRadius: '20px',
                padding: '24px',
                boxShadow: '0 12px 30px -5px rgba(15, 23, 42, 0.35)',
                marginBottom: '18px',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Header inside Card */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '24px' }}>🚌</span>
                    <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff' }}>
                      {tripStatus.bus_number || 'School Bus'}
                    </span>
                    {tripStatus.license_plate && (
                      <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.12)', padding: '2px 8px', borderRadius: '6px', color: '#cbd5e1' }}>
                        {tripStatus.license_plate}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                    Route: <strong style={{ color: '#f1f5f9' }}>{tripStatus.route_name || 'Assigned Route'}</strong>
                  </div>
                </div>

                <StatusBadge 
                  status={socketStatus === 'live' ? 'LIVE' : socketStatus === 'weak' ? 'WEAK_GPS' : 'OFFLINE'} 
                  text={socketStatus === 'live' ? `LIVE · ${secondsAgo}s ago` : socketStatus === 'weak' ? 'Signal Weak' : 'Reconnecting...'}
                  size="sm"
                />
              </div>

              {/* Dynamic ETA Banner */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '16px 20px',
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 1fr',
                  gap: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  marginBottom: '18px'
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                    Estimated Arrival
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: '#38bdf8', marginTop: '2px', letterSpacing: '-0.02em' }}>
                    {etaText}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                    Next Stop
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {nextStopName}
                  </div>
                  {distanceToNext !== null && (
                    <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                      ~{distanceToNext.toFixed(1)} km remaining
                    </div>
                  )}
                </div>
              </div>

              {/* Telemetry Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={15} color="#cbd5e1" />
                  </div>
                  <span>Driver: <strong style={{ color: '#ffffff' }}>{tripStatus.driver_name || 'Assigned Driver'}</strong></span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontWeight: 700 }}>
                  <Gauge size={16} />
                  <span>{speed} km/h</span>
                </div>
              </div>
            </div>

            {/* Child Boarding Status Card */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '18px 20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    backgroundColor: isStudentBoarded ? '#dcfce7' : '#eff6ff',
                    color: isStudentBoarded ? '#16a34a' : '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {isStudentBoarded ? <UserCheck size={24} /> : <User size={24} />}
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>STUDENT BOARDING STATUS</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                    {tripStatus.student_name || 'Your Child'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Assigned Stop: <strong>{tripStatus.pickup_location || 'Standard Stop'}</strong>
                  </div>
                </div>
              </div>

              <StatusBadge
                status={isStudentBoarded ? 'PICKED_UP' : 'WAITING'}
                text={isStudentBoarded ? '✓ On Board' : 'Waiting'}
              />
            </div>

            {/* Live Interactive Map */}
            {isLoaded && currentLocation && (
              <div className="map-wrapper" style={{ position: 'relative', marginBottom: '18px', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    zIndex: 10,
                    background: 'rgba(255,255,255,0.95)',
                    backdropFilter: 'blur(4px)',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#0f172a'
                  }}
                >
                  <MapPin size={14} color="#2563eb" />
                  <span>Live GPS Stream</span>
                </div>

                {/* Center on Bus Button */}
                <button
                  onClick={handleCenterOnBus}
                  style={{
                    position: 'absolute',
                    bottom: '20px',
                    right: '12px',
                    zIndex: 10,
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '999px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Compass size={15} /> Center on Bus
                </button>

                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={currentLocation}
                  zoom={15}
                  options={mapOptions}
                  onLoad={(map) => { mapRef.current = map; }}
                >
                  {/* Route Polyline */}
                  {polylinePath.length > 1 && (
                    <Polyline
                      path={polylinePath}
                      options={{
                        strokeColor: '#2563eb',
                        strokeOpacity: 0.85,
                        strokeWeight: 4
                      }}
                    />
                  )}

                  {/* Route Stop Markers */}
                  {routeStops.map((stop, idx) => {
                    if (typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number') return null;
                    const isPassed = (stop.order || 0) < currentStopOrder;
                    const isNext = (stop.order || 0) === (currentStopOrder + 1);

                    return (
                      <Marker
                        key={stop._id || idx}
                        position={{ lat: stop.latitude, lng: stop.longitude }}
                        title={`${stop.order}. ${stop.name}`}
                        icon={{
                          path: window.google.maps.SymbolPath.CIRCLE,
                          scale: isNext ? 8 : 6,
                          fillColor: isPassed ? '#94a3b8' : isNext ? '#f59e0b' : '#2563eb',
                          fillOpacity: 1,
                          strokeWeight: 2,
                          strokeColor: '#ffffff'
                        }}
                      />
                    );
                  })}

                  {/* Moving Bus Marker with Heading */}
                  <Marker
                    position={currentLocation}
                    icon={createBusSvgIcon(heading)}
                    onClick={() => setSelectedMarker(tripStatus)}
                  />

                  {selectedMarker && (
                    <InfoWindow
                      position={currentLocation}
                      onCloseClick={() => setSelectedMarker(null)}
                    >
                      <div style={{ padding: '6px 8px', maxWidth: '200px', color: '#0f172a' }}>
                        <div style={{ fontWeight: 800, fontSize: '14px' }}>{tripStatus.bus_number}</div>
                        <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>🟢 Broadcasting Live</div>
                        <div style={{ fontSize: '12px', marginTop: '4px' }}>Speed: {speed} km/h</div>
                        <div style={{ fontSize: '12px' }}>ETA: {etaText}</div>
                      </div>
                    </InfoWindow>
                  )}
                </GoogleMap>
              </div>
            )}

            {loadError && <div className="error-message">Unable to load Google Maps. Check API key.</div>}

            {/* Dynamic QR Boarding Pass Card */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                textAlign: 'center',
                marginBottom: '18px'
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <QrCode size={18} color="#2563eb" /> Student Boarding Pass
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 18px 0' }}>
                Show this dynamic pass to the driver scanner when getting on the bus
              </p>

              <div
                style={{
                  background: '#f8fafc',
                  border: '2px dashed #cbd5e1',
                  borderRadius: '16px',
                  padding: '20px',
                  display: 'inline-block',
                  margin: '0 auto 16px'
                }}
              >
                <QRCodeSVG
                  value={tripStatus.qr_code || 'loading...'}
                  size={180}
                  level="M"
                  includeMargin={true}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700
                  }}
                >
                  {countdown}
                </span>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                  Auto-refreshes in {countdown}s for security
                </span>
              </div>
            </div>

            {/* Route Stop Progression Card */}
            {routeStops.length > 0 && (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  padding: '20px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}
              >
                <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Navigation size={16} color="#2563eb" /> Route Stops Progression
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {routeStops.map((stop, i) => {
                    const isPassed = (stop.order || 0) < currentStopOrder;
                    const isNext = (stop.order || 0) === (currentStopOrder + 1);

                    return (
                      <div
                        key={stop._id || i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: isNext ? '#eff6ff' : isPassed ? '#f8fafc' : '#ffffff',
                          border: isNext ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                          borderRadius: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: isPassed ? '#10b981' : isNext ? '#2563eb' : '#cbd5e1',
                              color: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '11px',
                              fontWeight: 700
                            }}
                          >
                            {isPassed ? '✓' : stop.order || (i + 1)}
                          </span>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: isNext ? 800 : 600, color: isNext ? '#1e40af' : '#0f172a' }}>
                              {stop.name}
                            </div>
                            {stop.address && <div style={{ fontSize: '11px', color: '#64748b' }}>{stop.address}</div>}
                          </div>
                        </div>

                        {isPassed && <StatusBadge status="COMPLETED" text="Passed" size="sm" pulse={false} />}
                        {isNext && <StatusBadge status="ACTIVE" text="Next Stop" size="sm" pulse={true} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={Clock}
            title="No Active Bus Trip"
            description="The assigned bus is not currently running an active route. Live movement and arrival ETA will appear as soon as the driver starts the journey."
          />
        )}
      </div>

      {/* Logout Confirmation Modal */}
      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="Confirm Sign Out"
        message="Are you sure you want to log out of the parent portal?"
        confirmLabel="Sign Out"
        type="danger"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      {/* Notifications Drawer */}
      {showNotifications && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.5)',
              backdropFilter: 'blur(3px)',
              zIndex: 999
            }}
            onClick={() => setShowNotifications(false)}
          />
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              maxWidth: '380px',
              backgroundColor: '#ffffff',
              boxShadow: '-10px 0 25px rgba(0,0,0,0.15)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideUp 0.2s ease-out'
            }}
          >
            <div
              style={{
                padding: '18px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bell size={18} color="#2563eb" /> Notifications ({notifications.length})
              </h3>
              <button
                onClick={() => setShowNotifications(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {notifications.length === 0 ? (
                <EmptyState
                  icon={Bell}
                  title="All caught up"
                  description="You have no notifications yet. Real-time updates about bus proximity and boarding will appear here."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {notifications.map((n, i) => {
                    const style = getNotifIcon(n.type);
                    return (
                      <div
                        key={n._id || i}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '12px',
                          backgroundColor: n.read ? '#ffffff' : '#f0fdf4',
                          border: `1px solid ${n.read ? '#e2e8f0' : '#86efac'}`,
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px'
                        }}
                      >
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: style.bg,
                            color: style.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            fontSize: '13px'
                          }}
                        >
                          {style.icon}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: n.read ? 500 : 700, color: '#0f172a', lineHeight: 1.4 }}>
                            {n.message}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                            {new Date(n.created_at).toLocaleString([], {
                              month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })}
                          </div>
                        </div>
                        {!n.read && (
                          <button
                            onClick={() => markAsRead(n._id)}
                            style={{
                              background: '#2563eb',
                              border: 'none',
                              color: '#ffffff',
                              borderRadius: '50%',
                              width: '22px',
                              height: '22px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              flexShrink: 0
                            }}
                            title="Mark as read"
                          >
                            <Check size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ParentDashboard;
