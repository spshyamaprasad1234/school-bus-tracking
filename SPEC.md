# Smart School Bus Tracking & Safety System - Specification

## 1. Project Overview
- **Project Name**: Smart School Bus Tracking & Safety System
- **Project Type**: Full-stack Web Application
- **Core Functionality**: Real-time GPS tracking of school buses with three dashboards (School, Driver, Parent) for managing and monitoring school transportation
- **Target Users**: School administrators, Bus drivers, Parents

## 2. Technology Stack
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js with Express
- **Database**: MySQL
- **APIs**: Google Maps JavaScript API, Geolocation API

## 3. Database Schema

### Tables
1. **schools**: id, name, email, password, school_code, address, phone, created_at
2. **drivers**: id, school_id, name, email, phone, license_number, password, created_at
3. **buses**: id, school_id, driver_id, bus_number, license_plate, model, capacity, status
4. **routes**: id, school_id, name, start_location, end_location, waypoints (JSON), estimated_time
5. **students**: id, school_id, name, parent_phone, pickup_location, route_id, qr_code
6. **trips**: id, bus_id, route_id, driver_id, status, started_at, ended_at, current_lat, current_lng
7. **boarding_records**: id, student_id, trip_id, boarding_status, timestamp

## 4. Pages

### Authentication Pages
- **School Signup**: Name, email, password, address, phone → generates unique 6-char school_code
- **School Login**: Email + password
- **Driver Login**: Email + password
- **Parent Login**: School code + parent phone number

### Dashboard Pages
- School Dashboard (manage drivers, buses, routes, students)
- Driver Dashboard (start trip, update location, mark boarding)
- Parent Dashboard (view bus location, receive notifications)

## 5. System Workflow
1. School signs up → receives unique school_code
2. School adds drivers with credentials
3. School adds buses and assigns routes
4. Parent registers with school_code
5. Driver logs in → starts trip → location tracked
6. Parents view live location and receive alerts

## 6. Acceptance Criteria
1. School can signup and receive unique school_code
2. School can add drivers with login credentials
3. School can add buses and assign drivers
4. Driver can login and start trip
5. Driver location updates every 10 seconds
6. Parent can login with school code
7. Parent can view live bus location on map
8. Parent receives notifications for arrival/delays