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
  }

  socket.on('driver:location-update', async (data) => {
    if (socket.user.type !== 'driver') return;
    const { tripId, lat, lng, speed, heading } = data;
    
    await Trip.findByIdAndUpdate(tripId, { current_lat: lat, current_lng: lng, current_speed: speed || 0 });
    
    await Location.create({
      bus_id: socket.user.busId,
      trip_id: tripId,
      latitude: lat,
      longitude: lng,
      speed: speed || 0,
      heading: heading || 0,
      recorded_at: new Date()
    });

    const trip = await Trip.findById(tripId);
    if (trip && trip.route_id) {
      checkProximityAndNotify(lat, lng, trip.route_id, tripId);
    }

    socket.to(`trip:${tripId}`).emit('trip:location-update', {
      tripId,
      lat,
      lng,
      speed: speed || 0,
      heading: heading || 0,
      timestamp: new Date().toISOString()
    });
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
  stop_id: { type: mongoose.Schema.Types.ObjectId },
  qr_code: String,
  created_at: { type: Date, default: Date.now }
});

const tripSchema = new mongoose.Schema({
  bus_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus' },
  route_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
  driver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
  status: { type: String, default: 'ongoing' },
  current_lat: Number,
  current_lng: Number,
  current_speed: { type: Number, default: 0 },
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
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  parent_phone: String,
  trip_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
  type: { type: String, enum: ['approaching', 'arrived', 'picked_up', 'delayed'], default: 'approaching' },
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
  recorded_at: { type: Date, default: Date.now }
});

locationSchema.index({ trip_id: 1, recorded_at: -1 });

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

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function checkProximityAndNotify(lat, lng, routeId, tripId) {
  const route = await Route.findById(routeId);
  if (!route || !route.stops) return;

  const students = await Student.find({ route_id: routeId });
  
  for (const stop of route.stops) {
    if (stop.latitude && stop.longitude) {
      const distance = calculateDistance(lat, lng, stop.latitude, stop.longitude);
      
      if (distance < 0.5) {
        for (const student of students) {
          const existingApproaching = await Notification.findOne({
            student_id: student._id,
            trip_id: tripId,
            type: 'approaching',
            created_at: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
          });
          
          if (!existingApproaching) {
            await Notification.create({
              student_id: student._id,
              parent_phone: student.parent_phone,
              trip_id: tripId,
              type: 'approaching',
              message: `Bus is approaching ${stop.name}`,
              latitude: lat,
              longitude: lng
            });
          }
        }
      }
      
      if (distance < 0.1) {
        for (const student of students) {
          const existingArrived = await Notification.findOne({
            student_id: student._id,
            trip_id: tripId,
            type: 'arrived',
            created_at: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
          });
          
          if (!existingArrived) {
            await Notification.create({
              student_id: student._id,
              parent_phone: student.parent_phone,
              trip_id: tripId,
              type: 'arrived',
              message: `Bus has arrived at ${stop.name}`,
              latitude: lat,
              longitude: lng
            });
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

app.delete('/api/schools/drivers/:id', authenticateToken, async (req, res) => {
  if (req.user.type !== 'school') return res.status(403).json({ error: 'Access denied' });
  await Driver.findOneAndDelete({ _id: req.params.id, school_id: req.user.id });
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

app.get('/api/driver/bus-info', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  const bus = await Bus.findOne({ driver_id: req.user.id });
  if (!bus) return res.json({});
  const route = await Route.findById(bus.route_id) || {};
  res.json({ ...bus.toObject(), route_name: route.name, start_location: route.start_location, end_location: route.end_location, estimated_time: route.estimated_time });
});

app.post('/api/trips/start', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  const { busId, routeId, lat, lng } = req.body;
  const trip = new Trip({
    bus_id: busId, route_id: routeId || null, driver_id: req.user.id, 
    status: 'ongoing', current_lat: lat, current_lng: lng
  });
  await trip.save();

  activeSockets.forEach((s) => {
    if (s.user?.type === 'driver' && s.user?.id === req.user.id) {
      s.join(`trip:${trip._id}`);
      s.user.busId = busId;
    }
  });

  res.json({ message: 'Trip started successfully', tripId: trip._id });
});

app.post('/api/trips/update-location', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  const { tripId, lat, lng } = req.body;
  await Trip.findByIdAndUpdate(tripId, { current_lat: lat, current_lng: lng });
  
  const trip = await Trip.findById(tripId);
  if (trip && trip.route_id) {
    await checkProximityAndNotify(lat, lng, trip.route_id, tripId);
  }
  
  res.json({ message: 'Location updated' });
});

app.post('/api/trips/end', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  const { tripId } = req.body;
  await Trip.findByIdAndUpdate(tripId, { status: 'completed', ended_at: new Date() });

  io.to(`trip:${tripId}`).emit('trip:ended', { tripId });
  activeSockets.forEach((s) => {
    if (s.user?.type === 'driver' && s.user?.id === req.user.id) {
      s.leave(`trip:${tripId}`);
      delete s.user.busId;
    }
  });

  res.json({ message: 'Trip ended successfully' });
});

app.post('/api/trips/notify-delay', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  const { tripId, delayMinutes, reason } = req.body;
  
  const trip = await Trip.findById(tripId).populate('route_id');
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  
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
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  
  const { tripId, qrCode } = req.body;
  
  try {
    const decoded = Buffer.from(qrCode, 'base64').toString('utf-8');
    const [studentId, tripIdFromQR, timeSlot] = decoded.split('-');
    
    const currentTimeSlot = Math.floor(Date.now() / 1000 / 10);
    if (parseInt(timeSlot) !== currentTimeSlot) {
      return res.status(400).json({ error: 'QR code expired. Please ask parent to refresh.' });
    }
    
    const student = await Student.findById(studentId);
    if (!student) return res.status(400).json({ error: 'Invalid QR code' });
    
    const trip = await Trip.findById(tripId);
    if (!trip || trip._id.toString() !== tripIdFromQR) {
      return res.status(400).json({ error: 'QR code does not match trip' });
    }
    
    const checkIn = {
      student_id: studentId,
      student_name: student.name,
      pickup_location: student.pickup_location,
      scanned_at: new Date(),
      status: 'picked_up'
    };
    
    if (!trip.check_ins) trip.check_ins = [];
    trip.check_ins.push(checkIn);
    await trip.save();
    
    await Notification.create({
      student_id: studentId,
      parent_phone: student.parent_phone,
      trip_id: tripId,
      type: 'picked_up',
      message: `${student.name} has been picked up`,
      latitude: trip.current_lat,
      longitude: trip.current_lng
    });
    
    res.json({ 
      message: 'Student checked in successfully',
      student_name: student.name,
      pickup_location: student.pickup_location
    });
  } catch (error) {
    res.status(400).json({ error: 'Invalid QR code format' });
  }
});

app.get('/api/trips/active', authenticateToken, async (req, res) => {
  const trips = await Trip.find({ status: 'ongoing' })
    .populate('bus_id', 'bus_number')
    .populate('driver_id', 'name')
    .populate('route_id', 'name');
  
  const result = trips.map(t => ({
    ...t.toObject(),
    bus_number: t.bus_id?.bus_number,
    driver_name: t.driver_id?.name,
    route_name: t.route_id?.name,
    check_in_count: t.check_ins?.length || 0
  }));
  res.json(result);
});

app.get('/api/driver/trip-details', authenticateToken, async (req, res) => {
  if (req.user.type !== 'driver') return res.status(403).json({ error: 'Access denied' });
  
  const trip = await Trip.findOne({ driver_id: req.user.id, status: 'ongoing' })
    .populate('bus_id', 'bus_number license_plate')
    .populate('route_id', 'name start_location end_location')
    .populate('check_ins.student_id', 'name parent_phone pickup_location');
  
  if (!trip) return res.json(null);
  
  res.json(trip);
});

app.get('/api/parents/dashboard', authenticateToken, (req, res) => {
  if (req.user.type !== 'parent') return res.status(403).json({ error: 'Access denied' });
  res.json({ message: 'Parent dashboard data' });
});

app.get('/api/parents/trip-status', authenticateToken, async (req, res) => {
  if (req.user.type !== 'parent') return res.status(403).json({ error: 'Access denied' });
  
  const schoolId = req.user.schoolId;
  const studentId = req.user.studentId;
  
  const student = await Student.findById(studentId);
  if (!student) return res.json(null);
  
  const trip = await Trip.findOne({ 
    status: 'ongoing',
    route_id: student.route_id
  })
    .populate('bus_id', 'bus_number')
    .populate('route_id', 'name');
  
  if (!trip) return res.json(null);
  
  const currentQR = generateTimeBasedQR(studentId, trip._id);
  
  res.json({ 
    ...trip.toObject(), 
    bus_number: trip.bus_id?.bus_number, 
    route_name: trip.route_id?.name,
    student_name: student.name,
    qr_code: currentQR,
    qr_expires_in: 10
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
    .limit(20);
  
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
    version: '1.0.0'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;