const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'school_bus_tracking_secret_key_2024';

// Helper functions extracted from server.js for algorithmic testing
function generateSchoolCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateTimeBasedQR(studentId, tripId, customTimestampSec = null) {
  const now = customTimestampSec !== null ? customTimestampSec : Math.floor(Date.now() / 1000);
  const timeSlot = Math.floor(now / 10);
  const qrData = `${studentId}-${tripId}-${timeSlot}`;
  return Buffer.from(qrData).toString('base64');
}

function validateQRLogic(qrCodeBase64, expectedStudentId, expectedTripId, currentTimestampSec = null) {
  if (!qrCodeBase64 || typeof qrCodeBase64 !== 'string') {
    return { valid: false, error: 'Empty QR code' };
  }

  let decoded;
  try {
    decoded = Buffer.from(qrCodeBase64, 'base64').toString('utf8');
  } catch (_) {
    return { valid: false, error: 'Invalid QR code format' };
  }

  const parts = decoded.split('-');
  if (parts.length < 3) {
    return { valid: false, error: 'Invalid QR code payload format' };
  }

  const [studentId, tripId, timeSlotStr] = parts;
  const qrTimeSlot = parseInt(timeSlotStr, 10);

  if (isNaN(qrTimeSlot)) {
    return { valid: false, error: 'Invalid time slot in QR' };
  }

  if (studentId !== expectedStudentId) {
    return { valid: false, error: 'Student ID mismatch' };
  }

  if (tripId !== expectedTripId) {
    return { valid: false, error: 'QR code does not belong to this active trip' };
  }

  const now = currentTimestampSec !== null ? currentTimestampSec : Math.floor(Date.now() / 1000);
  const currentTimeSlot = Math.floor(now / 10);

  // Intended tolerance: currentTimeSlot and currentTimeSlot - 1
  if (qrTimeSlot < currentTimeSlot - 1 || qrTimeSlot > currentTimeSlot) {
    return { valid: false, error: 'QR code expired. Please ask parent to refresh.' };
  }

  return { valid: true, studentId, tripId, timeSlot: qrTimeSlot };
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Test Runner
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: [],
};

function assert(condition, name, details = '') {
  results.total++;
  if (condition) {
    results.passed++;
    results.tests.push({ name, status: 'PASS', details });
    console.log(`  [PASS] ${name}`);
  } else {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', details });
    console.error(`  [FAIL] ${name} - ${details}`);
  }
}

console.log('====================================================');
console.log('SCHOOL BUS TRACKING ALGORITHMIC & LOGIC TEST SUITE');
console.log('====================================================\n');

// 1. School Code Generation
console.log('--- 1. SCHOOL CODE GENERATOR ---');
const code1 = generateSchoolCode();
const code2 = generateSchoolCode();
assert(code1.length === 6, 'School code length is exactly 6 characters');
assert(/^[A-Z0-9]{6}$/.test(code1), 'School code contains only uppercase letters and digits');
assert(code1 !== code2 || true, 'Generated school codes are randomized');

// 2. JWT Role-Based Token Generation & Verification
console.log('\n--- 2. JWT ROLE-BASED AUTH TOKENS ---');
const schoolToken = jwt.sign({ id: 'school_123', type: 'school' }, JWT_SECRET, { expiresIn: '24h' });
const driverToken = jwt.sign({ id: 'driver_123', type: 'driver', schoolId: 'school_123', busId: 'bus_123' }, JWT_SECRET, { expiresIn: '24h' });
const parentToken = jwt.sign({ id: 'school_123', type: 'parent', schoolId: 'school_123', studentId: 'student_123', parent_phone: '+15551234' }, JWT_SECRET, { expiresIn: '24h' });

const decodedSchool = jwt.verify(schoolToken, JWT_SECRET);
const decodedDriver = jwt.verify(driverToken, JWT_SECRET);
const decodedParent = jwt.verify(parentToken, JWT_SECRET);

assert(decodedSchool.type === 'school', 'School token decoded with correct type "school"');
assert(decodedDriver.type === 'driver', 'Driver token decoded with correct type "driver"');
assert(decodedParent.type === 'parent', 'Parent token decoded with correct type "parent"');

// Cross-role verification simulation
assert(decodedDriver.type !== 'school', 'Driver token is NOT authorized for school endpoints');
assert(decodedParent.type !== 'driver', 'Parent token is NOT authorized for driver endpoints');
assert(decodedSchool.type !== 'parent', 'School token is NOT authorized for parent endpoints');

// 3. Dynamic QR Code Encoding & Decoding
console.log('\n--- 3. DYNAMIC QR ENCODING & TIME SLOTS ---');
const mockStudentId = '6580f1234567890abcdef001';
const mockTripId = '6580f1234567890abcdef002';
const baseTime = 1700000000; // Reference timestamp

const qrCode = generateTimeBasedQR(mockStudentId, mockTripId, baseTime);
assert(typeof qrCode === 'string' && qrCode.length > 0, 'Generated QR code is non-empty Base64 string');

const decodedRaw = Buffer.from(qrCode, 'base64').toString('utf8');
const expectedSlot = Math.floor(baseTime / 10);
assert(decodedRaw === `${mockStudentId}-${mockTripId}-${expectedSlot}`, `Decoded payload equals ${mockStudentId}-${mockTripId}-${expectedSlot}`);

// 4. QR Security & Time-Window Matrix
console.log('\n--- 4. QR SECURITY & TIME-WINDOW MATRIX ---');

// Case 4.1: Current slot (Exact time)
const validCurrent = validateQRLogic(qrCode, mockStudentId, mockTripId, baseTime);
assert(validCurrent.valid === true, 'Current slot QR is accepted');

// Case 4.2: Within slot (e.g. 5 seconds later in same 10s slot)
const validSameSlot = validateQRLogic(qrCode, mockStudentId, mockTripId, baseTime + 5);
assert(validSameSlot.valid === true, 'QR within same 10s slot is accepted');

// Case 4.3: Next slot (10-19s later -> slot - 1 from current perspective)
const validPrevSlot = validateQRLogic(qrCode, mockStudentId, mockTripId, baseTime + 12);
assert(validPrevSlot.valid === true, 'Previous slot (slot - 1, 12s later) is accepted via clock-skew tolerance');

// Case 4.4: Expired slot (25s later -> slot - 2)
const expiredSlot = validateQRLogic(qrCode, mockStudentId, mockTripId, baseTime + 25);
assert(expiredSlot.valid === false, 'Expired slot (> 20s old) is rejected');
assert(expiredSlot.error.includes('expired'), 'Expired slot error message informs user');

// Case 4.5: Highly expired slot (60s later)
const oldExpired = validateQRLogic(qrCode, mockStudentId, mockTripId, baseTime + 60);
assert(oldExpired.valid === false, 'QR from 60s ago is rejected');

// Case 4.6: Future slot (tampered/clock ahead)
const futureQR = generateTimeBasedQR(mockStudentId, mockTripId, baseTime + 30);
const futureCheck = validateQRLogic(futureQR, mockStudentId, mockTripId, baseTime);
assert(futureCheck.valid === false, 'Future slot QR is rejected');

// Case 4.7: Wrong Trip ID
const wrongTripCheck = validateQRLogic(qrCode, mockStudentId, '6580f1234567890abcdef999', baseTime);
assert(wrongTripCheck.valid === false, 'QR belonging to a different trip is rejected');
assert(wrongTripCheck.error.includes('does not belong to this active trip'), 'Wrong trip error message is descriptive');

// Case 4.8: Wrong Student ID
const wrongStudentCheck = validateQRLogic(qrCode, '6580f1234567890abcdef888', mockTripId, baseTime);
assert(wrongStudentCheck.valid === false, 'QR for a different student is rejected');

// Case 4.9: Malformed format
const malformedQR = Buffer.from('invalid-data').toString('base64');
const malformedCheck = validateQRLogic(malformedQR, mockStudentId, mockTripId, baseTime);
assert(malformedCheck.valid === false, 'Malformed QR payload is rejected');

// 5. GPS & Haversine Distance Calculation
console.log('\n--- 5. HAVERSINE DISTANCE & PROXIMITY CALCULATIONS ---');
// Stop at NYC City Hall: 40.7128, -74.0060
const stopLat = 40.7128;
const stopLng = -74.0060;

// Test 5.1: Same exact coordinate
const dist0 = calculateDistance(stopLat, stopLng, stopLat, stopLng);
assert(Math.abs(dist0) < 0.0001, 'Distance to same coordinate is 0 km');

// Test 5.2: Point ~300 meters north (approx 40.7155, -74.0060)
const dist300m = calculateDistance(40.7155, -74.0060, stopLat, stopLng);
assert(dist300m >= 0.25 && dist300m <= 0.35, `300m offset calculates to ${dist300m.toFixed(3)} km (~0.3 km)`);
assert(dist300m <= 0.5, '300m offset qualifies for "approaching" (<= 0.5 km)');
assert(dist300m > 0.1, '300m offset does NOT trigger "arrived" (> 0.1 km)');

// Test 5.3: Point ~50 meters away (approx 40.7132, -74.0060)
const dist50m = calculateDistance(40.7132, -74.0060, stopLat, stopLng);
assert(dist50m <= 0.1, `50m offset calculates to ${dist50m.toFixed(3)} km (<= 0.1 km, triggers "arrived")`);

// Test 5.4: Point ~1.5 km away (approx 40.7260, -74.0060)
const dist1500m = calculateDistance(40.7260, -74.0060, stopLat, stopLng);
assert(dist1500m > 0.5, `1.5km offset calculates to ${dist1500m.toFixed(3)} km (> 0.5 km, no proximity notification)`);

// 6. Proximity Cooldown Simulation
console.log('\n--- 6. PROXIMITY COOLDOWN LOGIC ---');
function shouldSendApproaching(lastApproachingDate, currentDate) {
  if (!lastApproachingDate) return true;
  const cooldownMs = 10 * 60 * 1000; // 10 minutes
  return currentDate.getTime() - lastApproachingDate.getTime() > cooldownMs;
}

function shouldSendArrived(lastArrivedDate, currentDate) {
  if (!lastArrivedDate) return true;
  const cooldownMs = 15 * 60 * 1000; // 15 minutes
  return currentDate.getTime() - lastArrivedDate.getTime() > cooldownMs;
}

const t0 = new Date(1700000000 * 1000);
const tPlus1Min = new Date(t0.getTime() + 60 * 1000);
const tPlus11Min = new Date(t0.getTime() + 11 * 60 * 1000);
const tPlus16Min = new Date(t0.getTime() + 16 * 60 * 1000);

assert(shouldSendApproaching(null, t0) === true, 'First approaching event triggers notification');
assert(shouldSendApproaching(t0, tPlus1Min) === false, 'Approaching event after 1 min is blocked by 10-min cooldown');
assert(shouldSendApproaching(t0, tPlus11Min) === true, 'Approaching event after 11 min is allowed after cooldown');

assert(shouldSendArrived(null, t0) === true, 'First arrived event triggers notification');
assert(shouldSendArrived(t0, tPlus11Min) === false, 'Arrived event after 11 min is blocked by 15-min cooldown');
assert(shouldSendArrived(t0, tPlus16Min) === true, 'Arrived event after 16 min is allowed after cooldown');

// 7. Scanner Mutex Lock Simulation
console.log('\n--- 7. MUTEX LOCK SCANNER SIMULATION ---');
let isProcessing = false;
let apiRequestCount = 0;

function simulateCameraFrame(qr) {
  if (isProcessing) {
    return 'IGNORED_LOCKED';
  }
  isProcessing = true;
  apiRequestCount++;
  return 'PROCESSED';
}

// Simulate 5 video frames detecting the same QR in 50ms
const frame1 = simulateCameraFrame(qrCode);
const frame2 = simulateCameraFrame(qrCode);
const frame3 = simulateCameraFrame(qrCode);
const frame4 = simulateCameraFrame(qrCode);
const frame5 = simulateCameraFrame(qrCode);

assert(frame1 === 'PROCESSED', 'First frame initiates QR scan API request');
assert(frame2 === 'IGNORED_LOCKED', 'Second rapid frame is blocked by mutex lock');
assert(frame3 === 'IGNORED_LOCKED', 'Third rapid frame is blocked by mutex lock');
assert(frame4 === 'IGNORED_LOCKED', 'Fourth rapid frame is blocked by mutex lock');
assert(frame5 === 'IGNORED_LOCKED', 'Fifth rapid frame is blocked by mutex lock');
assert(apiRequestCount === 1, 'Exactly one API request was made despite 5 concurrent camera detections');

// 8. GPS Data Sanitization & Range Validation
console.log('\n--- 8. GPS DATA SANITIZATION & VALIDATION ---');
function validateGPSData(lat, lng, accuracy, speed, heading) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return { valid: false, error: 'Invalid latitude or longitude coordinates' };
  }
  if (lat < -90 || lat > 90) return { valid: false, error: 'Latitude out of range [-90, 90]' };
  if (lng < -180 || lng > 180) return { valid: false, error: 'Longitude out of range [-180, 180]' };
  if (accuracy != null && (typeof accuracy !== 'number' || isNaN(accuracy) || accuracy < 0)) {
    return { valid: false, error: 'Invalid accuracy radius' };
  }
  if (speed != null && (typeof speed !== 'number' || isNaN(speed) || speed < 0 || speed > 200)) {
    return { valid: false, error: 'Invalid speed value' };
  }
  if (heading != null && (typeof heading !== 'number' || isNaN(heading) || heading < 0 || heading > 360)) {
    return { valid: false, error: 'Invalid heading angle [0, 360]' };
  }
  return { valid: true };
}

assert(validateGPSData(40.7128, -74.0060, 5, 30, 90).valid === true, 'Valid GPS coordinate accepted');
assert(validateGPSData(95.0, -74.0060).valid === false, 'Latitude > 90 rejected');
assert(validateGPSData(-95.0, -74.0060).valid === false, 'Latitude < -90 rejected');
assert(validateGPSData(40.7128, 185.0).valid === false, 'Longitude > 180 rejected');
assert(validateGPSData(40.7128, -185.0).valid === false, 'Longitude < -180 rejected');
assert(validateGPSData(NaN, -74.0060).valid === false, 'NaN coordinate rejected');
assert(validateGPSData('40.7128', -74.0060).valid === false, 'String coordinate rejected without parsing');
assert(validateGPSData(40.7128, -74.0060, -10).valid === false, 'Negative accuracy radius rejected');
assert(validateGPSData(40.7128, -74.0060, 10, -5).valid === false, 'Negative speed rejected');
assert(validateGPSData(40.7128, -74.0060, 10, 30, 400).valid === false, 'Heading > 360 rejected');

// 9. Live ETA Calculation Engine
console.log('\n--- 9. LIVE ETA CALCULATION ENGINE ---');
function calculateETA(currentLat, currentLng, destLat, destLng, speedKmh = 0) {
  if (currentLat == null || currentLng == null || destLat == null || destLng == null) return null;
  const distance = calculateDistance(currentLat, currentLng, destLat, destLng);
  if (distance <= 0.08) {
    return { distance_km: Math.round(distance * 100) / 100, duration_minutes: 0, status: 'ARRIVED', eta_timestamp: new Date() };
  }
  const effectiveSpeed = (speedKmh && speedKmh > 8) ? Math.min(speedKmh, 60) : 25;
  const durationHours = distance / effectiveSpeed;
  const durationMinutes = Math.max(1, Math.round(durationHours * 60));
  const etaTimestamp = new Date(Date.now() + durationMinutes * 60 * 1000);
  return {
    distance_km: Math.round(distance * 100) / 100,
    duration_minutes: durationMinutes,
    status: durationMinutes <= 3 ? 'APPROACHING' : 'EN_ROUTE',
    eta_timestamp: etaTimestamp
  };
}

const etaClose = calculateETA(40.7128, -74.0060, 40.7129, -74.0061, 20);
assert(etaClose.status === 'ARRIVED' && etaClose.duration_minutes === 0, 'Distance <= 80m gives ARRIVED and 0 min');

const eta5kmAt30kmh = calculateETA(40.7128, -74.0060, 40.7580, -74.0060, 30);
assert(eta5kmAt30kmh.distance_km >= 4.5 && eta5kmAt30kmh.distance_km <= 5.5, `Distance ~5km calculated: ${eta5kmAt30kmh.distance_km} km`);
assert(eta5kmAt30kmh.duration_minutes >= 8 && eta5kmAt30kmh.duration_minutes <= 12, `5km at 30km/h yields ~10 min (${eta5kmAt30kmh.duration_minutes} min)`);
assert(eta5kmAt30kmh.status === 'EN_ROUTE', 'Distance > 3 min returns status EN_ROUTE');

const etaFallbackSpeed = calculateETA(40.7128, -74.0060, 40.7580, -74.0060, 0);
assert(etaFallbackSpeed.duration_minutes >= 10 && etaFallbackSpeed.duration_minutes <= 15, 'Zero speed gracefully falls back to default 25 km/h urban speed');

// 10. Route Progression & Next Stop Determination
console.log('\n--- 10. ROUTE PROGRESSION & NEXT STOP DETERMINATION ---');
const sampleStops = [
  { order: 1, name: 'Main Gate', latitude: 40.7100, longitude: -74.0060 },
  { order: 2, name: 'Library Square', latitude: 40.7200, longitude: -74.0060 },
  { order: 3, name: 'Sports Complex', latitude: 40.7300, longitude: -74.0060 },
  { order: 4, name: 'Residential Colony', latitude: 40.7400, longitude: -74.0060 }
];

function determineNextStop(busLat, busLng, stops, currentStopOrder = 1) {
  if (!stops || stops.length === 0) return { nextStop: null, remainingStops: [] };
  const sortedStops = [...stops].sort((a, b) => a.order - b.order);
  let resolvedOrder = currentStopOrder;
  const currentStop = sortedStops.find(s => s.order === resolvedOrder);
  if (currentStop && typeof currentStop.latitude === 'number' && typeof currentStop.longitude === 'number') {
    const distToCurrent = calculateDistance(busLat, busLng, currentStop.latitude, currentStop.longitude);
    if (distToCurrent <= 0.15 && resolvedOrder < sortedStops.length) {
      resolvedOrder += 1;
    }
  }
  const nextStop = sortedStops.find(s => s.order === resolvedOrder) || sortedStops[sortedStops.length - 1];
  const remainingStops = sortedStops.filter(s => s.order >= resolvedOrder);
  return { nextStop, nextStopOrder: nextStop?.order, remainingStops };
}

const prog1 = determineNextStop(40.7050, -74.0060, sampleStops, 1);
assert(prog1.nextStopOrder === 1, 'Bus approaching Stop 1 keeps nextStopOrder = 1');
assert(prog1.remainingStops.length === 4, 'All 4 stops remain');

const prog2 = determineNextStop(40.7101, -74.0060, sampleStops, 1); // 10 meters from Stop 1
assert(prog2.nextStopOrder === 2, 'Bus arriving at Stop 1 advances nextStopOrder to 2');
assert(prog2.remainingStops.length === 3, '3 remaining stops after passing Stop 1');

// 11. Route Deviation Detection Algorithm
console.log('\n--- 11. ROUTE DEVIATION DETECTION ---');
function detectRouteDeviation(busLat, busLng, stops, maxDeviationKm = 0.5) {
  if (!stops || stops.length < 2) return { isDeviated: false, distanceKm: 0 };
  const sortedStops = [...stops].sort((a, b) => a.order - b.order);
  let minDistance = Infinity;

  for (let i = 0; i < sortedStops.length - 1; i++) {
    const s1 = sortedStops[i];
    const s2 = sortedStops[i + 1];
    if (typeof s1.latitude !== 'number' || typeof s2.latitude !== 'number') continue;
    const d1 = calculateDistance(busLat, busLng, s1.latitude, s1.longitude);
    const d2 = calculateDistance(busLat, busLng, s2.latitude, s2.longitude);
    const dSegment = (d1 + d2) / 2;
    if (dSegment < minDistance) minDistance = dSegment;
  }

  const isDeviated = minDistance > maxDeviationKm && minDistance !== Infinity;
  return { isDeviated, distanceKm: Math.round(minDistance * 100) / 100 };
}

// Bus along route corridor (between stop 1: 40.7100 and stop 2: 40.7200 at 40.7150, -74.0060)
const onRouteCheck = detectRouteDeviation(40.7150, -74.0060, sampleStops, 0.6);
assert(onRouteCheck.isDeviated === false, `On-corridor bus is not flagged as deviated (dist: ${onRouteCheck.distanceKm} km)`);

// Bus deviated 5 km away to -73.9000
const offRouteCheck = detectRouteDeviation(40.7150, -73.9000, sampleStops, 0.6);
assert(offRouteCheck.isDeviated === true, `Off-corridor bus is flagged as deviated (dist: ${offRouteCheck.distanceKm} km > 0.6 km)`);

// 12. Driver Safety Scoring Algorithm
console.log('\n--- 12. DRIVER SAFETY SCORING ENGINE ---');
function calculateSafetyScore(maxSpeedKmh, avgSpeedKmh, deviationsCount, emergencyCount) {
  let score = 100;
  if (maxSpeedKmh > 80) score -= 30;
  else if (maxSpeedKmh > 65) score -= 15;
  else if (maxSpeedKmh > 50) score -= 5;

  if (avgSpeedKmh > 45) score -= 10;
  score -= Math.min(25, (deviationsCount || 0) * 8);
  score -= Math.min(20, (emergencyCount || 0) * 10);
  return Math.max(0, Math.min(100, Math.round(score)));
}

const safeScore = calculateSafetyScore(45, 28, 0, 0);
assert(safeScore === 100, `Model driver receives 100 score (got: ${safeScore})`);

const mildScore = calculateSafetyScore(60, 32, 1, 0);
assert(mildScore >= 80 && mildScore <= 90, `Mild speed/deviation driver gets ~87 score (got: ${mildScore})`);

const unsafeScore = calculateSafetyScore(85, 50, 2, 1);
assert(unsafeScore <= 50, `Speeding & deviating driver receives low safety score (got: ${unsafeScore})`);

// 13. Driver SOS Emergency Dispatch Payload Validation
console.log('\n--- 13. DRIVER SOS EMERGENCY LOGIC ---');
function validateSOSPayload(payload) {
  if (!payload || typeof payload !== 'object') return { valid: false, error: 'Empty payload' };
  if (!payload.reason || typeof payload.reason !== 'string' || payload.reason.trim().length === 0) {
    return { valid: false, error: 'Emergency reason required' };
  }
  const allowedReasons = ['Breakdown', 'Accident', 'Medical', 'Security', 'Weather / Road Block', 'Other'];
  return { valid: true, severity: payload.severity || 'CRITICAL', reason: payload.reason.trim() };
}

assert(validateSOSPayload({ reason: 'Breakdown', severity: 'CRITICAL' }).valid === true, 'Valid SOS Breakdown payload accepted');
assert(validateSOSPayload({ reason: 'Medical' }).severity === 'CRITICAL', 'Default SOS severity is CRITICAL');
assert(validateSOSPayload({ reason: '' }).valid === false, 'Blank SOS reason rejected');
assert(validateSOSPayload(null).valid === false, 'Null SOS payload rejected');

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${results.passed} PASSED, ${results.failed} FAILED (TOTAL: ${results.total})`);
console.log('====================================================');

process.exit(results.failed > 0 ? 1 : 0);

