import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
import { 
  MapPin, LogOut, Play, Square, QrCode, Camera, UserCheck, Users, 
  AlertTriangle, Clock, X, RotateCcw, AlertOctagon, Compass, Gauge, 
  Radio, ShieldAlert, CheckCircle2, ChevronRight, Navigation 
} from 'lucide-react';
import { driverAPI, tripAPI } from '../api';
import { clearAuth } from '../auth';
import { useToast } from '../App';
import { connectSocket, emitLocationUpdate, emitDriverSOS, onTripEnded } from '../socket';
import gsap from 'gsap';
import QRScanner from '../components/QRScanner';
import StatusBadge from '../components/ui/StatusBadge';
import ConfirmModal from '../components/ui/ConfirmModal';
import EmptyState from '../components/ui/EmptyState';

const mapContainerStyle = { width: '100%', height: '320px', borderRadius: '14px' };
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
  const [isStartingTrip, setIsStartingTrip] = useState(false);
  
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [manualQRInput, setManualQRInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const restartTimerRef = useRef(null);

  const [showDelayModal, setShowDelayModal] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState(15);
  const [delayReason, setDelayReason] = useState('');
  const [isSendingDelay, setIsSendingDelay] = useState(false);

  const [showSOSModal, setShowSOSModal] = useState(false);
  const [sosReason, setSosReason] = useState('Breakdown');
  const [customSosText, setCustomSosText] = useState('');
  const [sosActive, setSosActive] = useState(false);
  const [isSendingSOS, setIsSendingSOS] = useState(false);

  const [showEndTripConfirm, setShowEndTripConfirm] = useState(false);
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
      console.error('Driver loadData error:', err);
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
        console.error('Driver init error:', err);
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
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
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
    setIsStartingTrip(true);
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
      toast.success('🚀 Trip started! Live GPS stream active.');
      loadData();
    } catch (err) {
      if (err.code === 1) {
        toast.error('GPS permission denied. Please allow location access.');
      } else {
        toast.error(err.response?.data?.error || 'Failed to start trip');
      }
    } finally {
      setIsStartingTrip(false);
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
      setShowEndTripConfirm(false);
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
      toast.success(`✓ ${res.data.student_name} Checked In!`);
      loadData();
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      restartTimerRef.current = setTimeout(() => {
        setScanResult(null);
        setShowManualInput(false);
        isProcessingRef.current = false;
        setIsScanning(true);
      }, 2500);
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Scan verification failed';
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
      setScanResult({ error: 'Please enter the QR token' });
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
    setIsSendingDelay(true);
    try {
      await driverAPI.notifyDelay({ tripId: activeTrip.id, delayMinutes, reason: delayReason });
      setShowDelayModal(false);
      setDelayMinutes(15);
      setDelayReason('');
      toast.success('Delay notification sent to all parents');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send notification');
    } finally {
      setIsSendingDelay(false);
    }
  };

  const handleLogout = () => setShowLogoutConfirm(true);
  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    clearAuth();
    navigate('/login');
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
    <div className="driver-dashboard" style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Top Header Bar */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #e2e8f0',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Navigation size={20} color="#38bdf8" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#0f172a' }}>Driver Console</h3>
              {activeTrip && <StatusBadge status="LIVE" size="sm" />}
            </div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              {busInfo.bus_number ? `Assigned: Bus ${busInfo.bus_number}` : 'Fleet Operations'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={handleLogout} className="btn btn-outline btn-sm" style={{ borderRadius: '10px', color: '#64748b' }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </nav>

      <div className="content" ref={contentRef} style={{ maxWidth: '680px', margin: '0 auto', padding: '18px 16px 40px' }}>
        {/* Active Emergency SOS Banner */}
        {sosActive && (
          <div
            style={{
              background: '#fef2f2',
              border: '2px solid #ef4444',
              borderRadius: '16px',
              padding: '16px 20px',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              animation: 'pulseLive 2s infinite',
              boxShadow: '0 8px 24px rgba(239, 68, 68, 0.18)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ShieldAlert size={32} color="#ef4444" />
              <div>
                <strong style={{ color: '#b91c1c', fontSize: '15px' }}>EMERGENCY SOS ACTIVE</strong>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#7f1d1d' }}>
                  School dispatch and parents have been alerted. Stand by for instructions.
                </p>
              </div>
            </div>
            <StatusBadge status="EMERGENCY" text="SOS ALERT" size="sm" />
          </div>
        )}

        {!busInfo.bus_number ? (
          <EmptyState
            title="No Bus Assigned"
            description="You have not been assigned to an active school bus or route. Please contact your school administrator to configure your bus profile."
            icon={AlertTriangle}
          />
        ) : (
          <>
            {/* Bus Info Header Card */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '18px 20px',
                marginBottom: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Vehicle Assignment
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span>🚌 {busInfo.bus_number}</span>
                    {busInfo.license_plate && (
                      <span style={{ fontSize: '12px', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                        {busInfo.license_plate}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  {gpsAccuracy == null ? (
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>GPS Standby</span>
                  ) : gpsAccuracy <= 15 ? (
                    <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 700, background: '#dcfce7', padding: '4px 8px', borderRadius: '6px' }}>
                      🟢 GPS High (±{Math.round(gpsAccuracy)}m)
                    </span>
                  ) : gpsAccuracy <= 50 ? (
                    <span style={{ fontSize: '12px', color: '#ca8a04', fontWeight: 700, background: '#fef9c3', padding: '4px 8px', borderRadius: '6px' }}>
                      🟡 GPS Med (±{Math.round(gpsAccuracy)}m)
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 700, background: '#fee2e2', padding: '4px 8px', borderRadius: '6px' }}>
                      🔴 GPS Weak (±{Math.round(gpsAccuracy)}m)
                    </span>
                  )}
                </div>
              </div>

              <div style={{ fontSize: '13px', color: '#475569', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                Route: <strong style={{ color: '#0f172a' }}>{busInfo.route_name || busInfo.route_id?.name || 'Standard Route'}</strong>
              </div>
            </div>

            {/* Active Telemetry Cockpit */}
            {activeTrip && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '12px',
                  marginBottom: '16px'
                }}
              >
                {/* Speed Card */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    borderRadius: '16px',
                    padding: '16px',
                    color: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700 }}>Current Speed</span>
                    <Gauge size={18} color="#38bdf8" />
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: 900, color: '#ffffff', margin: '8px 0 0', letterSpacing: '-0.03em' }}>
                    {currentSpeed} <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 500 }}>km/h</span>
                  </div>
                </div>

                {/* Duration Card */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Trip Timer</span>
                    <Radio size={18} color="#f59e0b" />
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '8px 0 0', fontFamily: 'monospace' }}>
                    {formatTime(timer)}
                  </div>
                </div>

                {/* Heading Card */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Bearing</span>
                    <Compass size={18} color="#0ea5e9" />
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '8px 0 0' }}>
                    {getHeadingDirection(currentHeading)} <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>({currentHeading}°)</span>
                  </div>
                </div>

                {/* Passengers Card */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>On Board</span>
                    <Users size={18} color="#10b981" />
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#16a34a', margin: '8px 0 0' }}>
                    {checkinCount} <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>students</span>
                  </div>
                </div>
              </div>
            )}

            {/* Trip Action Controls (Cockpit Buttons) */}
            <div style={{ marginBottom: '18px' }}>
              {!activeTrip ? (
                <button
                  className="btn btn-primary btn-lg"
                  onClick={handleStartTrip}
                  disabled={isStartingTrip}
                  style={{
                    width: '100%',
                    padding: '18px 24px',
                    fontSize: '17px',
                    fontWeight: 800,
                    borderRadius: '16px',
                    boxShadow: '0 8px 20px rgba(37, 99, 235, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}
                >
                  <Play size={22} />
                  {isStartingTrip ? 'Acquiring GPS & Starting...' : 'START LIVE TRIP'}
                </button>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleStartScanner}
                    style={{
                      padding: '16px',
                      borderRadius: '14px',
                      fontWeight: 700,
                      fontSize: '15px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <QrCode size={18} /> Scan QR Pass
                  </button>

                  <button
                    className="btn btn-warning"
                    onClick={() => setShowDelayModal(true)}
                    style={{
                      padding: '16px',
                      borderRadius: '14px',
                      fontWeight: 700,
                      fontSize: '15px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <Clock size={18} /> Report Delay
                  </button>

                  <button
                    className="btn btn-danger"
                    onClick={() => setShowSOSModal(true)}
                    style={{
                      padding: '16px',
                      borderRadius: '14px',
                      fontWeight: 700,
                      fontSize: '15px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      background: '#ef4444',
                      color: '#ffffff'
                    }}
                  >
                    <AlertOctagon size={18} /> SOS Emergency
                  </button>

                  <button
                    className="btn btn-outline"
                    onClick={() => setShowEndTripConfirm(true)}
                    style={{
                      padding: '16px',
                      borderRadius: '14px',
                      fontWeight: 700,
                      fontSize: '15px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      color: '#475569',
                      border: '1px solid #cbd5e1'
                    }}
                  >
                    <Square size={18} /> End Trip
                  </button>
                </div>
              )}
            </div>

            {/* Route Stop Progression Card */}
            {activeTrip && routeStops.length > 0 && (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '18px 20px',
                  marginBottom: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}
              >
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MapPin size={16} color="#2563eb" /> Route Progression
                </h4>

                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px' }}>
                  {routeStops.map((stop, idx) => {
                    const stopOrder = stop.order ?? (idx + 1);
                    const isPassed = stopOrder < nextStopOrder;
                    const isCurrent = stopOrder === nextStopOrder;

                    return (
                      <div
                        key={idx}
                        style={{
                          flex: '0 0 auto',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          background: isCurrent ? '#eff6ff' : isPassed ? '#f8fafc' : '#ffffff',
                          border: `1.5px solid ${isCurrent ? '#2563eb' : isPassed ? '#cbd5e1' : '#e2e8f0'}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        {isPassed ? (
                          <CheckCircle2 size={16} color="#16a34a" />
                        ) : (
                          <span
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              background: isCurrent ? '#2563eb' : '#94a3b8',
                              color: '#fff',
                              fontSize: '11px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800
                            }}
                          >
                            {stopOrder}
                          </span>
                        )}
                        <span style={{ fontSize: '13px', fontWeight: isCurrent ? 800 : 500, color: isCurrent ? '#1e40af' : isPassed ? '#64748b' : '#334155' }}>
                          {stop.name}
                        </span>
                        {idx < routeStops.length - 1 && <ChevronRight size={14} color="#94a3b8" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* QR Scanner Modal / View */}
            {showQRScanner && activeTrip && (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '20px',
                  marginBottom: '16px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Camera size={18} color="#2563eb" /> Student QR Scanner
                  </h3>
                  <button onClick={handleStopScanner} className="btn btn-outline btn-sm" style={{ padding: '6px 10px' }}>
                    <X size={16} />
                  </button>
                </div>

                {isScanning && !scanResult && (
                  <QRScanner
                    onScan={handleCameraScan}
                    onClose={handleStopScanner}
                    onError={handleCameraError}
                  />
                )}

                {!isScanning && !scanResult && (
                  <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                      <Camera size={30} />
                    </div>
                    <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px' }}>Ready to Scan</h4>
                    <p style={{ color: '#64748b', fontSize: '13px', maxWidth: '320px', margin: '0 auto 16px' }}>
                      Point your phone camera at the student's dynamic boarding pass QR.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '280px', margin: '0 auto' }}>
                      <button className="btn btn-primary" onClick={() => setIsScanning(true)}>
                        <Camera size={18} /> Launch Camera
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => setShowManualInput(!showManualInput)}>
                        {showManualInput ? 'Hide Manual Token' : 'Type Token Manually'}
                      </button>
                    </div>
                  </div>
                )}

                {showManualInput && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Paste or type QR token..."
                      value={manualQRInput}
                      onChange={(e) => { setManualQRInput(e.target.value); setScanResult(null); }}
                    />
                    <button onClick={handleManualScan} className="btn btn-primary" style={{ flexShrink: 0 }}>
                      Verify
                    </button>
                  </div>
                )}

                {scanResult && (
                  <div style={{ marginTop: '14px' }}>
                    <div
                      style={{
                        padding: '16px',
                        borderRadius: '12px',
                        background: scanResult.error ? '#fef2f2' : '#f0fdf4',
                        border: `1.5px solid ${scanResult.error ? '#ef4444' : '#22c55e'}`,
                        color: scanResult.error ? '#b91c1c' : '#15803d',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                    >
                      {scanResult.error ? (
                        <>
                          <X size={24} />
                          <span style={{ fontWeight: 600, fontSize: '14px' }}>{scanResult.error}</span>
                        </>
                      ) : (
                        <>
                          <UserCheck size={28} />
                          <div>
                            <strong style={{ fontSize: '16px' }}>{scanResult.student_name}</strong>
                            <div style={{ fontSize: '12px', marginTop: '2px', opacity: 0.9 }}>
                              Stop: {scanResult.pickup_location || 'Standard Stop'}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    {!scanResult.error && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', color: '#64748b', marginTop: '10px' }}>
                        <RotateCcw size={14} /> Ready for next student in 2s...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Boarded Students List */}
            {activeTrip && checkinCount > 0 && (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '18px 20px',
                  marginBottom: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}
              >
                <h3 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={18} color="#2563eb" /> Students On Board ({checkinCount})
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {tripDetails.check_ins.map((checkIn, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: '#f8fafc',
                        borderRadius: '10px',
                        border: '1px solid #f1f5f9'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '8px',
                            background: '#eff6ff',
                            color: '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '13px'
                          }}
                        >
                          {checkIn.student_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{checkIn.student_name}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{checkIn.pickup_location || 'Designated Stop'}</div>
                        </div>
                      </div>

                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569', background: '#e2e8f0', padding: '2px 8px', borderRadius: '6px' }}>
                        {new Date(checkIn.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live Driver Map View */}
            {isLoaded && (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  marginBottom: '16px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={16} color="#2563eb" /> Live Route Map
                  </h3>
                  {activeTrip && <StatusBadge status="LIVE" size="sm" />}
                </div>

                <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
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
                </div>

                {currentLocation && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '10px', fontSize: '12px', color: '#64748b' }}>
                    <span>Lat: <strong>{currentLocation.lat.toFixed(5)}</strong></span>
                    <span>Lng: <strong>{currentLocation.lng.toFixed(5)}</strong></span>
                    <span>Speed: <strong>{currentSpeed} km/h</strong></span>
                    <span>Heading: <strong>{currentHeading}°</strong></span>
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
              <h3 style={{ color: '#b91c1c', margin: '0 0 6px 0', fontSize: '18px', fontWeight: 800 }}>Broadcast Emergency SOS</h3>
              <p style={{ color: '#4b5563', fontSize: '13px' }}>
                This will immediately broadcast an urgent emergency alert to school dispatchers and parents.
              </p>
            </div>

            <div style={{ margin: '16px 0' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#374151' }}>
                Emergency Classification
              </label>
              <select 
                value={sosReason} 
                onChange={e => setSosReason(e.target.value)}
                className="form-control"
                style={{ marginBottom: '10px' }}
              >
                <option value="Breakdown">Vehicle Breakdown / Mechanical Failure</option>
                <option value="Accident">Traffic / Collision Incident</option>
                <option value="Medical">Medical Emergency on Board</option>
                <option value="Security">Security or Safety Hazard</option>
                <option value="Weather / Road Block">Severe Weather / Impassable Road</option>
                <option value="Other">Other Emergency...</option>
              </select>

              {sosReason === 'Other' && (
                <input
                  type="text"
                  className="form-control"
                  placeholder="Describe emergency details..."
                  value={customSosText}
                  onChange={e => setCustomSosText(e.target.value)}
                />
              )}
            </div>

            <div className="confirm-modal-actions" style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-outline" onClick={() => setShowSOSModal(false)} disabled={isSendingSOS} style={{ flex: 1 }}>
                Cancel
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleTriggerSOS} 
                disabled={isSendingSOS}
                style={{ flex: 1.5, background: '#dc2626', color: '#fff', fontWeight: 800 }}
              >
                {isSendingSOS ? 'Broadcasting...' : '🚨 Broadcast SOS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delay Notification Modal */}
      {showDelayModal && (
        <div className="modal-overlay" onClick={() => setShowDelayModal(false)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="confirm-modal-header">
              <div className="confirm-icon warning" style={{ margin: '0 auto 12px' }}><Clock size={28} /></div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 800 }}>Notify Route Delay</h3>
              <p style={{ color: '#4b5563', fontSize: '13px' }}>
                Inform waiting parents of estimated delay in schedule.
              </p>
            </div>

            <div style={{ margin: '16px 0' }}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700 }}>Estimated Delay (minutes)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  value={delayMinutes} 
                  onChange={e => setDelayMinutes(Number(e.target.value))} 
                  min={5} 
                  max={120} 
                />
              </div>
              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 700 }}>Reason (optional)</label>
                <textarea 
                  className="form-control" 
                  rows={3} 
                  value={delayReason} 
                  onChange={e => setDelayReason(e.target.value)} 
                  placeholder="e.g. Heavy traffic bottleneck, road construction..." 
                />
              </div>
            </div>

            <div className="confirm-modal-actions" style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-outline" onClick={() => setShowDelayModal(false)} disabled={isSendingDelay} style={{ flex: 1 }}>
                Cancel
              </button>
              <button 
                className="btn btn-warning" 
                onClick={handleNotifyDelay} 
                disabled={isSendingDelay} 
                style={{ flex: 1.5, fontWeight: 800 }}
              >
                {isSendingDelay ? 'Sending...' : 'Send Delay Alert'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Trip Modal */}
      <ConfirmModal
        isOpen={showEndTripConfirm}
        title="Conclude Active Trip?"
        message="Are you sure you want to end this trip? Real-time location broadcasting will stop."
        confirmText="Conclude Trip"
        cancelText="Keep Trip Active"
        type="danger"
        onConfirm={handleEndTrip}
        onCancel={() => setShowEndTripConfirm(false)}
      />

      {/* Logout Modal */}
      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="Confirm Sign Out"
        message="Are you sure you want to log out of your driver account?"
        confirmText="Sign Out"
        cancelText="Cancel"
        type="danger"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}

export default DriverDashboard;
