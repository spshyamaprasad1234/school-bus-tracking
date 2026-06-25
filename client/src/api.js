import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL + '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const schoolAPI = {
  signup: (data) => api.post('/schools/signup', data),
  login: (data) => api.post('/schools/login', data),
  getInfo: () => api.get('/schools/info'),
  getDashboard: () => api.get('/schools/dashboard'),
  getDrivers: () => api.get('/schools/drivers'),
  addDriver: (data) => api.post('/schools/drivers', data),
  updateDriver: (id, data) => api.put(`/schools/drivers/${id}`, data),
  deleteDriver: (id) => api.delete(`/schools/drivers/${id}`),
  getBuses: () => api.get('/schools/buses'),
  addBus: (data) => api.post('/schools/buses', data),
  updateBus: (id, data) => api.put(`/schools/buses/${id}`, data),
  deleteBus: (id) => api.delete(`/schools/buses/${id}`),
  getRoutes: () => api.get('/schools/routes'),
  addRoute: (data) => api.post('/schools/routes', data),
  updateRoute: (id, data) => api.put(`/schools/routes/${id}`, data),
  deleteRoute: (id) => api.delete(`/schools/routes/${id}`),
  getStudents: () => api.get('/schools/students'),
  addStudent: (data) => api.post('/schools/students', data),
  updateStudent: (id, data) => api.put(`/schools/students/${id}`, data),
  deleteStudent: (id) => api.delete(`/schools/students/${id}`)
};

export const driverAPI = {
  login: (data) => api.post('/drivers/login', data),
  getBusInfo: () => api.get('/driver/bus-info'),
  getTripDetails: () => api.get('/driver/trip-details'),
  startTrip: (data) => api.post('/trips/start', data),
  updateLocation: (data) => api.post('/trips/update-location', data),
  endTrip: (data) => api.post('/trips/end', data),
  scanQR: (data) => api.post('/trips/scan-qr', data),
  notifyDelay: (data) => api.post('/trips/notify-delay', data)
};

export const parentAPI = {
  login: (data) => api.post('/parents/login', data),
  getDashboard: () => api.get('/parents/dashboard'),
  getTripStatus: () => api.get('/parents/trip-status'),
  getNotifications: () => api.get('/notifications'),
  markNotificationRead: (id) => api.put(`/notifications/${id}/read`)
};

export const tripAPI = {
  getActiveTrips: () => api.get('/trips/active')
};

export default api;