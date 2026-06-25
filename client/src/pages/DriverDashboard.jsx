import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
import { Bus, MapPin, Navigation, LogOut, Play, Square, QrCode, Camera, UserCheck, Users, AlertTriangle, Clock, X, ChevronDown } from 'lucide-react';
import { driverAPI } from '../api';
import { clearAuth } from '../auth';
import { useToast } from '../App';
import { connectSocket, disconnectSocket, emitLocationUpdate, onTripEnded } from '../socket';
import gsap from 'gsap';

const mapContainerStyle = { width: '100%', height: '300px' };
const defaultCenter = { lat: 40.7128, lng: -74.0060 };
const mapOptions = { disableDefaultUI: false, zoomControl: true, streetViewControl: false, mapTypeControl: false, fullscreenControl: true };

function DriverDashboard() {
  const [busInfo, setBusInfo] = useState({});
  const [tripDetails, setTripDetails] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationHistory, setLocationHistory] = useState([]);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [manualQRInput, setManualQRInput] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [showDelayModal, setShowDelayModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState(15);
  const [delayReason, setDelayReason] = useState('');
  const [timer, setTimer] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();
  const contentRef = useRef(null);
  const timerRef = useRef(null);
  const watcherRef = useRef(null);
  const lastEmitRef = useRef(0);
  const activeTripRef = useRef(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

  useEffect(() => {
    const socket = connectSocket();
    loadData();
    const dataInterval = setInterval(loadData, 5000);

    const unsubEnded = onTripEnded((data) => {
      if (data.tripId === activeTripRef.current) {
        setActiveTrip(null);
        setTripDetails(null);
        setLocationHistory([]);
        setTimer(0);
        toast.info('Trip has ended');
      }
    });

    return () => {
      clearInterval(dataInterval);
      clearInterval(timerRef.current);
      unsubEnded();
      if (watcherRef.current) {
        navigator.geolocation.clearWatch(watcherRef.current);
        watcherRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    gsap.fromTo(contentRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.4, ease: 'power2.out' }
    );
  }, []);

  useEffect(() => {
    activeTripRef.current = activeTrip?.id;

    if (!activeTrip) {
      if (watcherRef.current) {
        navigator.geolocation.clearWatch(watcherRef.current);
        watcherRef.current = null;
      }
      clearInterval(timerRef.current);
      setTimer(0);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimer(t => t + 1);
    }, 1000);

    watcherRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude: lat, longitude: lng, speed } = position.coords;
        const newLoc = { lat, lng };
        setCurrentLocation(newLoc);
        setLocationHistory(prev => [...prev.slice(-50), newLoc]);

        const now = Date.now();
        if (now - lastEmitRef.current >= 5000) {
          lastEmitRef.current = now;
          emitLocationUpdate({
            tripId: activeTrip.id,
            lat,
            lng,
            speed: speed || 0,
            heading: position.coords.heading || 0
          });
        }
      },
      (err) => {
        console.error('Geolocation error:', err.message);
        toast.error('Unable to get GPS location. Check permissions.');
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    return () => {
      if (watcherRef.current) {
        navigator.geolocation.clearWatch(watcherRef.current);
        watcherRef.current = null;
      }
      clearInterval(timerRef.current);
    };
  }, [activeTrip]);

  const loadData = async () => {
    try {
      const [busRes, tripRes] = await Promise.all([
        driverAPI.getBusInfo(),
        driverAPI.getTripDetails()
      ]);
      setBusInfo(busRes.data || {});
      setTripDetails(tripRes.data);
      if (tripRes.data?._id) {
        setActiveTrip({ id: tripRes.data._id, startTime: tripRes.data.started_at });
      }
      if (tripRes.data?.current_lat && tripRes.data?.current_lng) {
        const newLoc = { lat: tripRes.data.current_lat, lng: tripRes.data.current_lng };
        setCurrentLocation(newLoc);
        setLocationHistory(prev => [...prev.slice(-50), newLoc]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartTrip = async () => {
    const { bus_id, route_id } = busInfo;
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 10000
        });
      });
      const { latitude: lat, longitude: lng } = pos.coords;
      const res = await driverAPI.startTrip({ busId: bus_id, routeId: route_id, lat, lng });
      setActiveTrip({ id: res.data.tripId });
      setCurrentLocation({ lat, lng });
      setLocationHistory([{ lat, lng }]);
      connectSocket();
      toast.success('Trip started!');
      loadData();
    } catch (err) {
      if (err.code === 1) {
        toast.error('GPS permission denied. Please enable location access.');
      } else {
        toast.error(err.response?.data?.error || 'Failed to start trip');
      }
    }
  };

  const handleEndTrip = async () => {
    if (!activeTrip) return;
    try {
      await driverAPI.endTrip({ tripId: activeTrip.id });
      setActiveTrip(null);
      setTripDetails(null);
      setLocationHistory([]);
      setTimer(0);
      toast.success('Trip ended successfully');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to end trip');
    }
  };

  const handleScanQR = async () => {
    if (!activeTrip || !manualQRInput.trim()) {
      setScanResult({ error: 'Please enter the QR code' });
      return;
    }
    try {
      const res = await driverAPI.scanQR({ tripId: activeTrip.id, qrCode: manualQRInput.trim() });
      setScanResult(res.data);
      setManualQRInput('');
      toast.success(`${res.data.student_name} checked in!`);
      loadData();
    } catch (err) {
      setScanResult({ error: err.response?.data?.error || 'Scan failed' });
      toast.error(err.response?.data?.error || 'Scan failed');
    }
  };

  const handleNotifyDelay = async () => {
    if (!activeTrip) return;
    try {
      await driverAPI.notifyDelay({ tripId: activeTrip.id, delayMinutes, reason: delayReason });
      setShowDelayModal(false);
      setDelayMinutes(15);
      setDelayReason('');
      toast.success('Delay notification sent to all parents');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send notification');
    }
  };

  const handleLogout = () => setShowLogoutConfirm(true);
  const confirmLogout = () => {
    gsap.to(contentRef.current, {
      opacity: 0, x: -50, duration: 0.25,
      onComplete: () => { clearAuth(); navigate('/login'); }
    });
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const checkinCount = tripDetails?.check_ins?.length || 0;

  return (
    <div className="driver-dashboard">
      <nav>
        <div className="nav-section nav-left"></div>
        <div className="nav-section nav-center">
          <h2>Driver Dashboard</h2>
        </div>
        <div className="nav-section nav-right">
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </nav>

      <div className="content" ref={contentRef} style={{ maxWidth: 800, margin: '0 auto' }}>
        {!busInfo.bus_number ? (
          <div className="no-assignment-card">
            <AlertTriangle size={36} />
            <h4>No Assignment Yet</h4>
            <p>You have not been assigned a bus or route. Please contact your school administrator.</p>
          </div>
        ) : (
          <>
            <div className="bus-info-card">
              <div className="info-item"><label>Bus Number</label><span>{busInfo.bus_number}</span></div>
              <div className="info-item"><label>License Plate</label><span>{busInfo.license_plate || '—'}</span></div>
              <div className="info-item"><label>Model</label><span>{busInfo.model || '—'}</span></div>
              <div className="info-item"><label>Route</label><span>{busInfo.route_name || '—'}</span></div>
            </div>

            <div className="trip-controls-card">
              {!activeTrip ? (
                <button className="btn btn-success btn-lg" onClick={handleStartTrip} style={{ width: '100%' }}>
                  <Play size={20} /> Start Trip
                </button>
              ) : (
                  <>
                  <button className="btn btn-primary" onClick={() => { setShowQRScanner(!showQRScanner); setScanResult(null); }}>
                    <QrCode size={16} /> {showQRScanner ? 'Hide Scanner' : 'Scan QR'}
                  </button>
                  <button className="btn btn-warning" onClick={() => setShowDelayModal(true)}>
                    <Clock size={16} /> Delay
                  </button>
                  <button className="btn btn-danger" onClick={handleEndTrip}>
                    <Square size={16} /> End Trip
                  </button>
                  <div className="trip-timer">
                    <span className="timer-dot"></span>
                    {formatTime(timer)}
                  </div>
                </>
              )}
            </div>

            {!activeTrip && (
              <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: 24, textAlign: 'center', color: 'var(--gray-400)', fontSize: 14 }}>
                Start a trip to begin tracking the bus location and scanning student QR codes.
              </div>
            )}

            {showQRScanner && activeTrip && (
              <div className="qr-scanner-card">
                <h3><Camera size={20} /> QR Boarding Scanner</h3>
                <div className="qr-input-row">
                  <input
                    type="text"
                    placeholder="Paste or type QR code from parent's phone..."
                    value={manualQRInput}
                    onChange={(e) => { setManualQRInput(e.target.value); setScanResult(null); }}
                  />
                  <button onClick={handleScanQR} className="btn btn-primary">Scan</button>
                </div>
                {scanResult && (
                  <div className={`scan-result-banner ${scanResult.error ? 'error' : 'success'}`}>
                    {scanResult.error ? (
                      <><X size={18} />{scanResult.error}</>
                    ) : (
                      <><UserCheck size={18} /><strong>{scanResult.student_name}</strong> picked up at {scanResult.pickup_location}</>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTrip && checkinCount > 0 && (
              <div className="checkins-card">
                <h3><Users size={18} /> Students On Board ({checkinCount})</h3>
                {tripDetails.check_ins.map((checkIn, index) => (
                  <div key={index} className="checkin-item">
                    <div className="checkin-avatar">
                      {checkIn.student_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="checkin-info">
                      <div className="checkin-name">{checkIn.student_name}</div>
                      <div className="checkin-location">{checkIn.pickup_location}</div>
                    </div>
                    <span className="checkin-time">
                      {new Date(checkIn.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {isLoaded && (
              <div className="map-wrapper" style={{ marginTop: 10 }}>
                <div className="map-header">
                  <h3><MapPin size={16} /> Live Location</h3>
                  {activeTrip && <span className="badge badge-success">Live</span>}
                </div>
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={currentLocation || defaultCenter}
                  zoom={14}
                  options={mapOptions}
                >
                  {currentLocation && <Marker position={currentLocation} label="B" />}
                  {locationHistory.length > 1 && (
                    <Polyline
                      path={locationHistory}
                      options={{ strokeColor: '#6366f1', strokeOpacity: 0.7, strokeWeight: 3 }}
                    />
                  )}
                </GoogleMap>
                {currentLocation && (
                  <div className="map-coords">
                    <span><MapPin size={12} /> {currentLocation.lat.toFixed(6)}</span>
                    <span><MapPin size={12} /> {currentLocation.lng.toFixed(6)}</span>
                  </div>
                )}
              </div>
            )}
          </>
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

      {showDelayModal && (
        <div className="modal-overlay" onClick={() => setShowDelayModal(false)}>
          <div className="delay-modal" onClick={e => e.stopPropagation()}>
            <div className="delay-modal-header">
              <h3><Clock size={18} /> Notify Delay</h3>
              <button onClick={() => setShowDelayModal(false)}><X size={18} /></button>
            </div>
            <div className="delay-modal-body">
              <div className="form-group">
                <label>Delay (minutes)</label>
                <input type="number" value={delayMinutes} onChange={e => setDelayMinutes(Number(e.target.value))} min={5} max={120} />
              </div>
              <div className="form-group">
                <label>Reason (optional)</label>
                <textarea value={delayReason} onChange={e => setDelayReason(e.target.value)} placeholder="e.g. Traffic, weather conditions..." />
              </div>
              <button onClick={handleNotifyDelay} className="btn btn-warning" style={{ width: '100%' }}>
                Send Notification to Parents
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DriverDashboard;
