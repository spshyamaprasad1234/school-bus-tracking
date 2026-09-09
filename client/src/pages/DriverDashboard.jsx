import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
import { 
  MapPin, LogOut, Play, Square, QrCode, Camera, UserCheck, Users, 
  AlertTriangle, Clock, X, RotateCcw, AlertOctagon, Compass, Gauge, 
  Radio, ShieldAlert, CheckCircle2, ChevronRight 
} from 'lucide-react';
import { driverAPI, tripAPI } from '../api';
import { clearAuth } from '../auth';
import { useToast } from '../App';
import { connectSocket, emitLocationUpdate, emitDriverSOS, onTripEnded } from '../socket';
import gsap from 'gsap';
import QRScanner from '../components/QRScanner';

const mapContainerStyle = { width: '100%', height: '320px', borderRadius: '12px' };
const defaultCenter = { lat: 40.7128, lng: -74.0060 };
const mapOptions = { disableDefaultUI: false, zoomControl: true, streetViewControl: false, mapTypeControl: false, fullscreenControl: true };

const getHeadingDirection = (heading) => {
  if (heading == null || isNaN(heading)) return 'N';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((heading % 360) / 45)) % 8;
  return directions[index];
};

function DriverDashboard() {
  const [busInfo, setBusInfo] = useState({});
  const [tripDetails, setTripDetails] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationHistory, setLocationHistory] = useState([]);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [currentHeading, setCurrentHeading] = useState(0);
  
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [manualQRInput, setManualQRInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const restartTimerRef = useRef(null);

  const [showDelayModal, setShowDelayModal] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState(15);
  const [delayReason, setDelayReason] = useState('');

  const [showSOSModal, setShowSOSModal] = useState(false);
  const [sosReason, setSosReason] = useState('Breakdown');
  const [customSosText, setCustomSosText] = useState('');
  const [sosActive, setSosActive] = useState(false);
  const [isSendingSOS, setIsSendingSOS] = useState(false);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [timer, setTimer] = useState(0);
  
  const navigate = useNavigate();
  const toast = useToast();
  const contentRef = useRef(null);
  const timerRef = useRef(null);
  const watcherRef = useRef(null);
  const lastEmitRef = useRef(0);
  const activeTripRef = useRef(null);
  const isProcessingRef = useRef(false);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

  const loadData = useCallback(async () => {
    try {
      const [busRes, tripRes] = await Promise.all([
        driverAPI.getBusInfo(),
        driverAPI.getTripDetails()
      ]);
      setBusInfo(busRes.data || {});
      setTripDetails(tripRes.data);
      if (tripRes.data?._id) {
        setActiveTrip({ id: tripRes.data._id, startTime: tripRes.data.started_at });
        if (tripRes.data.emergency?.is_active) {
          setSosActive(true);
        }
      }
      if (tripRes.data?.current_lat && tripRes.data?.current_lng) {
        const newLoc = { lat: tripRes.data.current_lat, lng: tripRes.data.current_lng };
        setCurrentLocation(newLoc);
        setLocationHistory(prev => [...prev.slice(-50), newLoc]);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    connectSocket();
    let isMounted = true;

    const initialize = async () => {
      try {
        const [busRes, tripRes] = await Promise.all([
          driverAPI.getBusInfo(),
          driverAPI.getTripDetails()
        ]);
        if (!isMounted) return;
        setBusInfo(busRes.data || {});
        setTripDetails(tripRes.data);
        if (tripRes.data?._id) {
          setActiveTrip({ id: tripRes.data._id, startTime: tripRes.data.started_at });
          if (tripRes.data.emergency?.is_active) {
            setSosActive(true);
          }
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

    initialize();
    const dataInterval = setInterval(loadData, 5000);

    const unsubEnded = onTripEnded((data) => {
      if (data.tripId === activeTripRef.current) {
        setActiveTrip(null);
        setTripDetails(null);
        setLocationHistory([]);
        setTimer(0);
        setSosActive(false);
        toast.info('Trip has ended');
      }
    });

    return () => {
      isMounted = false;
      clearInterval(dataInterval);
      clearInterval(timerRef.current);
      unsubEnded();
      if (watcherRef.current) {
        navigator.geolocation.clearWatch(watcherRef.current);
        watcherRef.current = null;
      }
    };
  }, [loadData, toast]);

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
      return;
    }

    timerRef.current = setInterval(() => {
      setTimer(t => t + 1);
    }, 1000);

    watcherRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude: lat, longitude: lng, speed, heading, accuracy } = position.coords;
        const newLoc = { lat, lng };
        setCurrentLocation(newLoc);
        setLocationHistory(prev => [...prev.slice(-50), newLoc]);
        setGpsAccuracy(accuracy);
        
        // Convert speed from m/s to km/h if available
        const kmh = speed != null && speed > 0 ? Math.round(speed * 3.6) : 0;
        setCurrentSpeed(kmh);
        if (heading != null && !isNaN(heading)) {
          setCurrentHeading(Math.round(heading));
        }

        const now = Date.now();
        if (now - lastEmitRef.current >= 4000) {
          lastEmitRef.current = now;
          emitLocationUpdate({
            tripId: activeTrip.id,
            lat,
            lng,
            speed: kmh,
            heading: heading || 0,
            accuracy: accuracy || 10
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
  }, [activeTrip, toast]);

  const handleStartTrip = async () => {
    const busId = busInfo._id || busInfo.bus_id;
    const routeId = busInfo.route_id?._id || busInfo.route_id;
    if (!busId) {
      toast.error('No bus assigned. Please contact school administration.');
      return;
    }
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 10000
        });
      });
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      const res = await driverAPI.startTrip({ busId, routeId, lat, lng });
      setActiveTrip({ id: res.data.tripId });
      setCurrentLocation({ lat, lng });
      setLocationHistory([{ lat, lng }]);
      setGpsAccuracy(accuracy);
      setSosActive(false);
      connectSocket();
      toast.success('Trip started! Live tracking active.');
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
      setSosActive(false);
      toast.success('Trip ended successfully');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to end trip');
    }
  };

  const handleTriggerSOS = async () => {
    if (!activeTrip) return;
    const finalReason = sosReason === 'Other' ? (customSosText.trim() || 'Driver Emergency SOS') : sosReason;
    setIsSendingSOS(true);
    try {
      const payload = {
        reason: finalReason,
        lat: currentLocation?.lat,
        lng: currentLocation?.lng,
        severity: 'CRITICAL'
      };

      await tripAPI.triggerSOS(activeTrip.id, payload);
      emitDriverSOS({
        tripId: activeTrip.id,
        ...payload
      });

      setSosActive(true);
      setShowSOSModal(false);
      toast.error('🚨 EMERGENCY SOS SENT! School administration and parents alerted.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send SOS signal');
    } finally {
      setIsSendingSOS(false);
    }
  };

  const performScan = useCallback(async (qrCode) => {
    if (!activeTrip || !qrCode || isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsScanning(false);
    try {
      const res = await driverAPI.scanQR({ tripId: activeTrip.id, qrCode });
      setScanResult(res.data);
      setManualQRInput('');
      toast.success(`${res.data.student_name} checked in!`);
      loadData();
      if (navigator.vibrate) navigator.vibrate(200);
      restartTimerRef.current = setTimeout(() => {
        setScanResult(null);
        setShowManualInput(false);
        isProcessingRef.current = false;
        setIsScanning(true);
      }, 3000);
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Scan failed';
      setScanResult({ error: errMsg });
      toast.error(errMsg);
      restartTimerRef.current = setTimeout(() => {
        setScanResult(null);
        isProcessingRef.current = false;
        setIsScanning(true);
      }, 3000);
    }
  }, [activeTrip, toast, loadData]);

  const handleCameraScan = useCallback((decodedText) => {
    performScan(decodedText);
  }, [performScan]);

  const handleCameraError = useCallback((errMsg) => {
    toast.error(errMsg || 'Camera error');
    setIsScanning(false);
    isProcessingRef.current = false;
  }, [toast]);

  const handleManualScan = async () => {
    if (!activeTrip || !manualQRInput.trim()) {
      setScanResult({ error: 'Please enter the QR code' });
      return;
    }
    await performScan(manualQRInput.trim());
  };

  const handleStartScanner = () => {
    setShowQRScanner(true);
    setScanResult(null);
    setShowManualInput(false);
    isProcessingRef.current = false;
    setIsScanning(true);
  };

  const handleStopScanner = () => {
    setShowQRScanner(false);
    setScanResult(null);
    setIsScanning(false);
    isProcessingRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
    };
  }, []);

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
  const routeStops = tripDetails?.route_id?.stops || busInfo.route_id?.stops || [];
  const nextStopOrder = tripDetails?.next_stop_order ?? 1;

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

      <div className="content" ref={contentRef} style={{ maxWidth: 850, margin: '0 auto', paddingBottom: 40 }}>
        {/* Active SOS Warning Banner */}
        {sosActive && (
          <div style={{
            background: '#fef2f2',
            border: '2px solid #ef4444',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            animation: 'pulse 2s infinite'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ShieldAlert size={28} color="#ef4444" />
              <div>
                <strong style={{ color: '#b91c1c', fontSize: 16 }}>EMERGENCY SOS BROADCAST ACTIVE</strong>
                <p style={{ margin: 0, fontSize: 13, color: '#7f1d1d' }}>
                  School dispatch and parents have been notified. Stay calm and ensure student safety.
                </p>
              </div>
            </div>
            <span className="badge badge-danger" style={{ animation: 'bounce 1s infinite' }}>CRITICAL ALERT</span>
          </div>
        )}

        {!busInfo.bus_number ? (
          <div className="no-assignment-card">
            <AlertTriangle size={36} />
            <h4>No Assignment Yet</h4>
            <p>You have not been assigned a bus or route. Please contact your school administrator.</p>
          </div>
        ) : (
          <>
            {/* Bus Info & Telemetry Header */}
            <div className="bus-info-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div className="info-item"><label>Bus Number</label><span>{busInfo.bus_number}</span></div>
              <div className="info-item"><label>License Plate</label><span>{busInfo.license_plate || '—'}</span></div>
              <div className="info-item"><label>Route</label><span>{busInfo.route_name || busInfo.route_id?.name || '—'}</span></div>
              <div className="info-item">
                <label>GPS Signal</label>
                <span>
                  {gpsAccuracy == null ? (
                    <span style={{ color: 'var(--gray-400)' }}>Standby</span>
                  ) : gpsAccuracy <= 15 ? (
                    <span style={{ color: '#16a34a', fontWeight: 600 }}>🟢 High (±{Math.round(gpsAccuracy)}m)</span>
                  ) : gpsAccuracy <= 50 ? (
                    <span style={{ color: '#ca8a04', fontWeight: 600 }}>🟡 Med (±{Math.round(gpsAccuracy)}m)</span>
                  ) : (
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>🔴 Weak (±{Math.round(gpsAccuracy)}m)</span>
                  )}
                </span>
              </div>
            </div>

            {/* Real-Time Telemetry Bar when Trip is Active */}
            {activeTrip && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: 12,
                marginTop: 12,
                marginBottom: 16
              }}>
                <div style={{ background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Gauge size={20} color="#6366f1" />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', fontWeight: 600 }}>Speed</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>{currentSpeed} <span style={{ fontSize: 12, fontWeight: 400 }}>km/h</span></div>
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Compass size={20} color="#0ea5e9" />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', fontWeight: 600 }}>Heading</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>{getHeadingDirection(currentHeading)} <span style={{ fontSize: 12, fontWeight: 400 }}>({currentHeading}°)</span></div>
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Users size={20} color="#10b981" />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', fontWeight: 600 }}>On Board</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>{checkinCount} <span style={{ fontSize: 12, fontWeight: 400 }}>passengers</span></div>
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Radio size={20} color="#f59e0b" />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', fontWeight: 600 }}>Trip Duration</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>{formatTime(timer)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Trip Controls Card */}
            <div className="trip-controls-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
              {!activeTrip ? (
                <button className="btn btn-success btn-lg" onClick={handleStartTrip} style={{ width: '100%', padding: '14px 20px' }}>
                  <Play size={20} /> Start Live Trip
                </button>
              ) : (
                <>
                  <button className="btn btn-primary" onClick={handleStartScanner} style={{ flex: 1, minWidth: 120 }}>
                    <QrCode size={16} /> Scan QR Pass
                  </button>
                  <button className="btn btn-warning" onClick={() => setShowDelayModal(true)}>
                    <Clock size={16} /> Delay
                  </button>
                  <button 
                    className="btn" 
                    onClick={() => setShowSOSModal(true)} 
                    style={{ background: '#dc2626', color: '#fff', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <AlertOctagon size={16} /> SOS Emergency
                  </button>
                  <button className="btn btn-danger" onClick={handleEndTrip}>
                    <Square size={16} /> End Trip
                  </button>
                </>
              )}
            </div>

            {/* Route Stop Progression Card */}
            {activeTrip && routeStops.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 18, marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MapPin size={16} color="#6366f1" /> Route Stop Progression
                </h4>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
                  {routeStops.map((stop, idx) => {
                    const stopOrder = stop.order ?? (idx + 1);
                    const isPassed = stopOrder < nextStopOrder;
                    const isCurrent = stopOrder === nextStopOrder;
                    return (
                      <div 
                        key={idx}
                        style={{
                          flex: '0 0 auto',
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: isCurrent ? '#eff6ff' : isPassed ? '#f8fafc' : '#ffffff',
                          border: `1.5px solid ${isCurrent ? '#2563eb' : isPassed ? '#cbd5e1' : '#e2e8f0'}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        {isPassed ? (
                          <CheckCircle2 size={14} color="#10b981" />
                        ) : (
                          <span style={{ 
                            width: 18, 
                            height: 18, 
                            borderRadius: '50%', 
                            background: isCurrent ? '#2563eb' : '#94a3b8', 
                            color: '#fff', 
                            fontSize: 11, 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            fontWeight: 700
                          }}>
                            {stopOrder}
                          </span>
                        )}
                        <span style={{ fontSize: 13, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? '#1e40af' : isPassed ? '#64748b' : '#334155' }}>
                          {stop.name}
                        </span>
                        {idx < routeStops.length - 1 && <ChevronRight size={14} color="#94a3b8" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!activeTrip && (
              <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: 24, textAlign: 'center', color: 'var(--gray-400)', fontSize: 14, marginBottom: 16 }}>
                Start a trip to begin broadcasting GPS coordinates to school administration and parents.
              </div>
            )}

            {/* QR Scanner Modal / View */}
            {showQRScanner && activeTrip && (
              <div className="qr-scanner-card" style={{ marginBottom: 16 }}>
                {isScanning && !scanResult && (
                  <QRScanner
                    onScan={handleCameraScan}
                    onClose={handleStopScanner}
                    onError={handleCameraError}
                  />
                )}

                {!isScanning && !scanResult && (
                  <div className="qr-scanner-start">
                    <Camera size={36} />
                    <h4>Camera Scanner</h4>
                    <p>Point camera at student QR boarding pass on parent phone.</p>
                    <button className="btn btn-primary btn-lg" onClick={() => setIsScanning(true)}>
                      <Camera size={18} /> Start Camera
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => setShowManualInput(!showManualInput)} style={{ marginTop: 8 }}>
                      {showManualInput ? 'Hide' : 'Type QR Code Manually'}
                    </button>
                  </div>
                )}

                {showManualInput && (
                  <div className="qr-input-row" style={{ marginTop: 12 }}>
                    <input
                      type="text"
                      placeholder="Paste or type QR code token..."
                      value={manualQRInput}
                      onChange={(e) => { setManualQRInput(e.target.value); setScanResult(null); }}
                    />
                    <button onClick={handleManualScan} className="btn btn-primary">Verify</button>
                  </div>
                )}

                {scanResult && (
                  <div className="qr-scanner-result">
                    <div className={`scan-result-banner ${scanResult.error ? 'error' : 'success'}`}>
                      {scanResult.error ? (
                        <><X size={18} /><span>{scanResult.error}</span></>
                      ) : (
                        <><UserCheck size={18} /><div><strong>{scanResult.student_name}</strong><span className="scan-pickup">{scanResult.pickup_location}</span></div></>
                      )}
                    </div>
                    {!scanResult.error && (
                      <div className="scan-auto-restart">
                        <RotateCcw size={14} /> Ready for next student scan...
                      </div>
                    )}
                  </div>
                )}

                {!isScanning && !scanResult && !showManualInput && (
                  <div className="qr-scanner-close-row">
                    <button className="btn btn-danger btn-sm" onClick={handleStopScanner}>
                      <X size={16} /> Close Scanner
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Boarded Students List */}
            {activeTrip && checkinCount > 0 && (
              <div className="checkins-card" style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 16, marginBottom: 12 }}><Users size={18} /> Students On Board ({checkinCount})</h3>
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

            {/* Live Driver Map View */}
            {isLoaded && (
              <div className="map-wrapper" style={{ marginTop: 10, background: '#fff', padding: 12, borderRadius: 14, border: '1px solid var(--gray-200)' }}>
                <div className="map-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={16} /> Live GPS Stream</h3>
                  {activeTrip && <span className="badge badge-success">Broadcasting Live</span>}
                </div>
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={currentLocation || defaultCenter}
                  zoom={15}
                  options={mapOptions}
                >
                  {currentLocation && (
                    <Marker 
                      position={currentLocation} 
                      label={{ text: '🚌', fontSize: '18px' }} 
                    />
                  )}
                  {locationHistory.length > 1 && (
                    <Polyline
                      path={locationHistory}
                      options={{ strokeColor: '#2563eb', strokeOpacity: 0.8, strokeWeight: 4 }}
                    />
                  )}
                </GoogleMap>
                {currentLocation && (
                  <div className="map-coords" style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--gray-500)' }}>
                    <span>Lat: {currentLocation.lat.toFixed(6)}</span>
                    <span>Lng: {currentLocation.lng.toFixed(6)}</span>
                    <span>Speed: {currentSpeed} km/h</span>
                    <span>Heading: {currentHeading}°</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* SOS Emergency Modal */}
      {showSOSModal && (
        <div className="modal-overlay" onClick={() => setShowSOSModal(false)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, borderTop: '4px solid #ef4444' }}>
            <div className="confirm-modal-header" style={{ textAlign: 'center' }}>
              <div className="confirm-icon danger" style={{ margin: '0 auto 12px' }}><AlertOctagon size={32} /></div>
              <h3 style={{ color: '#b91c1c', margin: '0 0 6px 0' }}>Trigger Emergency SOS</h3>
              <p style={{ color: '#4b5563', fontSize: 13 }}>
                This will instantly alert school administrators and broadcast an emergency alert to all connected parents.
              </p>
            </div>

            <div style={{ margin: '16px 0' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#374151' }}>
                Select Emergency Reason
              </label>
              <select 
                value={sosReason} 
                onChange={e => setSosReason(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, marginBottom: 10 }}
              >
                <option value="Breakdown">Vehicle Breakdown / Engine Stall</option>
                <option value="Accident">Traffic / Road Collision</option>
                <option value="Medical">Medical Emergency On Board</option>
                <option value="Security">Security / Safety Danger</option>
                <option value="Weather / Road Block">Severe Weather / Road Blocked</option>
                <option value="Other">Other Reason...</option>
              </select>

              {sosReason === 'Other' && (
                <input
                  type="text"
                  placeholder="Describe emergency details..."
                  value={customSosText}
                  onChange={e => setCustomSosText(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}
                />
              )}
            </div>

            <div className="confirm-modal-actions" style={{ display: 'flex', gap: 10 }}>
              <button className="cancel-btn" onClick={() => setShowSOSModal(false)} disabled={isSendingSOS}>
                Cancel
              </button>
              <button 
                className="confirm-btn" 
                onClick={handleTriggerSOS} 
                disabled={isSendingSOS}
                style={{ background: '#dc2626', color: '#fff' }}
              >
                {isSendingSOS ? 'Broadcasting...' : '🚨 Confirm SOS Broadcast'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Delay Notification Modal */}
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
                <textarea value={delayReason} onChange={e => setDelayReason(e.target.value)} placeholder="e.g. Traffic, road construction, weather..." />
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

