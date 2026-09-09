require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

const activeSockets = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return next(new Error('Invalid token'));
    socket.user = user;
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id} (${socket.user.type})`);
  activeSockets.set(socket.id, socket);

  if (socket.user.type === 'driver') {
    socket.join(`driver:${socket.user.id}`);
  } else if (socket.user.type === 'school') {
    socket.join(`school:${socket.user.id}`);
  }

  socket.on('school:join-fleet', (schoolId) => {
    if (socket.user.type === 'school') {
      const targetSchoolId = schoolId || socket.user.id;
      socket.join(`school:${targetSchoolId}`);
      console.log(`School socket ${socket.id} joined fleet room school:${targetSchoolId}`);
    }
  });

  socket.on('driver:location-update', async (data) => {
    if (socket.user.type !== 'driver' || !data) return;
    const { tripId, lat, lng, speed = 0, heading = 0, accuracy = 0 } = data;
    
    // GPS validation
    const gpsValidation = validateGPSData(lat, lng, speed, heading, accuracy);
    if (!gpsValidation.valid || !tripId) {
      console.warn(`[GPS Rejected] Invalid coordinates from driver ${socket.user.id}:`, gpsValidation.error);
      return;
    }
    
    // Ensure driver socket is in the trip room
    if (!socket.rooms.has(`trip:${tripId}`)) {
      socket.join(`trip:${tripId}`);
    }

    try {
      const trip = await Trip.findById(tripId).populate('route_id').populate('bus_id').populate('driver_id');
      if (!trip || trip.status !== 'ongoing') return;

      const busId = socket.user.busId || trip.bus_id?._id || trip.bus_id;
      if (!socket.user.busId && busId) {
        socket.user.busId = busId;
      }

      // Calculate distance delta
      let incrementalDist = 0;
      if (typeof trip.current_lat === 'number' && typeof trip.current_lng === 'number') {
        incrementalDist = calculateDistance(trip.current_lat, trip.current_lng, lat, lng);
        // Discard absurd single-step jumps (> 5km in 5s throttle)
        if (incrementalDist > 5) incrementalDist = 0;
      }
      const newDistance = (trip.distance || 0) + incrementalDist;

      // Update speeds
      const numSpeed = typeof speed === 'number' && speed >= 0 ? speed : 0;
      const newMaxSpeed = Math.max(trip.max_speed || 0, numSpeed);
      const newAvgSpeed = trip.average_speed 
        ? Math.round(((trip.average_speed * 0.8) + (numSpeed * 0.2)) * 10) / 10 
        : numSpeed;

      // Next stop sequencing & ETA
      const stops = trip.route_id?.stops || [];
      const stopProgress = determineNextStop(lat, lng, stops, trip.current_stop_order || 0);
      const etaData = calculateETA(lat, lng, numSpeed, stops, stopProgress.currentStopOrder);

      // Route deviation detection
      const deviationData = detectRouteDeviation(lat, lng, stops, 0.5);
      const wasDeviated = trip.route_deviation;
      const isDeviated = deviationData.isDeviated;

      // Determine trip status
      let newTripStatus = trip.trip_status || 'ON_THE_WAY';
      if (trip.emergency?.is_active) {
        newTripStatus = 'EMERGENCY';
      } else if (stopProgress.isAtStop) {
        newTripStatus = 'AT_STOP';
      } else if (etaData.distanceToNextKm <= 0.5) {
        newTripStatus = 'APPROACHING_STOP';
      } else if (numSpeed > 0) {
        newTripStatus = 'ON_THE_WAY';
      }

      // Update Trip document
      trip.current_lat = lat;
      trip.current_lng = lng;
      trip.current_speed = numSpeed;
      trip.current_heading = typeof heading === 'number' ? heading : (trip.current_heading || 0);
      trip.distance = parseFloat(newDistance.toFixed(2));
      trip.max_speed = newMaxSpeed;
      trip.average_speed = newAvgSpeed;
      trip.current_stop_order = stopProgress.currentStopOrder;
      trip.next_stop_order = stopProgress.nextStopOrder;
      trip.route_deviation = isDeviated;
      trip.trip_status = newTripStatus;
      trip.last_location_at = new Date();
      await trip.save();

      // Persist Location breadcrumb
      await Location.create({
        bus_id: busId,
        trip_id: tripId,
        latitude: lat,
        longitude: lng,
        speed: numSpeed,
        heading: typeof heading === 'number' ? heading : 0,
        accuracy: typeof accuracy === 'number' ? accuracy : 0,
        recorded_at: new Date()
      });

      // Handle route deviation alert notification if state changed to deviated
      const schoolId = trip.bus_id?.school_id || trip.driver_id?.school_id;
      if (!wasDeviated && isDeviated && schoolId) {
        const devMsg = `⚠️ Route Deviation: Bus ${trip.bus_id?.bus_number || 'N/A'} is approx ${deviationData.distanceMeters}m off route.`;
        await Notification.create({
          school_id: schoolId,
          trip_id: tripId,
          type: 'deviation',
          message: devMsg,
          latitude: lat,
          longitude: lng
        });
        io.to(`school:${schoolId}`).emit('fleet:alert', {
          type: 'deviation',
          tripId,
          busId,
          busNumber: trip.bus_id?.bus_number,
          message: devMsg,
          distanceMeters: deviationData.distanceMeters,
          timestamp: new Date().toISOString()
        });
      }

      // Check proximity and notify parents
      if (trip.route_id?._id) {
        checkProximityAndNotify(lat, lng, trip.route_id._id, tripId);
      }

      const timestamp = new Date().toISOString();

      // Payload for parents & trip room
      const tripUpdatePayload = {
        tripId,
        busId,
        busNumber: trip.bus_id?.bus_number || 'Bus',
        busModel: trip.bus_id?.model || '',
        licensePlate: trip.bus_id?.license_plate || '',
        driverName: trip.driver_id?.name || 'Driver',
        driverPhone: trip.driver_id?.phone || '',
        routeName: trip.route_id?.name || 'Route',
        lat,
        lng,
        speed: numSpeed,
        heading: trip.current_heading,
        accuracy: accuracy || 0,
        distanceTraveledKm: trip.distance,
        distanceToNextStopKm: etaData.distanceToNextKm,
        eta: etaData.etaText,
        etaMinutes: etaData.minutes,
        totalEtaMinutes: etaData.totalMinutes,
        currentStopOrder: stopProgress.currentStopOrder,
        nextStopOrder: stopProgress.nextStopOrder,
        nextStopName: etaData.nextStopName,
        currentStopName: stopProgress.currentStopName,
        tripStatus: newTripStatus,
        isDeviated,
        emergency: trip.emergency,
        timestamp
      };

      socket.to(`trip:${tripId}`).emit('trip:location-update', tripUpdatePayload);

      // Payload for school fleet room
      if (schoolId) {
        io.to(`school:${schoolId}`).emit('fleet:location-update', {
          ...tripUpdatePayload,
          schoolId
        });
      }
    } catch (err) {
      console.error('Error processing driver:location-update:', err);
    }
  });

  socket.on('driver:sos', async (data) => {
    if (socket.user.type !== 'driver' || !data?.tripId) return;
    try {
      const { tripId, reason, lat, lng } = data;
      const trip = await Trip.findById(tripId).populate('bus_id').populate('driver_id').populate('route_id');
      if (!trip) return;

      trip.emergency = {
        is_active: true,
        triggered_at: new Date(),
        reason: reason || 'Driver Triggered SOS'
      };
      trip.trip_status = 'EMERGENCY';
      await trip.save();

      const schoolId = trip.bus_id?.school_id || trip.driver_id?.school_id;
      const emergencyMsg = `🚨 EMERGENCY ALERT: Bus ${trip.bus_id?.bus_number || 'N/A'} (Driver: ${trip.driver_id?.name || 'N/A'}) reported an emergency!`;

      if (schoolId) {
        await Notification.create({
          school_id: schoolId,
          trip_id: tripId,
          type: 'emergency',
          message: emergencyMsg,
          latitude: lat || trip.current_lat,
          longitude: lng || trip.current_lng
        });

        io.to(`school:${schoolId}`).emit('emergency:alert', {
          tripId,
          busId: trip.bus_id?._id,
          busNumber: trip.bus_id?.bus_number,
          driverName: trip.driver_id?.name,
          driverPhone: trip.driver_id?.phone,
          routeName: trip.route_id?.name,
          lat: lat || trip.current_lat,
          lng: lng || trip.current_lng,
          reason: reason || 'Driver SOS Emergency',
          timestamp: new Date().toISOString()
        });
      }

      io.to(`trip:${tripId}`).emit('emergency:alert', {
        tripId,
        message: emergencyMsg,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error handling driver:sos event:', err);
    }
  });

  socket.on('parent:join-trip', async (tripId) => {
    if (socket.user.type !== 'parent') return;
    if (tripId) {
      socket.join(`trip:${tripId}`);
      console.log(`Parent ${socket.id} joined trip:${tripId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    activeSockets.delete(socket.id);
  });
});

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const schoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  school_code: { type: String, unique: true },
  address: String,
  phone: String,
  created_at: { type: Date, default: Date.now }
});

const driverSchema = new mongoose.Schema({
  school_id: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  license_number: String,
  password: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

const busSchema = new mongoose.Schema({
  school_id: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  bus_number: String,
  license_plate: String,
  model: String,
  capacity: { type: Number, default: 50 },
  driver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
  route_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
  status: { type: String, default: 'active' },
  created_at: { type: Date, default: Date.now }
});

const routeSchema = new mongoose.Schema({
  school_id: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  name: String,
  start_location: String,
  end_location: String,
  estimated_time: String,
  stops: [{
    name: String,
    address: String,
    order: Number,
    latitude: Number,
    longitude: Number
  }],
  created_at: { type: Date, default: Date.now }
});

const studentSchema = new mongoose.Schema({
  school_id: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  name: { type: String, required: true },
  parent_phone: String,
  pickup_location: String,
  route_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
  stop_id: Number,
  qr_code: String,
  created_at: { type: Date, default: Date.now }
});

const tripSchema = new mongoose.Schema({
  bus_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus' },
  route_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
  driver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
  status: { type: String, default: 'ongoing' },
  trip_status: { 
    type: String, 
    enum: ['NOT_STARTED', 'STARTING', 'ON_THE_WAY', 'APPROACHING_STOP', 'AT_STOP', 'DELAYED', 'COMPLETED', 'EMERGENCY'], 
    default: 'STARTING' 
  },
  current_lat: Number,
  current_lng: Number,
  current_speed: { type: Number, default: 0 },
  current_heading: { type: Number, default: 0 },
  distance: { type: Number, default: 0 },
  average_speed: { type: Number, default: 0 },
  max_speed: { type: Number, default: 0 },
  delay_minutes: { type: Number, default: 0 },
  current_stop_order: { type: Number, default: 0 },
  next_stop_order: { type: Number, default: 1 },
  route_deviation: { type: Boolean, default: false },
  emergency: {
    is_active: { type: Boolean, default: false },
    triggered_at: Date,
    acknowledged_at: Date,
    reason: String
  },
  last_location_at: Date,
  started_at: { type: Date, default: Date.now },
  ended_at: Date,
  check_ins: [{
    student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    student_name: String,
    pickup_location: String,
    scanned_at: Date,
    status: String
  }]
});

const notificationSchema = new mongoose.Schema({
  school_id: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  parent_phone: String,
  trip_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
  type: { 
    type: String, 
    enum: ['approaching', 'arrived', 'picked_up', 'delayed', 'emergency', 'deviation', 'speeding', 'started', 'completed'], 
    default: 'approaching' 
  },
  message: String,
  read: { type: Boolean, default: false },
  latitude: Number,
  longitude: Number,
  created_at: { type: Date, default: Date.now }
});

const locationSchema = new mongoose.Schema({
  bus_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus' },
  trip_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  speed: { type: Number, default: 0 },
  heading: { type: Number, default: 0 },
  accuracy: { type: Number, default: 0 },
  recorded_at: { type: Date, default: Date.now }
});

locationSchema.index({ trip_id: 1, recorded_at: -1 });
locationSchema.index({ trip_id: 1, recorded_at: 1 });

const School = mongoose.model('School', schoolSchema);
const Driver = mongoose.model('Driver', driverSchema);
const Bus = mongoose.model('Bus', busSchema);
const Route = mongoose.model('Route', routeSchema);
const Student = mongoose.model('Student', studentSchema);
const Trip = mongoose.model('Trip', tripSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const Location = mongoose.model('Location', locationSchema);

function generateSchoolCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateTimeBasedQR(studentId, tripId) {
  const now = Math.floor(Date.now() / 1000);
  const timeSlot = Math.floor(now / 10);
  const qrData = `${studentId}-${tripId}-${timeSlot}`;
  return Buffer.from(qrData).toString('base64');
}

function validateGPSData(lat, lng, speed = 0, heading = 0, accuracy = 0, timestamp = null) {
  if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) {
    return { valid: false, error: 'Latitude out of valid range [-90, 90]' };
  }
  if (typeof lng !== 'number' || isNaN(lng) || lng < -180 || lng > 180) {
    return { valid: false, error: 'Longitude out of valid range [-180, 180]' };
  }
  if (typeof speed === 'number' && (speed < 0 || speed > 160)) {
    return { valid: false, error: 'Speed value unreasonable' };
  }
  if (typeof heading === 'number' && (heading < 0 || heading > 360)) {
    return { valid: false, error: 'Heading angle must be between 0 and 360 degrees' };
  }
  if (timestamp) {
    const timeMs = new Date(timestamp).getTime();
    const nowMs = Date.now();
    // Reject data more than 10 minutes old or more than 2 minutes in future
    if (isNaN(timeMs) || (nowMs - timeMs > 10 * 60 * 1000) || (timeMs - nowMs > 2 * 60 * 1000)) {
      return { valid: false, error: 'Timestamp is stale or invalid' };
    }
  }
  return { valid: true };
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  if (lat1 === lat2 && lng1 === lng2) return 0;
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateETA(currentLat, currentLng, currentSpeed, stops = [], currentStopOrder = 0) {
  if (!stops || stops.length === 0 || typeof currentLat !== 'number' || typeof currentLng !== 'number') {
    return { 
      etaText: 'ETA ~5 min', 
      minutes: 5, 
      totalMinutes: 15, 
      distanceToNextKm: 1.5, 
      totalDistanceKm: 5.0, 
      nextStopName: 'Destination' 
    };
  }

  const sortedStops = [...stops].sort((a, b) => (a.order || 0) - (b.order || 0));
  const remainingStops = sortedStops.filter(s => (s.order || 0) >= currentStopOrder);
  const nextStop = remainingStops[0] || sortedStops[sortedStops.length - 1];

  let distanceToNext = 0;
  if (typeof nextStop?.latitude === 'number' && typeof nextStop?.longitude === 'number') {
    distanceToNext = calculateDistance(currentLat, currentLng, nextStop.latitude, nextStop.longitude);
  } else {
    distanceToNext = 1.0;
  }

  // Calculate cumulative distance along remaining stops
  let totalDistance = distanceToNext;
  for (let i = 0; i < remainingStops.length - 1; i++) {
    const s1 = remainingStops[i];
    const s2 = remainingStops[i + 1];
    if (typeof s1.latitude === 'number' && typeof s1.longitude === 'number' &&
        typeof s2.latitude === 'number' && typeof s2.longitude === 'number') {
      totalDistance += calculateDistance(s1.latitude, s1.longitude, s2.latitude, s2.longitude);
    }
  }

  // Effective speed: use current speed if realistic moving speed (10-100 km/h), otherwise standard urban benchmark (25 km/h)
  const effectiveSpeed = (typeof currentSpeed === 'number' && currentSpeed >= 12 && currentSpeed <= 90)
    ? currentSpeed
    : 25; // km/h

  const nextStopMinutes = Math.max(1, Math.round((distanceToNext / effectiveSpeed) * 60));
  const totalTripMinutes = Math.max(nextStopMinutes, Math.round((totalDistance / effectiveSpeed) * 60));

  let formattedETA = '';
  if (nextStopMinutes < 60) {
    formattedETA = `ETA ~${nextStopMinutes} min`;
  } else {
    const hrs = Math.floor(nextStopMinutes / 60);
    const mins = nextStopMinutes % 60;
    formattedETA = `ETA ~${hrs}h ${mins}m`;
  }

  return {
    etaText: formattedETA,
    minutes: nextStopMinutes,
    totalMinutes: totalTripMinutes,
    distanceToNextKm: parseFloat(distanceToNext.toFixed(2)),
    totalDistanceKm: parseFloat(totalDistance.toFixed(2)),
    nextStopName: nextStop.name || `Stop ${nextStop.order || 1}`,
    nextStopOrder: nextStop.order || 1
  };
}

function determineNextStop(currentLat, currentLng, stops = [], previousStopOrder = 0) {
  if (!stops || stops.length === 0) {
    return { currentStopOrder: 0, nextStopOrder: 1, currentStopName: 'En route', nextStopName: 'School', isAtStop: false };
  }

  const sortedStops = [...stops].sort((a, b) => (a.order || 0) - (b.order || 0));
  let activeStopOrder = previousStopOrder || 0;
  let isAtStop = false;
  let currentStopName = 'En route';

  // Check if bus is currently within 100m of any stop
  for (const stop of sortedStops) {
    if (typeof stop.latitude === 'number' && typeof stop.longitude === 'number') {
      const dist = calculateDistance(currentLat, currentLng, stop.latitude, stop.longitude);
      if (dist <= 0.1) {
        activeStopOrder = Math.max(activeStopOrder, stop.order);
        isAtStop = true;
        currentStopName = `At ${stop.name}`;
        break;
      }
    }
  }

  const nextStopCandidate = sortedStops.find(s => (s.order || 0) > activeStopOrder) || sortedStops[sortedStops.length - 1];

  return {
    currentStopOrder: activeStopOrder,
    nextStopOrder: nextStopCandidate?.order || activeStopOrder + 1,
    currentStopName,
    nextStopName: nextStopCandidate?.name || 'School Destination',
    isAtStop
  };
}

function detectRouteDeviation(currentLat, currentLng, stops = [], thresholdKm = 0.5) {
  if (!stops || stops.length < 2 || typeof currentLat !== 'number' || typeof currentLng !== 'number') {
    return { isDeviated: false, minDistanceKm: 0, distanceMeters: 0 };
  }

  const validStops = stops.filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number')
                          .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (validStops.length < 2) {
    return { isDeviated: false, minDistanceKm: 0, distanceMeters: 0 };
  }

  let minDistanceKm = Infinity;

  for (let i = 0; i < validStops.length - 1; i++) {
    const p1 = validStops[i];
    const p2 = validStops[i + 1];

    const x1 = p1.longitude;
    const y1 = p1.latitude;
    const x2 = p2.longitude;
    const y2 = p2.latitude;
    const px = currentLng;
    const py = currentLat;

    const dx = x2 - x1;
    const dy = y2 - y1;

    let projLat = y1;
    let projLng = x1;

    if (dx !== 0 || dy !== 0) {
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
      projLng = x1 + t * dx;
      projLat = y1 + t * dy;
    }

    const dist = calculateDistance(py, px, projLat, projLng);
    if (dist < minDistanceKm) {
      minDistanceKm = dist;
    }
  }

  const isDeviated = minDistanceKm > thresholdKm;
  return {
    isDeviated,
    minDistanceKm: parseFloat(minDistanceKm.toFixed(3)),
    distanceMeters: Math.round(minDistanceKm * 1000)
  };
}

function calculateSafetyScore(maxSpeed = 0, avgSpeed = 0, speedingEvents = 0, deviationEvents = 0) {
  let score = 100;
  
  // Deductions for speeding events (> 55 km/h)
  score -= (speedingEvents * 5);

  // Severe speeding (> 70 km/h)
  if (maxSpeed > 70) {
    score -= 15;
  } else if (maxSpeed > 55) {
    score -= 5;
  }

  // Route deviations
  score -= (deviationEvents * 10);

  // Excessive average speed
  if (avgSpeed > 50) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

async function checkProximityAndNotify(lat, lng, routeId, tripId) {
  const route = await Route.findById(routeId);
  if (!route || !route.stops || route.stops.length === 0) return;

  const students = await Student.find({ route_id: routeId });
  if (!students || students.length === 0) return;

  for (const stop of route.stops) {
    if (typeof stop.latitude === 'number' && typeof stop.longitude === 'number') {
      const distance = calculateDistance(lat, lng, stop.latitude, stop.longitude);
      
      const targetStudents = students.filter(s => !s.stop_id || s.stop_id === stop.order);

      if (distance < 0.5) {
        for (const student of targetStudents) {
          const existingApproaching = await Notification.findOne({
            student_id: student._id,
            trip_id: tripId,
            type: 'approaching',
            message: `Bus is approaching ${stop.name}`,
            created_at: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
          });
          
          if (!existingApproaching) {
            const notif = await Notification.create({
              student_id: student._id,
              parent_phone: student.parent_phone,
              trip_id: tripId,
              type: 'approaching',
              message: `Bus is approaching ${stop.name}`,
              latitude: lat,
              longitude: lng
            });
            io.to(`trip:${tripId}`).emit('notification:new', notif);
          }
        }
      }
      
      if (distance < 0.1) {
        for (const student of targetStudents) {
          const existingArrived = await Notification.findOne({
            student_id: student._id,
            trip_id: tripId,
            type: 'arrived',
            message: `Bus has arrived at ${stop.name}`,
            created_at: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
          });
          
          if (!existingArrived) {
            const notif = await Notification.create({
              student_id: student._id,
              parent_phone: student.parent_phone,
              trip_id: tripId,
              type: 'arrived',
              message: `Bus has arrived at ${stop.name}`,
              latitude: lat,
              longitude: lng
            });
            io.to(`trip:${tripId}`).emit('notification:new', notif);
          }
        }
      }
    }
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access denied' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

app.post('/api/schools/signup', async (req, res) => {
  try {
    const { name, email, password, address, phone } = req.body;
    
    const existingSchool = await School.findOne({ email });
    if (existingSchool) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const schoolCode = generateSchoolCode();
    const school = new School({
      name, email, password: hashedPassword, school_code: schoolCode, address, phone
    });
    await school.save();
    
    res.json({ message: 'School registered successfully', schoolCode, schoolId: school._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/schools/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const school = await School.findOne({ email });
    
    if (!school) return res.status(400).json({ error: 'Invalid credentials' });
    
    if (!school.password) {
      return res.status(400).json({ error: 'This account has no password set. Please contact support.' });
    }
    
    const validPassword = await bcrypt.compare(password, school.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign({ id: school._id, type: 'school' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, school: { id: school._id, name: school.name, email: school.email, schoolCode: school.school_code } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/drivers/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const driver = await Driver.findOne({ email });
    
    if (!driver) return res.status(400).json({ error: 'Invalid credentials' });
    
    if (!driver.password) {
      return res.status(400).json({ error: 'This account has no password set. Please contact support.' });
    }
    
    const validPassword = await bcrypt.compare(password, driver.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });

    const school = await School.findById(driver.school_id);
    const token = jwt.sign({ id: driver._id, type: 'driver', schoolId: driver.school_id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ 
      token, 
      driver: { 
        id: driver._id, name: driver.name, email: driver.email, 
        schoolId: driver.school_id,
        schoolName: school?.name || 'Unknown',
        schoolCode: school?.school_code || 'UNKNOWN'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/parents/login', async (req, res) => {
  try {
    const { schoolCode, parentPhone } = req.body;
    const school = await School.findOne({ school_code: schoolCode });
    if (!school) return res.status(400).json({ error: 'Invalid school code' });
    
    const student = await Student.findOne({ school_id: school._id, parent_phone: parentPhone });
    if (!student) return res.status(400).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign({ id: school._id, type: 'parent', schoolId: school._id, studentId: student._id, parent_phone: student.parent_phone }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ 
      token, 
      parent: { 
        schoolId: school._id,
        schoolName: school.name,
        studentId: student._id,
        studentName: student.name,
        pickupLocation: student.pickup_location
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/schools/dashboard', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  const schoolId = req.user.id;
  
  const [driverCount, busCount, routeCount, studentCount] = await Promise.all([
    Driver.countDocuments({ school_id: schoolId }),
    Bus.countDocuments({ school_id: schoolId }),
    Route.countDocuments({ school_id: schoolId }),
    Student.countDocuments({ school_id: schoolId })
  ]);
  
  res.json({ driverCount, busCount, routeCount, studentCount });
});

app.get('/api/schools/info', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  const school = await School.findById(req.user.id);
  if (!school) return res.status(404).json({ error: 'School not found' });
  res.json({ name: school.name, email: school.email, school_code: school.school_code, address: school.address, phone: school.phone });
});

app.get('/api/schools/drivers', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  const drivers = await Driver.find({ school_id: req.user.id });
  res.json(drivers);
});

app.post('/api/schools/drivers', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  const { name, email, phone, licenseNumber, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const driver = new Driver({
      school_id: req.user.id, name, email, phone, license_number: licenseNumber, password: hashedPassword
    });
    await driver.save();
    res.json({ message: 'Driver added successfully', driverId: driver._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.put('/api/schools/drivers/:id', authenticateToken, async (req, res) => {

  console.log('UPDATE DRIVER API HIT');
  console.log('Driver ID:', req.params.id);
  console.log('Body:', req.body);

  if (req.user.type !== 'school') {
    return res.status(403).json({ error: 'Access denied' });
  }


  try {
    const { id } = req.params;
    const { name, email, phone, licenseNumber } = req.body;

    const driver = await Driver.findOneAndUpdate(
      { _id: id, school_id: req.user.id },
      {
        name,
        email,
        phone,
        license_number: licenseNumber
      },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    res.json({
      message: 'Driver updated successfully',
      driver
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/schools/drivers/:id', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  const driver = await Driver.findOneAndDelete({ _id: req.params.id, school_id: req.user.id });
  if (driver) {
    // Unassign driver from any assigned buses
    await Bus.updateMany(
      { school_id: req.user.id, driver_id: req.params.id },
      { $set: { driver_id: null } }
    );
  }
  res.json({ message: 'Driver deleted successfully' });
});

app.get('/api/schools/buses', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  const buses = await Bus.find({ school_id: req.user.id }).populate('driver_id', 'name').populate('route_id', 'name');
  const result = buses.map(b => ({
    ...b.toObject(),
    driver_name: b.driver_id?.name || null,
    route_name: b.route_id?.name || null
  }));
  res.json(result);
});

app.post('/api/schools/buses', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  const { busNumber, licensePlate, model, capacity, driverId, routeId } = req.body;
  const bus = new Bus({
    school_id: req.user.id, bus_number: busNumber, license_plate: licensePlate, 
    model, capacity: capacity || 50, driver_id: driverId || null, route_id: routeId || null, status: 'active'
  });
  await bus.save();
  res.json({ message: 'Bus added successfully', busId: bus._id });
});
app.put('/api/schools/buses/:id', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { id } = req.params;
    const { busNumber, licensePlate, model, capacity, driverId, routeId } = req.body;

    const bus = await Bus.findOneAndUpdate(
      { _id: id, school_id: req.user.id },
      {
        bus_number: busNumber,
        license_plate: licensePlate,
        model,
        capacity,
        driver_id: driverId || null,
        route_id: routeId || null
      },
      { new: true }
    );

    if (!bus) {
      return res.status(404).json({ error: 'Bus not found' });
    }

    res.json({
      message: 'Bus updated successfully',
      bus
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/schools/buses/:id', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  await Bus.findOneAndDelete({ _id: req.params.id, school_id: req.user.id });
  res.json({ message: 'Bus deleted successfully' });
});

app.get('/api/schools/routes', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  const routes = await Route.find({ school_id: req.user.id });
  res.json(routes);
});

app.post('/api/schools/routes', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  const { name, startLocation, endLocation, estimatedTime, stops } = req.body;
  const route = new Route({
    school_id: req.user.id, name, start_location: startLocation, 
    end_location: endLocation, estimated_time: estimatedTime, stops: stops || []
  });
  await route.save();
  res.json({ message: 'Route added successfully', routeId: route._id });
});
app.put('/api/schools/routes/:id', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { id } = req.params;
    const { name, startLocation, endLocation, estimatedTime, stops } = req.body;

    const route = await Route.findOneAndUpdate(
      {
        _id: id,
        school_id: req.user.id
      },
      {
        name,
        start_location: startLocation,
        end_location: endLocation,
        estimated_time: estimatedTime,
        stops: stops || []
      },
      { new: true }
    );

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    res.json({
      message: 'Route updated successfully',
      route
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});
app.delete('/api/schools/routes/:id', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const route = await Route.findOneAndDelete({
    _id: req.params.id,
    school_id: req.user.id
  });

  if (route) {
    // Unassign route from buses
    await Bus.updateMany(
      { school_id: req.user.id, route_id: req.params.id },
      { $set: { route_id: null } }
    );
    // Unassign route and stop from students
    await Student.updateMany(
      { school_id: req.user.id, route_id: req.params.id },
      { $set: { route_id: null, stop_id: null } }
    );
  }

  res.json({ message: 'Route deleted successfully' });
});

app.get('/api/schools/students', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  const students = await Student.find({ school_id: req.user.id }).populate('route_id', 'name stops');
  const result = students.map(s => {
    const stop = s.route_id?.stops?.find(stop => stop.order === s.stop_id);
    return {
      ...s.toObject(),
      route_name: s.route_id?.name || null,
      stops: s.route_id?.stops || [],
      stop_name: stop?.name || null
    };
  });
  res.json(result);
});

app.post('/api/schools/students', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  const { name, parentPhone, pickupLocation, routeId, stopId } = req.body;
  const qrCode = uuidv4();
  const student = new Student({
    school_id: req.user.id, name, parent_phone: parentPhone, 
    pickup_location: pickupLocation, route_id: routeId || null, stop_id: stopId || null, qr_code: qrCode
  });
  await student.save();
  res.json({ message: 'Student added successfully', studentId: student._id, qrCode });
});
app.put('/api/schools/students/:id', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { id } = req.params;
    const { name, parentPhone, pickupLocation, routeId, stopId } = req.body;

    const student = await Student.findOneAndUpdate(
      { _id: id, school_id: req.user.id },
      {
        name,
        parent_phone: parentPhone,
        pickup_location: pickupLocation,
        route_id: routeId || null,
        stop_id: stopId || null
      },
      { new: true }
    );

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json({
      message: 'Student updated successfully',
      student
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/schools/students/:id', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const student = await Student.findOneAndDelete({
      _id: req.params.id,
      school_id: req.user.id
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/driver/bus-info', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  const bus = await Bus.findOne({ driver_id: req.user.id });
  if (!bus) return res.json({});
  const route = await Route.findById(bus.route_id) || {};
  res.json({ 
    ...bus.toObject(), 
    bus_id: bus._id,
    route_name: route.name, 
    start_location: route.start_location, 
    end_location: route.end_location, 
    estimated_time: route.estimated_time 
  });
});

// ==========================================
// LIVE FLEET & INTELLIGENCE APIs (SCHOOL ADMIN)
// ==========================================

app.get('/api/schools/live-fleet', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  try {
    const schoolId = req.user.id;
    const buses = await Bus.find({ school_id: schoolId })
      .populate('driver_id', 'name phone email license_number')
      .populate('route_id', 'name start_location end_location estimated_time stops');

    const busIds = buses.map(b => b._id);
    const activeTrips = await Trip.find({ bus_id: { $in: busIds }, status: 'ongoing' })
      .populate('route_id', 'name start_location end_location stops')
      .populate('driver_id', 'name phone');

    const tripMap = new Map();
    activeTrips.forEach(t => {
      tripMap.set(t.bus_id.toString(), t);
    });

    const fleet = buses.map(bus => {
      const activeTrip = tripMap.get(bus._id.toString());
      const route = activeTrip?.route_id || bus.route_id;
      const stops = route?.stops || [];

      let eta = null;
      let stopProgress = null;
      let isDeviated = false;

      if (activeTrip && typeof activeTrip.current_lat === 'number' && typeof activeTrip.current_lng === 'number') {
        stopProgress = determineNextStop(activeTrip.current_lat, activeTrip.current_lng, stops, activeTrip.current_stop_order || 0);
        eta = calculateETA(activeTrip.current_lat, activeTrip.current_lng, activeTrip.current_speed || 0, stops, stopProgress.currentStopOrder);
        const devData = detectRouteDeviation(activeTrip.current_lat, activeTrip.current_lng, stops, 0.5);
        isDeviated = devData.isDeviated;
      }

      // Check signal freshness (> 30s considered stale/weak)
      let signalStatus = 'offline';
      if (activeTrip) {
        const lastLocTime = activeTrip.last_location_at ? new Date(activeTrip.last_location_at).getTime() : 0;
        const diffSec = (Date.now() - lastLocTime) / 1000;
        if (diffSec < 30) {
          signalStatus = 'live';
        } else if (diffSec < 120) {
          signalStatus = 'weak';
        } else {
          signalStatus = 'stale';
        }
      }

      return {
        bus_id: bus._id,
        bus_number: bus.bus_number,
        license_plate: bus.license_plate,
        model: bus.model,
        capacity: bus.capacity,
        status: bus.status,
        has_active_trip: !!activeTrip,
        trip_id: activeTrip?._id || null,
        trip_status: activeTrip?.trip_status || (activeTrip ? 'ON_THE_WAY' : 'NOT_STARTED'),
        emergency: activeTrip?.emergency || { is_active: false },
        driver: {
          id: bus.driver_id?._id || activeTrip?.driver_id?._id,
          name: bus.driver_id?.name || activeTrip?.driver_id?.name || 'Unassigned',
          phone: bus.driver_id?.phone || activeTrip?.driver_id?.phone || '',
          email: bus.driver_id?.email || '',
          license_number: bus.driver_id?.license_number || ''
        },
        route: {
          id: route?._id,
          name: route?.name || 'Unassigned',
          start_location: route?.start_location || '',
          end_location: route?.end_location || '',
          estimated_time: route?.estimated_time || '',
          stops: stops
        },
        location: activeTrip ? {
          latitude: activeTrip.current_lat,
          longitude: activeTrip.current_lng,
          speed: activeTrip.current_speed || 0,
          heading: activeTrip.current_heading || 0,
          last_location_at: activeTrip.last_location_at || activeTrip.started_at
        } : null,
        telemetry: {
          distance_traveled_km: activeTrip?.distance || 0,
          average_speed: activeTrip?.average_speed || 0,
          max_speed: activeTrip?.max_speed || 0,
          check_ins_count: activeTrip?.check_ins?.length || 0,
          eta: eta?.etaText || 'N/A',
          eta_minutes: eta?.minutes || null,
          total_eta_minutes: eta?.totalMinutes || null,
          distance_to_next_km: eta?.distanceToNextKm || null,
          next_stop_name: eta?.nextStopName || null,
          current_stop_order: stopProgress?.currentStopOrder || 0,
          next_stop_order: stopProgress?.nextStopOrder || 1,
          is_deviated: isDeviated,
          signal_status: signalStatus
        }
      };
    });

    res.json(fleet);
  } catch (error) {
    console.error('Error getting live fleet:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/schools/trips/history', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  try {
    const schoolId = req.user.id;
    const { busId, driverId, routeId, startDate, endDate, page = 1, limit = 20 } = req.query;

    const schoolBuses = await Bus.find({ school_id: schoolId }).select('_id');
    const busIds = schoolBuses.map(b => b._id);

    const query = { bus_id: { $in: busIds } };

    if (busId && mongoose.Types.ObjectId.isValid(busId)) query.bus_id = busId;
    if (driverId && mongoose.Types.ObjectId.isValid(driverId)) query.driver_id = driverId;
    if (routeId && mongoose.Types.ObjectId.isValid(routeId)) query.route_id = routeId;

    if (startDate || endDate) {
      query.started_at = {};
      if (startDate) query.started_at.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.started_at.$lte = end;
      }
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await Trip.countDocuments(query);

    const trips = await Trip.find(query)
      .sort({ started_at: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('bus_id', 'bus_number license_plate model capacity')
      .populate('driver_id', 'name phone email')
      .populate('route_id', 'name start_location end_location stops');

    // Get expected students count for routes
    const routeIds = [...new Set(trips.map(t => t.route_id?._id).filter(Boolean))];
    const studentCounts = await Student.aggregate([
      { $match: { route_id: { $in: routeIds } } },
      { $group: { _id: '$route_id', count: { $sum: 1 } } }
    ]);
    const studentCountMap = new Map();
    studentCounts.forEach(sc => studentCountMap.set(sc._id.toString(), sc.count));

    const result = trips.map(t => {
      const start = t.started_at ? new Date(t.started_at).getTime() : 0;
      const end = t.ended_at ? new Date(t.ended_at).getTime() : Date.now();
      const durationMin = start > 0 ? Math.round((end - start) / (1000 * 60)) : 0;
      const expectedStudents = t.route_id?._id ? (studentCountMap.get(t.route_id._id.toString()) || 0) : 0;
      const boardedStudents = t.check_ins?.length || 0;
      const boardingPct = expectedStudents > 0 ? Math.min(100, Math.round((boardedStudents / expectedStudents) * 100)) : 100;
      const safetyScore = calculateSafetyScore(t.max_speed || 0, t.average_speed || 0, t.max_speed > 60 ? 1 : 0, t.route_deviation ? 1 : 0);

      return {
        _id: t._id,
        bus_id: t.bus_id?._id,
        bus_number: t.bus_id?.bus_number || 'N/A',
        license_plate: t.bus_id?.license_plate || '',
        driver_id: t.driver_id?._id,
        driver_name: t.driver_id?.name || 'N/A',
        route_id: t.route_id?._id,
        route_name: t.route_id?.name || 'N/A',
        status: t.status,
        trip_status: t.trip_status || 'COMPLETED',
        started_at: t.started_at,
        ended_at: t.ended_at,
        duration_minutes: durationMin,
        distance_km: t.distance || 0,
        average_speed: t.average_speed || 0,
        max_speed: t.max_speed || 0,
        delay_minutes: t.delay_minutes || 0,
        route_deviation: t.route_deviation || false,
        emergency: t.emergency || { is_active: false },
        expected_students: expectedStudents,
        boarded_students: boardedStudents,
        boarding_percentage: boardingPct,
        safety_score: safetyScore,
        check_ins: t.check_ins || []
      };
    });

    res.json({
      trips: result,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    console.error('Error fetching trip history:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trips/:id/replay', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const trip = await Trip.findById(id)
      .populate('bus_id', 'bus_number license_plate model')
      .populate('driver_id', 'name phone')
      .populate('route_id', 'name start_location end_location stops');

    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    // Ensure authorization
    if (req.user.type === 'school' && trip.bus_id) {
      const bus = await Bus.findById(trip.bus_id);
      if (bus && bus.school_id?.toString() !== req.user.id.toString()) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const locations = await Location.find({ trip_id: id })
      .sort({ recorded_at: 1 })
      .select('latitude longitude speed heading accuracy recorded_at');

    res.json({
      trip: {
        _id: trip._id,
        bus_number: trip.bus_id?.bus_number,
        driver_name: trip.driver_id?.name,
        route_name: trip.route_id?.name,
        started_at: trip.started_at,
        ended_at: trip.ended_at,
        distance: trip.distance,
        average_speed: trip.average_speed,
        max_speed: trip.max_speed,
        check_ins: trip.check_ins || [],
        stops: trip.route_id?.stops || []
      },
      locations: locations.map(loc => ({
        lat: loc.latitude,
        lng: loc.longitude,
        speed: loc.speed || 0,
        heading: loc.heading || 0,
        accuracy: loc.accuracy || 0,
        timestamp: loc.recorded_at
      }))
    });
  } catch (error) {
    console.error('Error fetching trip replay:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/schools/analytics', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  try {
    const schoolId = req.user.id;
    const schoolBuses = await Bus.find({ school_id: schoolId }).select('_id');
    const busIds = schoolBuses.map(b => b._id);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const completedTrips = await Trip.find({
      bus_id: { $in: busIds },
      status: 'completed',
      started_at: { $gte: thirtyDaysAgo }
    })
      .populate('bus_id', 'bus_number')
      .populate('driver_id', 'name')
      .populate('route_id', 'name stops');

    // Compute route delay stats
    const routeDelayMap = new Map();
    const driverSafetyMap = new Map();
    let totalCompletedDistance = 0;
    let totalCompletedDuration = 0;
    let speedingEventsCount = 0;
    let deviationEventsCount = 0;

    completedTrips.forEach(trip => {
      totalCompletedDistance += (trip.distance || 0);
      const dur = trip.ended_at && trip.started_at ? (new Date(trip.ended_at) - new Date(trip.started_at)) / (1000 * 60) : 0;
      totalCompletedDuration += dur;

      if (trip.max_speed > 60) speedingEventsCount++;
      if (trip.route_deviation) deviationEventsCount++;

      const routeName = trip.route_id?.name || 'Unnamed Route';
      if (!routeDelayMap.has(routeName)) {
        routeDelayMap.set(routeName, { count: 0, delaySum: 0, onTimeCount: 0 });
      }
      const rStat = routeDelayMap.get(routeName);
      rStat.count++;
      rStat.delaySum += (trip.delay_minutes || 0);
      if ((trip.delay_minutes || 0) <= 5) rStat.onTimeCount++;

      const driverName = trip.driver_id?.name || 'Unknown';
      if (!driverSafetyMap.has(driverName)) {
        driverSafetyMap.set(driverName, { tripsCount: 0, maxSpeed: 0, avgSpeedSum: 0, deviations: 0 });
      }
      const dStat = driverSafetyMap.get(driverName);
      dStat.tripsCount++;
      dStat.maxSpeed = Math.max(dStat.maxSpeed, trip.max_speed || 0);
      dStat.avgSpeedSum += (trip.average_speed || 0);
      if (trip.route_deviation) dStat.deviations++;
    });

    // Top insights
    const insights = [];
    routeDelayMap.forEach((data, routeName) => {
      const avgDelay = data.count > 0 ? Math.round((data.delaySum / data.count) * 10) / 10 : 0;
      const onTimeRate = data.count > 0 ? Math.round((data.onTimeCount / data.count) * 100) : 100;
      if (avgDelay > 8) {
        insights.push({
          type: 'warning',
          title: `Consistent Delays on ${routeName}`,
          description: `${routeName} averages ${avgDelay} min delay per trip with an on-time rate of ${onTimeRate}%. Consider adjusting stop schedules.`
        });
      } else if (onTimeRate >= 95) {
        insights.push({
          type: 'success',
          title: `Exceptional Performance on ${routeName}`,
          description: `${routeName} achieves ${onTimeRate}% on-time arrival rate across ${data.count} recent trips.`
        });
      }
    });

    if (insights.length === 0) {
      insights.push({
        type: 'info',
        title: 'Fleet Schedule Optimal',
        description: 'All active routes are currently operating within expected time corridors with zero significant recurrent bottlenecks.'
      });
    }

    const driverRankings = [];
    driverSafetyMap.forEach((d, name) => {
      const avgSpeed = d.tripsCount > 0 ? Math.round(d.avgSpeedSum / d.tripsCount) : 0;
      const score = calculateSafetyScore(d.maxSpeed, avgSpeed, d.maxSpeed > 60 ? 1 : 0, d.deviations);
      driverRankings.push({
        name,
        trips_completed: d.tripsCount,
        max_speed: d.maxSpeed,
        average_speed: avgSpeed,
        safety_score: score
      });
    });

    driverRankings.sort((a, b) => b.safety_score - a.safety_score);

    res.json({
      total_trips_analyzed: completedTrips.length,
      total_distance_km: Math.round(totalCompletedDistance),
      total_hours_traveled: Math.round(totalCompletedDuration / 60),
      speeding_events: speedingEventsCount,
      route_deviations: deviationEventsCount,
      insights,
      driver_rankings: driverRankings
    });
  } catch (error) {
    console.error('Error generating analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// DRIVER & TRIP ACTION ENDPOINTS
// ==========================================

app.get('/api/driver/bus-info', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  const bus = await Bus.findOne({ driver_id: req.user.id });
  if (!bus) return res.json({});
  const route = await Route.findById(bus.route_id) || {};
  res.json({ 
    ...bus.toObject(), 
    bus_id: bus._id,
    route_name: route.name, 
    start_location: route.start_location, 
    end_location: route.end_location, 
    estimated_time: route.estimated_time,
    stops: route.stops || []
  });
});

app.post('/api/trips/start', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  const { busId, routeId, lat, lng } = req.body;
  const trip = new Trip({
    bus_id: busId, 
    route_id: routeId || null, 
    driver_id: req.user.id, 
    status: 'ongoing',
    trip_status: 'STARTING',
    current_lat: lat, 
    current_lng: lng,
    distance: 0,
    started_at: new Date()
  });
  await trip.save();

  activeSockets.forEach((s) => {
    if (s.user?.type === 'driver' && s.user?.id === req.user.id) {
      s.join(`trip:${trip._id}`);
      s.user.busId = busId;
    }
  });

  const bus = await Bus.findById(busId);
  const schoolId = bus?.school_id || req.user.schoolId;
  if (schoolId) {
    io.to(`school:${schoolId}`).emit('trip:started', {
      tripId: trip._id,
      busId,
      busNumber: bus?.bus_number,
      driverId: req.user.id,
      timestamp: new Date().toISOString()
    });
  }

  res.json({ message: 'Trip started successfully', tripId: trip._id });
});

app.post('/api/trips/update-location', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  const { tripId, lat, lng, speed = 0, heading = 0, accuracy = 0 } = req.body;
  
  const trip = await Trip.findById(tripId).populate('route_id').populate('bus_id').populate('driver_id');
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  let incrementalDist = 0;
  if (typeof trip.current_lat === 'number' && typeof trip.current_lng === 'number') {
    incrementalDist = calculateDistance(trip.current_lat, trip.current_lng, lat, lng);
    if (incrementalDist > 5) incrementalDist = 0;
  }

  const stops = trip.route_id?.stops || [];
  const stopProgress = determineNextStop(lat, lng, stops, trip.current_stop_order || 0);
  const etaData = calculateETA(lat, lng, speed, stops, stopProgress.currentStopOrder);
  const devData = detectRouteDeviation(lat, lng, stops, 0.5);

  trip.current_lat = lat;
  trip.current_lng = lng;
  trip.current_speed = speed;
  trip.current_heading = heading;
  trip.distance = parseFloat(((trip.distance || 0) + incrementalDist).toFixed(2));
  trip.max_speed = Math.max(trip.max_speed || 0, speed);
  trip.current_stop_order = stopProgress.currentStopOrder;
  trip.next_stop_order = stopProgress.nextStopOrder;
  trip.route_deviation = devData.isDeviated;
  trip.last_location_at = new Date();
  await trip.save();

  await Location.create({
    bus_id: trip.bus_id?._id,
    trip_id: tripId,
    latitude: lat,
    longitude: lng,
    speed,
    heading,
    accuracy,
    recorded_at: new Date()
  });

  if (trip.route_id?._id) {
    await checkProximityAndNotify(lat, lng, trip.route_id._id, tripId);
  }
  
  res.json({ message: 'Location updated', eta: etaData.etaText });
});

app.post('/api/trips/end', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  const { tripId } = req.body;
  const trip = await Trip.findByIdAndUpdate(
    tripId, 
    { status: 'completed', trip_status: 'COMPLETED', ended_at: new Date() },
    { new: true }
  ).populate('bus_id');

  io.to(`trip:${tripId}`).emit('trip:ended', { tripId });

  const schoolId = trip?.bus_id?.school_id || req.user.schoolId;
  if (schoolId) {
    io.to(`school:${schoolId}`).emit('trip:ended', { tripId, busId: trip?.bus_id?._id });
  }

  activeSockets.forEach((s) => {
    if (s.user?.type === 'driver' && s.user?.id === req.user.id) {
      s.leave(`trip:${tripId}`);
      delete s.user.busId;
    }
  });

  res.json({ message: 'Trip ended successfully' });
});

app.post('/api/trips/:id/sos', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  try {
    const { id } = req.params;
    const { reason, lat, lng } = req.body;

    const trip = await Trip.findById(id).populate('bus_id').populate('driver_id').populate('route_id');
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    if (trip.driver_id?._id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Unauthorized to trigger SOS on this trip' });
    }

    trip.emergency = {
      is_active: true,
      triggered_at: new Date(),
      reason: reason || 'Driver Triggered SOS'
    };
    trip.trip_status = 'EMERGENCY';
    await trip.save();

    const schoolId = trip.bus_id?.school_id || trip.driver_id?.school_id;
    const emergencyMsg = `🚨 EMERGENCY ALERT: Bus ${trip.bus_id?.bus_number || 'N/A'} (Driver: ${trip.driver_id?.name || 'N/A'}) reported an emergency!`;

    if (schoolId) {
      await Notification.create({
        school_id: schoolId,
        trip_id: trip._id,
        type: 'emergency',
        message: emergencyMsg,
        latitude: lat || trip.current_lat,
        longitude: lng || trip.current_lng
      });

      io.to(`school:${schoolId}`).emit('emergency:alert', {
        tripId: trip._id,
        busId: trip.bus_id?._id,
        busNumber: trip.bus_id?.bus_number,
        driverName: trip.driver_id?.name,
        driverPhone: trip.driver_id?.phone,
        routeName: trip.route_id?.name,
        lat: lat || trip.current_lat,
        lng: lng || trip.current_lng,
        reason: reason || 'Driver SOS Emergency',
        timestamp: new Date().toISOString()
      });
    }

    io.to(`trip:${trip._id}`).emit('emergency:alert', {
      tripId: trip._id,
      message: emergencyMsg,
      timestamp: new Date().toISOString()
    });

    res.json({ message: 'Emergency alert dispatched to school administration', emergency: trip.emergency });
  } catch (error) {
    console.error('Error triggering SOS:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/trips/:id/sos/acknowledge', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  try {
    const { id } = req.params;
    const trip = await Trip.findById(id).populate('bus_id');
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    if (trip.bus_id?.school_id?.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (trip.emergency) {
      trip.emergency.is_active = false;
      trip.emergency.acknowledged_at = new Date();
    }
    trip.trip_status = 'ON_THE_WAY';
    await trip.save();

    io.to(`school:${req.user.id}`).emit('emergency:acknowledged', { tripId: trip._id });
    io.to(`trip:${trip._id}`).emit('emergency:acknowledged', { tripId: trip._id });

    res.json({ message: 'Emergency marked as acknowledged', trip });
  } catch (error) {
    console.error('Error acknowledging SOS:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trips/notify-delay', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  const { tripId, delayMinutes, reason } = req.body;
  
  const trip = await Trip.findById(tripId).populate('route_id');
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  trip.delay_minutes = (trip.delay_minutes || 0) + parseInt(delayMinutes, 10);
  trip.trip_status = 'DELAYED';
  await trip.save();
  
  const students = await Student.find({ route_id: trip.route_id });
  
  for (const student of students) {
    await Notification.create({
      student_id: student._id,
      parent_phone: student.parent_phone,
      trip_id: tripId,
      type: 'delayed',
      message: `Trip delayed by ${delayMinutes} minutes. ${reason || ''}`,
      latitude: trip.current_lat,
      longitude: trip.current_lng
    });
  }
  
  res.json({ message: 'Delay notification sent' });
});

app.post('/api/trips/scan-qr', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') {
    return res.status(403).json({ error: 'Access denied: Only drivers can scan boarding QR codes' });
  }
  
  const { tripId, qrCode } = req.body;
  if (!tripId || !qrCode || typeof qrCode !== 'string') {
    return res.status(400).json({ error: 'Trip ID and QR code payload are required' });
  }
  
  try {
    let decoded;
    try {
      decoded = Buffer.from(qrCode.trim(), 'base64').toString('utf-8');
    } catch (_) {
      return res.status(400).json({ error: 'Invalid QR code encoding' });
    }

    const parts = decoded.split('-');
    if (parts.length !== 3) {
      return res.status(400).json({ error: 'Invalid QR code format' });
    }

    const [studentId, tripIdFromQR, timeSlot] = parts;

    // Validate time slot: accept current or immediately prior 10s slot
    const currentTimeSlot = Math.floor(Date.now() / 1000 / 10);
    const parsedTimeSlot = parseInt(timeSlot, 10);
    if (isNaN(parsedTimeSlot) || (parsedTimeSlot !== currentTimeSlot && parsedTimeSlot !== currentTimeSlot - 1)) {
      return res.status(400).json({ error: 'QR code has expired. Please ask parent to refresh.' });
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(tripId) || !mongoose.Types.ObjectId.isValid(tripIdFromQR)) {
      return res.status(400).json({ error: 'Invalid trip identifier in QR code' });
    }

    if (tripId.toString() !== tripIdFromQR.toString()) {
      return res.status(400).json({ error: 'QR code does not match this trip' });
    }

    // Validate active trip
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    if (trip.status !== 'ongoing') {
      return res.status(400).json({ error: 'This trip is no longer active' });
    }

    if (trip.driver_id?.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: 'You are not the assigned driver for this trip' });
    }

    // Validate student
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: 'Invalid student identifier in QR code' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student record not found' });
    }

    // Check duplicate check-in
    const alreadyCheckedIn = trip.check_ins?.some(
      ci => ci.student_id?.toString() === studentId.toString()
    );
    if (alreadyCheckedIn) {
      return res.status(400).json({ error: `${student.name} is already checked in on this trip` });
    }

    // Record check-in
    const checkIn = {
      student_id: student._id,
      student_name: student.name,
      pickup_location: student.pickup_location || 'Assigned Stop',
      scanned_at: new Date(),
      status: 'picked_up'
    };

    if (!trip.check_ins) trip.check_ins = [];
    trip.check_ins.push(checkIn);
    await trip.save();

    const notif = await Notification.create({
      student_id: student._id,
      parent_phone: student.parent_phone,
      trip_id: trip._id,
      type: 'picked_up',
      message: `${student.name} has been scanned and safely boarded the bus.`,
      latitude: trip.current_lat,
      longitude: trip.current_lng
    });

    io.to(`trip:${trip._id}`).emit('notification:new', notif);

    res.json({ 
      message: 'Student checked in successfully',
      student_name: student.name,
      pickup_location: student.pickup_location || 'Assigned Stop'
    });
  } catch (error) {
    console.error('Scan QR error:', error);
    res.status(400).json({ error: 'Unable to process QR code' });
  }
});

app.get('/api/trips/active', authenticateToken, async (req, res) => {
  const trips = await Trip.find({ status: 'ongoing' })
    .populate('bus_id', 'bus_number license_plate model')
    .populate('driver_id', 'name phone')
    .populate('route_id', 'name start_location end_location stops');
  
  const result = trips.map(t => {
    const stops = t.route_id?.stops || [];
    const stopProgress = (typeof t.current_lat === 'number' && typeof t.current_lng === 'number')
      ? determineNextStop(t.current_lat, t.current_lng, stops, t.current_stop_order || 0)
      : null;
    const etaData = (typeof t.current_lat === 'number' && typeof t.current_lng === 'number')
      ? calculateETA(t.current_lat, t.current_lng, t.current_speed || 0, stops, stopProgress?.currentStopOrder || 0)
      : null;

    return {
      ...t.toObject(),
      bus_number: t.bus_id?.bus_number,
      license_plate: t.bus_id?.license_plate,
      driver_name: t.driver_id?.name,
      driver_phone: t.driver_id?.phone,
      route_name: t.route_id?.name,
      check_in_count: t.check_ins?.length || 0,
      eta: etaData?.etaText || 'N/A',
      eta_minutes: etaData?.minutes || null,
      next_stop: etaData?.nextStopName || null,
      current_stop_order: stopProgress?.currentStopOrder || 0,
      next_stop_order: stopProgress?.nextStopOrder || 1
    };
  });
  res.json(result);
});

app.get('/api/driver/trip-details', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  
  const trip = await Trip.findOne({ driver_id: req.user.id, status: 'ongoing' })
    .populate('bus_id', 'bus_number license_plate model')
    .populate('route_id', 'name start_location end_location stops')
    .populate('check_ins.student_id', 'name parent_phone pickup_location');
  
  if (!trip) return res.json(null);

  const stops = trip.route_id?.stops || [];
  const stopProgress = (typeof trip.current_lat === 'number' && typeof trip.current_lng === 'number')
    ? determineNextStop(trip.current_lat, trip.current_lng, stops, trip.current_stop_order || 0)
    : null;
  const etaData = (typeof trip.current_lat === 'number' && typeof trip.current_lng === 'number')
    ? calculateETA(trip.current_lat, trip.current_lng, trip.current_speed || 0, stops, stopProgress?.currentStopOrder || 0)
    : null;
  
  res.json({
    ...trip.toObject(),
    eta: etaData?.etaText || 'N/A',
    eta_minutes: etaData?.minutes || null,
    distance_to_next_km: etaData?.distanceToNextKm || null,
    next_stop_name: etaData?.nextStopName || null,
    current_stop_order: stopProgress?.currentStopOrder || 0,
    next_stop_order: stopProgress?.nextStopOrder || 1
  });
});

app.get('/api/parents/dashboard', authenticateToken, (req, res) => {
  if (req.user.type !== 'parent') return res.status(403).json({ error: 'Access denied' });
  res.json({ message: 'Parent dashboard data' });
});

app.get('/api/parents/trip-status', authenticateToken, async (req, res) => {
  if (req.user.type !== 'parent') return res.status(403).json({ error: 'Access denied' });
  
  const studentId = req.user.studentId;
  const student = await Student.findById(studentId);
  if (!student) return res.json(null);
  
  const trip = await Trip.findOne({ 
    status: 'ongoing',
    route_id: student.route_id
  })
    .populate('bus_id', 'bus_number license_plate model')
    .populate('driver_id', 'name phone')
    .populate('route_id', 'name start_location end_location stops');
  
  if (!trip) return res.json(null);
  
  const currentQR = generateTimeBasedQR(studentId, trip._id);
  const stops = trip.route_id?.stops || [];
  const stopProgress = (typeof trip.current_lat === 'number' && typeof trip.current_lng === 'number')
    ? determineNextStop(trip.current_lat, trip.current_lng, stops, trip.current_stop_order || 0)
    : null;
  const etaData = (typeof trip.current_lat === 'number' && typeof trip.current_lng === 'number')
    ? calculateETA(trip.current_lat, trip.current_lng, trip.current_speed || 0, stops, stopProgress?.currentStopOrder || 0)
    : null;
  
  res.json({ 
    ...trip.toObject(), 
    bus_number: trip.bus_id?.bus_number,
    bus_model: trip.bus_id?.model || '',
    license_plate: trip.bus_id?.license_plate || '',
    driver_name: trip.driver_id?.name || 'Assigned Driver',
    driver_phone: trip.driver_id?.phone || '',
    route_name: trip.route_id?.name,
    student_name: student.name,
    pickup_location: student.pickup_location,
    qr_code: currentQR,
    qr_expires_in: 10,
    eta: etaData?.etaText || 'ETA ~5 min',
    eta_minutes: etaData?.minutes || 5,
    total_eta_minutes: etaData?.totalMinutes || 15,
    distance_to_next_km: etaData?.distanceToNextKm || 0,
    next_stop_name: etaData?.nextStopName || 'Upcoming Stop',
    current_stop_order: stopProgress?.currentStopOrder || 0,
    next_stop_order: stopProgress?.nextStopOrder || 1,
    stops: stops,
    is_deviated: trip.route_deviation || false,
    last_location_at: trip.last_location_at || trip.started_at
  });
});

app.get('/api/notifications', authenticateToken, async (req, res) => {
  if (req.user.type !== 'parent') return res.status(403).json({ error: 'Access denied' });
  
  const studentId = req.user.studentId;
  const parentPhone = req.user.parent_phone;
  
  const notifications = await Notification.find({ 
    $or: [
      { student_id: studentId },
      { parent_phone: parentPhone }
    ]
  })
    .sort({ created_at: -1 })
    .limit(30);
  
  res.json(notifications);
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  if (req.user.type !== 'parent') return res.status(403).json({ error: 'Access denied' });
  
  await Notification.findByIdAndUpdate(req.params.id, { read: true });
  res.json({ message: 'Notification marked as read' });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'School Bus Tracking API', 
    status: 'running',
    version: '2.0.0'
  });
});

const serverStartTime = Date.now();

app.get('/api/health', async (req, res) => {
  try {
    const mongoState = mongoose.connection.readyState;
    const mongoStatusMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    const activeTripsCount = await Trip.countDocuments({ status: 'ongoing' }).catch(() => 0);

    res.json({ 
      status: mongoState === 1 ? 'healthy' : 'degraded',
      server: 'running',
      database: mongoStatusMap[mongoState] || 'unknown',
      uptime_seconds: Math.floor((Date.now() - serverStartTime) / 1000),
      active_sockets_count: activeSockets.size,
      active_trips_count: activeTripsCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

app.get('/api/health/live', (req, res) => {
  res.status(200).json({ status: 'live', timestamp: new Date().toISOString() });
});

app.get('/api/health/ready', (req, res) => {
  const isReady = mongoose.connection.readyState === 1;
  if (isReady) {
    res.status(200).json({ status: 'ready', database: 'connected' });
  } else {
    res.status(503).json({ status: 'not_ready', database: 'disconnected' });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;