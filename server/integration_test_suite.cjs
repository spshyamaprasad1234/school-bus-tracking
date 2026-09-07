const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const PORT = 5001; // Run on dedicated test port to avoid port collision
process.env.PORT = PORT;

// Import app from server.js
const app = require('./server.js');

let serverInstance = null;
const BASE_URL = `http://localhost:${PORT}`;

// Helper for making HTTP requests
function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const payload = body ? JSON.stringify(body) : null;
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(data);
          } catch (_) {
            parsed = data;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsed,
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Test Runner
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: [],
};

function assert(condition, testName, details = '') {
  results.total++;
  if (condition) {
    results.passed++;
    results.tests.push({ name: testName, status: 'PASS', details });
    console.log(`  [PASS] ${testName}`);
  } else {
    results.failed++;
    results.tests.push({ name: testName, status: 'FAIL', details });
    console.error(`  [FAIL] ${testName} - ${details}`);
  }
}

async function runAllTests() {
  console.log('====================================================');
  console.log('STARTING SCHOOL BUS TRACKING INTEGRATION TEST SUITE');
  console.log('====================================================\n');

  // Wait for MongoDB to connect
  console.log('Connecting to database...');
  let attempts = 0;
  while (mongoose.connection.readyState !== 1 && attempts < 30) {
    await new Promise((r) => setTimeout(r, 500));
    attempts++;
  }

  if (mongoose.connection.readyState !== 1) {
    console.error('Failed to connect to MongoDB Atlas. Aborting integration tests.');
    process.exit(1);
  }
  console.log('MongoDB connected successfully.\n');

  // Test data variables
  const uniqueSuffix = Date.now().toString().slice(-6);
  const testSchoolEmail = `school_${uniqueSuffix}@test.com`;
  const testSchoolPassword = 'Password123!';
  const testDriverEmail = `driver_${uniqueSuffix}@test.com`;
  const testDriverPassword = 'DriverPass123!';
  const testParentPhone = `+1555${uniqueSuffix}`;

  let schoolToken = null;
  let schoolCode = null;
  let schoolId = null;

  let driverId = null;
  let driverToken = null;

  let routeId = null;
  let busId = null;
  let student1Id = null;
  let student2Id = null;

  let parent1Token = null;
  let tripId = null;

  try {
    // -------------------------------------------------------------
    // SECTION 1: Health & API Availability
    // -------------------------------------------------------------
    console.log('--- SECTION 1: HEALTH & BASE API ---');
    const healthRes = await request('GET', '/api/health');
    assert(healthRes.status === 200, 'GET /api/health returns 200');
    assert(healthRes.data?.status === 'healthy', 'GET /api/health returns healthy status');
    assert(healthRes.data?.mongodb === 'connected', 'GET /api/health reports MongoDB connected');

    // -------------------------------------------------------------
    // SECTION 2: School Registration & Authentication
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: SCHOOL REGISTRATION & AUTHENTICATION ---');
    const signupRes = await request('POST', '/api/schools/signup', {
      name: `Springfield Academy ${uniqueSuffix}`,
      email: testSchoolEmail,
      password: testSchoolPassword,
      address: '742 Evergreen Terrace, Springfield',
      phone: '+1 555-0100',
    });
    assert(signupRes.status === 200, 'POST /api/schools/signup returns 200', JSON.stringify(signupRes.data));
    assert(!!signupRes.data?.token, 'Signup returns JWT token');
    assert(!!signupRes.data?.school?.school_code, 'Signup generates 6-char school code');
    assert(signupRes.data?.school?.school_code.length === 6, 'School code is exactly 6 characters');

    schoolToken = signupRes.data.token;
    schoolCode = signupRes.data.school.school_code;
    schoolId = signupRes.data.school._id || signupRes.data.school.id;

    // Test School Login
    const loginRes = await request('POST', '/api/schools/login', {
      email: testSchoolEmail,
      password: testSchoolPassword,
    });
    assert(loginRes.status === 200, 'POST /api/schools/login returns 200 on valid credentials');
    assert(!!loginRes.data?.token, 'Login returns JWT token');

    // Test Invalid Login
    const invalidLogin = await request('POST', '/api/schools/login', {
      email: testSchoolEmail,
      password: 'WrongPassword!',
    });
    assert(invalidLogin.status === 400, 'POST /api/schools/login returns 400 on wrong password');

    // Test School Info & Dashboard
    const infoRes = await request('GET', '/api/schools/info', null, schoolToken);
    assert(infoRes.status === 200, 'GET /api/schools/info returns 200');
    assert(infoRes.data?.school_code === schoolCode, 'GET /api/schools/info returns matching school code');

    const dashRes = await request('GET', '/api/schools/dashboard', null, schoolToken);
    assert(dashRes.status === 200, 'GET /api/schools/dashboard returns 200');
    assert(dashRes.data?.driverCount === 0, 'Dashboard initially reports 0 drivers');

    // -------------------------------------------------------------
    // SECTION 3: Role-Based Access Control (RBAC)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: ROLE-BASED ACCESS CONTROL (RBAC) ---');
    const noTokenRes = await request('GET', '/api/schools/dashboard');
    assert(noTokenRes.status === 401, 'Request without token returns 401 Unauthorized');

    const invalidTokenRes = await request('GET', '/api/schools/dashboard', null, 'invalid.jwt.token');
    assert(invalidTokenRes.status === 403, 'Request with invalid token returns 403 Forbidden');

    // -------------------------------------------------------------
    // SECTION 4: CRUD OPERATIONS (Drivers, Routes, Buses, Students)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: CRUD OPERATIONS ---');

    // 4.1 Drivers CRUD
    const addDriverRes = await request('POST', '/api/schools/drivers', {
      name: `John Driver ${uniqueSuffix}`,
      email: testDriverEmail,
      phone: '+1 555-0200',
      licenseNumber: `DL-${uniqueSuffix}`,
      password: testDriverPassword,
    }, schoolToken);
    assert(addDriverRes.status === 200, 'POST /api/schools/drivers returns 200');
    driverId = addDriverRes.data?.driverId;
    assert(!!driverId, 'Driver ID returned from driver creation');

    const listDriversRes = await request('GET', '/api/schools/drivers', null, schoolToken);
    assert(listDriversRes.status === 200, 'GET /api/schools/drivers returns 200');
    assert(listDriversRes.data.some((d) => d.email === testDriverEmail), 'Created driver found in driver list');

    const updateDriverRes = await request('PUT', `/api/schools/drivers/${driverId}`, {
      name: `John Driver Updated ${uniqueSuffix}`,
      email: testDriverEmail,
      phone: '+1 555-0299',
      licenseNumber: `DL-${uniqueSuffix}-UPD`,
    }, schoolToken);
    assert(updateDriverRes.status === 200, 'PUT /api/schools/drivers/:id returns 200');

    // 4.2 Routes & Stops CRUD (with Coordinates)
    // Coords: Main Gate (40.7128, -74.0060), Stop 1 (40.7180, -74.0020), Stop 2 (40.7250, -73.9980)
    const addRouteRes = await request('POST', '/api/schools/routes', {
      name: `Route North ${uniqueSuffix}`,
      startLocation: 'School Main Campus',
      endLocation: 'North Suburb Terminal',
      estimatedTime: '35 mins',
      stops: [
        {
          name: 'Pine Street Corner',
          address: '100 Pine St',
          order: 1,
          latitude: 40.7180,
          longitude: -74.0020,
        },
        {
          name: 'Oak Avenue Crossing',
          address: '250 Oak Ave',
          order: 2,
          latitude: 40.7250,
          longitude: -73.9980,
        },
      ],
    }, schoolToken);
    assert(addRouteRes.status === 200, 'POST /api/schools/routes returns 200');
    routeId = addRouteRes.data?.routeId;
    assert(!!routeId, 'Route ID returned from route creation');

    const listRoutesRes = await request('GET', '/api/schools/routes', null, schoolToken);
    assert(listRoutesRes.status === 200, 'GET /api/schools/routes returns 200');
    const createdRoute = listRoutesRes.data.find((r) => r._id === routeId);
    assert(!!createdRoute, 'Created route exists in route list');
    assert(createdRoute?.stops?.length === 2, 'Route contains exactly 2 stops');
    assert(createdRoute?.stops[0]?.latitude === 40.7180, 'Stop 1 latitude correctly persisted as number');
    assert(createdRoute?.stops[0]?.longitude === -74.0020, 'Stop 1 longitude correctly persisted as number');

    // 4.3 Buses CRUD
    const addBusRes = await request('POST', '/api/schools/buses', {
      busNumber: `BUS-${uniqueSuffix}`,
      licensePlate: `XYZ-${uniqueSuffix}`,
      model: 'Bluebird Vision 2024',
      capacity: 45,
      driverId: driverId,
      routeId: routeId,
    }, schoolToken);
    assert(addBusRes.status === 200, 'POST /api/schools/buses returns 200');
    busId = addBusRes.data?.busId;
    assert(!!busId, 'Bus ID returned from bus creation');

    const listBusesRes = await request('GET', '/api/schools/buses', null, schoolToken);
    assert(listBusesRes.status === 200, 'GET /api/schools/buses returns 200');
    const createdBus = listBusesRes.data.find((b) => b._id === busId);
    assert(!!createdBus, 'Created bus exists in bus list');
    assert(createdBus?.driver_name?.includes('John Driver'), 'Bus has assigned driver name populated');

    // 4.4 Students CRUD
    const addStudent1Res = await request('POST', '/api/schools/students', {
      name: `Alice Smith ${uniqueSuffix}`,
      parentPhone: testParentPhone,
      pickupLocation: '100 Pine St',
      routeId: routeId,
      stopId: '1',
    }, schoolToken);
    assert(addStudent1Res.status === 200, 'POST /api/schools/students (Student 1) returns 200');
    student1Id = addStudent1Res.data?.studentId;
    assert(!!student1Id, 'Student 1 ID returned');

    const addStudent2Res = await request('POST', '/api/schools/students', {
      name: `Bob Smith ${uniqueSuffix}`,
      parentPhone: testParentPhone,
      pickupLocation: '250 Oak Ave',
      routeId: routeId,
      stopId: '2',
    }, schoolToken);
    assert(addStudent2Res.status === 200, 'POST /api/schools/students (Student 2) returns 200');
    student2Id = addStudent2Res.data?.studentId;
    assert(!!student2Id, 'Student 2 ID returned');

    // Verify Dashboard counts
    const updatedDash = await request('GET', '/api/schools/dashboard', null, schoolToken);
    assert(updatedDash.data?.driverCount >= 1, 'Dashboard driverCount updated');
    assert(updatedDash.data?.busCount >= 1, 'Dashboard busCount updated');
    assert(updatedDash.data?.routeCount >= 1, 'Dashboard routeCount updated');
    assert(updatedDash.data?.studentCount >= 2, 'Dashboard studentCount updated');

    // -------------------------------------------------------------
    // SECTION 5: DRIVER LOGIN & BUS RESOLUTION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 5: DRIVER LOGIN & BUS RESOLUTION ---');
    const driverLoginRes = await request('POST', '/api/drivers/login', {
      email: testDriverEmail,
      password: testDriverPassword,
    });
    assert(driverLoginRes.status === 200, 'POST /api/drivers/login returns 200');
    assert(!!driverLoginRes.data?.token, 'Driver login returns JWT token');
    driverToken = driverLoginRes.data.token;

    // Verify cross-role access: Driver cannot access School dashboard
    const driverSchoolAttempt = await request('GET', '/api/schools/dashboard', null, driverToken);
    assert(driverSchoolAttempt.status === 403, 'Driver token accessing School API is rejected with 403');

    // Verify Driver Bus Info
    const busInfoRes = await request('GET', '/api/driver/bus-info', null, driverToken);
    assert(busInfoRes.status === 200, 'GET /api/driver/bus-info returns 200');
    assert(busInfoRes.data?._id === busId || busInfoRes.data?.bus_id === busId, 'Driver bus-info contains resolved bus ID');
    assert(busInfoRes.data?.bus_number === `BUS-${uniqueSuffix}`, 'Driver bus-info contains correct bus number');

    // -------------------------------------------------------------
    // SECTION 6: TRIP START & PARENT DYNAMIC QR FLOW
    // -------------------------------------------------------------
    console.log('\n--- SECTION 6: TRIP START & DYNAMIC QR FLOW ---');
    const startTripRes = await request('POST', '/api/trips/start', {
      busId: busId,
      routeId: routeId,
      lat: 40.7128,
      lng: -74.0060,
    }, driverToken);
    assert(startTripRes.status === 200, 'POST /api/trips/start returns 200');
    tripId = startTripRes.data?.tripId;
    assert(!!tripId, 'Active Trip ID returned on trip start');

    // Verify Trip in Driver Trip Details
    const tripDetailsRes = await request('GET', '/api/driver/trip-details', null, driverToken);
    assert(tripDetailsRes.status === 200, 'GET /api/driver/trip-details returns 200');
    assert(tripDetailsRes.data?._id === tripId, 'Driver trip-details matches active trip ID');
    assert(tripDetailsRes.data?.status === 'ongoing', 'Trip status is ongoing');

    // Parent Login
    const parentLoginRes = await request('POST', '/api/parents/login', {
      schoolCode: schoolCode,
      parentPhone: testParentPhone,
    });
    assert(parentLoginRes.status === 200, 'POST /api/parents/login returns 200');
    assert(!!parentLoginRes.data?.token, 'Parent login returns JWT token');
    parent1Token = parentLoginRes.data.token;

    // Parent Trip Status & Dynamic QR
    const parentTripRes = await request('GET', '/api/parents/trip-status', null, parent1Token);
    assert(parentTripRes.status === 200, 'GET /api/parents/trip-status returns 200');
    assert(parentTripRes.data?._id === tripId, 'Parent sees active ongoing trip');
    assert(!!parentTripRes.data?.qr_code, 'Parent receives dynamic QR code');
    assert(parentTripRes.data?.qr_expires_in === 10, 'Parent receives 10s expiration indicator');

    const receivedQR = parentTripRes.data?.qr_code;
    const decodedPayload = Buffer.from(receivedQR, 'base64').toString('utf8');
    assert(decodedPayload.startsWith(`${student1Id}-${tripId}-`), 'Decoded QR matches format studentId-tripId-timeSlot');

    // -------------------------------------------------------------
    // SECTION 7: QR SECURITY & VALIDATION MATRIX
    // -------------------------------------------------------------
    console.log('\n--- SECTION 7: QR SECURITY & VALIDATION MATRIX ---');

    // 7.1 Valid Current Slot Scan
    const validScanRes = await request('POST', '/api/trips/scan-qr', {
      tripId: tripId,
      qrCode: receivedQR,
    }, driverToken);
    assert(validScanRes.status === 200, 'Valid current-slot QR scan returns 200', JSON.stringify(validScanRes.data));
    assert(validScanRes.data?.student_name?.includes('Alice Smith'), 'Scan response returns student name');

    // 7.2 Duplicate QR Scan (same student already checked in)
    const duplicateScanRes = await request('POST', '/api/trips/scan-qr', {
      tripId: tripId,
      qrCode: receivedQR,
    }, driverToken);
    assert(duplicateScanRes.status === 400, 'Duplicate QR scan rejected with 400');
    assert(duplicateScanRes.data?.error?.includes('already checked in'), 'Duplicate error message is clear');

    // 7.3 Valid Previous Slot (slot - 1) Tolerance for Student 2
    const nowSec = Math.floor(Date.now() / 1000);
    const currentSlot = Math.floor(nowSec / 10);
    const prevSlotQR = Buffer.from(`${student2Id}-${tripId}-${currentSlot - 1}`).toString('base64');
    const prevSlotScanRes = await request('POST', '/api/trips/scan-qr', {
      tripId: tripId,
      qrCode: prevSlotQR,
    }, driverToken);
    assert(prevSlotScanRes.status === 200, 'Previous slot (slot - 1) QR scan accepted within tolerance window');

    // 7.4 Expired Slot (slot - 2 or older)
    const expiredQR = Buffer.from(`${student1Id}-${tripId}-${currentSlot - 2}`).toString('base64');
    const expiredScanRes = await request('POST', '/api/trips/scan-qr', {
      tripId: tripId,
      qrCode: expiredQR,
    }, driverToken);
    assert(expiredScanRes.status === 400, 'Expired slot (slot - 2) QR scan rejected with 400');

    // 7.5 Future Slot (> currentSlot)
    const futureQR = Buffer.from(`${student1Id}-${tripId}-${currentSlot + 5}`).toString('base64');
    const futureScanRes = await request('POST', '/api/trips/scan-qr', {
      tripId: tripId,
      qrCode: futureQR,
    }, driverToken);
    assert(futureScanRes.status === 400, 'Future slot QR scan rejected with 400');

    // 7.6 QR from Another Trip
    const fakeTripId = new mongoose.Types.ObjectId();
    const wrongTripQR = Buffer.from(`${student1Id}-${fakeTripId}-${currentSlot}`).toString('base64');
    const wrongTripScanRes = await request('POST', '/api/trips/scan-qr', {
      tripId: tripId,
      qrCode: wrongTripQR,
    }, driverToken);
    assert(wrongTripScanRes.status === 400, 'QR for different trip rejected with 400');

    // 7.7 Malformed Base64 & Malformed Format
    const malformedScanRes = await request('POST', '/api/trips/scan-qr', {
      tripId: tripId,
      qrCode: '%%%not-valid-base64%%%',
    }, driverToken);
    assert(malformedScanRes.status === 400, 'Malformed QR payload rejected with 400');

    // -------------------------------------------------------------
    // SECTION 8: GPS LOCATION & PROXIMITY NOTIFICATIONS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 8: GPS LOCATION & PROXIMITY NOTIFICATIONS ---');

    // Stop 1 coordinates: 40.7180, -74.0020
    // Test 8.1: Location far away (40.7100, -74.0100 -> ~1.1 km away)
    await request('POST', '/api/trips/update-location', {
      tripId: tripId,
      lat: 40.7100,
      lng: -74.0100,
      speed: 30,
      heading: 45,
    }, driverToken);

    let notifListRes = await request('GET', '/api/notifications', null, parent1Token);
    let approachingNotifs = notifListRes.data.filter((n) => n.type === 'approaching');
    assert(approachingNotifs.length === 0, 'No approaching notification when distance > 0.5 km');

    // Test 8.2: Approaching Stop 1 (40.7155, -74.0035 -> ~0.3 km from Stop 1)
    await request('POST', '/api/trips/update-location', {
      tripId: tripId,
      lat: 40.7155,
      lng: -74.0035,
      speed: 25,
      heading: 45,
    }, driverToken);

    notifListRes = await request('GET', '/api/notifications', null, parent1Token);
    approachingNotifs = notifListRes.data.filter((n) => n.type === 'approaching');
    assert(approachingNotifs.length >= 1, 'Approaching notification generated when distance <= 0.5 km');

    // Test 8.3: Approaching cooldown (send again within 10 min -> should not duplicate)
    const initialApproachingCount = approachingNotifs.length;
    await request('POST', '/api/trips/update-location', {
      tripId: tripId,
      lat: 40.7156,
      lng: -74.0034,
      speed: 25,
      heading: 45,
    }, driverToken);

    notifListRes = await request('GET', '/api/notifications', null, parent1Token);
    approachingNotifs = notifListRes.data.filter((n) => n.type === 'approaching');
    assert(approachingNotifs.length === initialApproachingCount, 'Duplicate approaching notification prevented by cooldown');

    // Test 8.4: Arrived at Stop 1 (40.7180, -74.0020 -> 0.0 km)
    await request('POST', '/api/trips/update-location', {
      tripId: tripId,
      lat: 40.7180,
      lng: -74.0020,
      speed: 0,
      heading: 45,
    }, driverToken);

    notifListRes = await request('GET', '/api/notifications', null, parent1Token);
    const arrivedNotifs = notifListRes.data.filter((n) => n.type === 'arrived');
    assert(arrivedNotifs.length >= 1, 'Arrived notification generated when distance <= 0.1 km');

    // Test 8.5: Delay Notification
    const delayRes = await request('POST', '/api/trips/notify-delay', {
      tripId: tripId,
      delayMinutes: 15,
      reason: 'Heavy traffic on main avenue',
    }, driverToken);
    assert(delayRes.status === 200, 'POST /api/trips/notify-delay returns 200');

    notifListRes = await request('GET', '/api/notifications', null, parent1Token);
    const delayNotifs = notifListRes.data.filter((n) => n.type === 'delayed');
    assert(delayNotifs.length >= 1, 'Delay notification saved for parent');

    // Test 8.6: Mark notification as read
    const firstNotifId = notifListRes.data[0]._id;
    const readRes = await request('PUT', `/api/notifications/${firstNotifId}/read`, null, parent1Token);
    assert(readRes.status === 200, 'PUT /api/notifications/:id/read returns 200');

    // -------------------------------------------------------------
    // SECTION 9: TRIP END & STATE TERMINATION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 9: TRIP END & TERMINATION ---');
    const endTripRes = await request('POST', '/api/trips/end', {
      tripId: tripId,
    }, driverToken);
    assert(endTripRes.status === 200, 'POST /api/trips/end returns 200');

    // Parent sees trip is ended
    const parentTripAfterEnd = await request('GET', '/api/parents/trip-status', null, parent1Token);
    assert(parentTripAfterEnd.status === 200, 'Parent trip-status returns 200 after trip end');
    assert(parentTripAfterEnd.data === null, 'Parent trip-status returns null when no ongoing trip');

    // -------------------------------------------------------------
    // SECTION 10: RELATIONSHIP EDGE CASES & DELETION ANALYSIS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 10: RELATIONSHIPS & EDGE CASES ---');
    // Test deleting student
    const deleteStudentRes = await request('DELETE', `/api/schools/students/${student2Id}`, null, schoolToken);
    assert(deleteStudentRes.status === 200, 'DELETE /api/schools/students/:id returns 200');

    // Test deleting bus
    const deleteBusRes = await request('DELETE', `/api/schools/buses/${busId}`, null, schoolToken);
    assert(deleteBusRes.status === 200, 'DELETE /api/schools/buses/:id returns 200');

    // Test deleting route
    const deleteRouteRes = await request('DELETE', `/api/schools/routes/${routeId}`, null, schoolToken);
    assert(deleteRouteRes.status === 200, 'DELETE /api/schools/routes/:id returns 200');

    // Test deleting driver
    const deleteDriverRes = await request('DELETE', `/api/schools/drivers/${driverId}`, null, schoolToken);
    assert(deleteDriverRes.status === 200, 'DELETE /api/schools/drivers/:id returns 200');
  } catch (err) {
    console.error('UNEXPECTED TEST EXECUTION ERROR:', err);
    results.failed++;
  } finally {
    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${results.passed} PASSED, ${results.failed} FAILED (TOTAL: ${results.total})`);
    console.log('====================================================');

    // Cleanup test database entries created during the test run
    try {
      if (schoolId) {
        await mongoose.model('School').findByIdAndDelete(schoolId);
        await mongoose.model('Driver').deleteMany({ school_id: schoolId });
        await mongoose.model('Bus').deleteMany({ school_id: schoolId });
        await mongoose.model('Route').deleteMany({ school_id: schoolId });
        await mongoose.model('Student').deleteMany({ school_id: schoolId });
        await mongoose.model('Trip').deleteMany({ route_id: routeId });
        await mongoose.model('Notification').deleteMany({ parent_phone: testParentPhone });
        await mongoose.model('Location').deleteMany({ trip_id: tripId });
        console.log('Test data cleaned up successfully.');
      }
    } catch (cleanErr) {
      console.warn('Cleanup warning:', cleanErr.message);
    }

    process.exit(results.failed > 0 ? 1 : 0);
  }
}

runAllTests();
