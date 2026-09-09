import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, Marker, Polyline, InfoWindow } from '@react-google-maps/api';
import { 
  MapPin, LogOut, Clock, QrCode, Bell, X, Check, AlertTriangle, 
  Navigation, Gauge, Shield, Compass, Phone, User, Activity, AlertOctagon 
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { parentAPI } from '../api';
import { clearAuth } from '../auth';
import { useToast } from '../App';
import { 
  connectSocket, onTripLocationUpdate, onTripEnded, joinTripRoom, 
  onNewNotification, onEmergencyAlert, onEmergencyAcknowledged, getSocket 
} from '../socket';
import gsap from 'gsap';

const mapContainerStyle = { width: '100%', height: '380px', borderRadius: '16px' };
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
  const [etaText, setEtaText] = useState('Calculating...');
  const [distanceToNext, setDistanceToNext] = useState(null);
  const [nextStopName, setNextStopName] = useState('');
  const [currentStopOrder, setCurrentStopOrder] = useState(0);
  const [isDeviated, setIsDeviated] = useState(false);
  const [emergency, setEmergency] = useState(null);
  
  // Connection diagnostics
  const [socketStatus, setSocketStatus] = useState('connecting'); // 'live' | 'reconnecting' | 'offline'
  const [lastUpdatedTime, setLastUpdatedTime] = useState(Date.now());
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
  const animFrameRef = useRef(null);

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
    if (!currentLocation) {
      setCurrentLocation(targetLocation);
      return;
    }

    let startTime = null;
    const duration = 1000; // 1s smooth animation
    const startLat = currentLocation.lat;
    const startLng = currentLocation.lng;
    const destLat = targetLocation.lat;
    const destLng = targetLocation.lng;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Linear interpolation
      const nextLat = startLat + (destLat - startLat) * progress;
      const nextLng = startLng + (destLng - startLng) * progress;
      setCurrentLocation({ lat: nextLat, lng: nextLng });

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [targetLocation]);

  // Main initial fetch & Socket room setup
  useEffect(() => {
    const socket = connectSocket();
    let isMounted = true;

    if (socket) {
      setSocketStatus(socket.connected ? 'live' : 'reconnecting');
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
          setEtaText(t.eta || 'ETA ~5 min');
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

    // Socket listeners for real-time location & trip events
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
      case 'emergency': return { icon: '🚨', bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' };
      default: return { icon: 'ℹ', bg: 'var(--gray-100)', color: 'var(--gray-500)' };
    }
  };

  // Prepare route stop coordinates for polyline
  const routeStops = tripStatus?.stops || [];
  const polylinePath = useMemo(() => {
    return routeStops
      .filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number')
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(s => ({ lat: s.latitude, lng: s.longitude }));
  }, [routeStops]);

  return (
    <div className="parent-dashboard">
      <nav>
        <div className="nav-section nav-left">
          <button 
            className="logout-btn notification-btn-wrap" 
            onClick={() => { setShowNotifications(true); loadNotifications(); }}
            style={{ position: 'relative' }}
          >
            <Bell size={16} />
            {unreadCount > 0 && <span className="badge-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
        </div>
        <div className="nav-section nav-center">
          <h2>Parent Live Tracking</h2>
        </div>
        <div className="nav-section nav-right">
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </nav>

      <div className="content" ref={contentRef} style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 40 }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div className="spinner spinner-dark" style={{ width: 32, height: 32, margin: '0 auto 16px' }}></div>
            <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>Connecting to bus telemetry...</p>
          </div>
        ) : tripStatus ? (
          <>
            {/* Emergency Alert Banner if Active */}
            {emergency?.is_active && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid #ef4444',
                color: '#ef4444',
                padding: '14px 18px',
                borderRadius: '12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontWeight: 600
              }}>
                <AlertOctagon size={24} />
                <div>
                  <div>EMERGENCY ALERT TRIGGERED</div>
                  <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.9 }}>
                    Driver reported an emergency. School administration has been alerted.
                  </div>
                </div>
              </div>
            )}

            {/* Route Deviation Alert */}
            {isDeviated && !emergency?.is_active && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid #f59e0b',
                color: '#d97706',
                padding: '12px 16px',
                borderRadius: '12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: 13,
                fontWeight: 600
              }}>
                <AlertTriangle size={18} />
                <span>Route Deviation: The bus is currently navigating off the scheduled corridor.</span>
              </div>
            )}

            {/* Uber / Zomato Style Live Tracking Hero Card */}
            <div className="trip-status-card" style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              color: '#ffffff',
              borderRadius: '20px',
              padding: '22px',
              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.3)',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 24 }}>🚌</span>
                    <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px' }}>
                      {tripStatus.bus_number || 'School Bus'}
                    </span>
                    {tripStatus.license_plate && (
                      <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 4, letterSpacing: 0.5 }}>
                        {tripStatus.license_plate}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                    Route: {tripStatus.route_name || 'Standard Route'}
                  </div>
                </div>

                {/* Connection Pill */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: socketStatus === 'live' ? 'rgba(34, 197, 94, 0.2)' : socketStatus === 'weak' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  color: socketStatus === 'live' ? '#4ade80' : socketStatus === 'weak' ? '#fbbf24' : '#f87171',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: 12,
                  fontWeight: 600
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: socketStatus === 'live' ? '#22c55e' : socketStatus === 'weak' ? '#f59e0b' : '#ef4444',
                    display: 'inline-block',
                    animation: socketStatus === 'live' ? 'pulse 2s infinite' : 'none'
                  }}></span>
                  {socketStatus === 'live' ? `LIVE · ${secondsAgo}s ago` : socketStatus === 'weak' ? 'Signal Weak' : 'Reconnecting...'}
                </div>
              </div>

              {/* Main ETA & Stop Metrics Grid */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.06)',
                borderRadius: '14px',
                padding: '16px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: 16
              }}>
                <div>
                  <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Estimated Arrival</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8', marginTop: 2 }}>
                    {etaText}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Next Scheduled Stop</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {nextStopName}
                  </div>
                  {distanceToNext !== null && (
                    <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                      ~{distanceToNext.toFixed(1)} km away
                    </div>
                  )}
                </div>
              </div>

              {/* Telemetry Row: Speed & Driver Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <User size={15} color="#94a3b8" />
                  <span>Driver: <strong>{tripStatus.driver_name || 'Assigned Driver'}</strong></span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8', fontWeight: 600 }}>
                  <Gauge size={15} />
                  <span>{speed} km/h</span>
                </div>
              </div>
            </div>

            {/* Interactive Live Google Map */}
            {isLoaded && currentLocation && (
              <div className="map-wrapper" style={{ position: 'relative', marginBottom: 20 }}>
                <div style={{
                  position: 'absolute', top: 12, left: 12, zIndex: 10,
                  background: 'rgba(255,255,255,0.95)',
                  backdropFilter: 'blur(4px)',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <MapPin size={14} color="#2563eb" />
                  <span>Live Telemetry</span>
                </div>

                {/* Center on Bus Button */}
                <button
                  onClick={handleCenterOnBus}
                  style={{
                    position: 'absolute', bottom: 20, right: 12, zIndex: 10,
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Compass size={14} /> Center on Bus
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
                        strokeColor: '#3b82f6',
                        strokeOpacity: 0.8,
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
                          fillColor: isPassed ? '#94a3b8' : isNext ? '#f59e0b' : '#3b82f6',
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
                      <div style={{ padding: '4px 6px', maxWidth: 200, color: '#0f172a' }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{tripStatus.bus_number}</div>
                        <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>🟢 Active Trip</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>Speed: {speed} km/h</div>
                        <div style={{ fontSize: 12 }}>ETA: {etaText}</div>
                      </div>
                    </InfoWindow>
                  )}
                </GoogleMap>
              </div>
            )}

            {loadError && <div className="error-message">Error loading Google Maps</div>}

            {/* Boarding Pass QR Card */}
            <div className="qr-card">
              <h3><QrCode size={18} /> Student Boarding Pass</h3>
              <p className="qr-subtitle">Present this dynamic code to the driver upon boarding</p>
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

            {/* Route Stops Progression List */}
            {routeStops.length > 0 && (
              <div className="section-card" style={{ marginTop: 20 }}>
                <h3 style={{ fontSize: 15, marginBottom: 14 }}><Navigation size={16} /> Route Progression</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {routeStops.map((stop, i) => {
                    const isPassed = (stop.order || 0) < currentStopOrder;
                    const isNext = (stop.order || 0) === (currentStopOrder + 1);

                    return (
                      <div key={stop._id || i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: isNext ? 'rgba(59, 130, 246, 0.08)' : 'var(--gray-50)',
                        border: isNext ? '1px solid #bfdbfe' : '1px solid var(--gray-100)',
                        borderRadius: 10
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: '50%',
                            background: isPassed ? '#22c55e' : isNext ? '#2563eb' : '#cbd5e1',
                            color: '#ffffff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700
                          }}>
                            {isPassed ? '✓' : stop.order || (i + 1)}
                          </span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: isNext ? 700 : 500 }}>{stop.name}</div>
                            {stop.address && <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{stop.address}</div>}
                          </div>
                        </div>

                        {isPassed && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Passed</span>}
                        {isNext && <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 700 }}>Approaching</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '70px 24px' }}>
            <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Clock size={36} style={{ color: 'var(--gray-400)' }} />
            </div>
            <h3 style={{ color: 'var(--secondary)', fontSize: 18, marginBottom: 8 }}>No Active Trip</h3>
            <p style={{ color: 'var(--gray-400)', fontSize: 14, maxWidth: 340, margin: '0 auto' }}>
              The assigned bus is not currently running an active route. Live movement and ETA will appear as soon as the driver starts the trip.
            </p>
          </div>
        )}
      </div>

      {/* Logout Modal */}
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

      {/* Notification Drawer */}
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

