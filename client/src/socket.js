import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';

let socket = null;
let activeTripId = null;

export function connectSocket() {
  if (socket?.connected) return socket;

  const token = localStorage.getItem('token');
  if (!token) return null;

  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });

    socket.on('connect', () => {
      if (activeTripId) {
        socket.emit('parent:join-trip', activeTripId);
      }
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        socket = null;
      }
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      if (activeTripId) {
        socket.emit('parent:join-trip', activeTripId);
      }
    });
  } else if (!socket.connected) {
    socket.auth = { token };
    socket.connect();
  }

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  activeTripId = null;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinTripRoom(tripId) {
  activeTripId = tripId;
  if (socket?.connected && tripId) {
    socket.emit('parent:join-trip', tripId);
  }
}

let activeSchoolId = null;

export function joinSchoolFleet(schoolId) {
  activeSchoolId = schoolId;
  if (socket?.connected && schoolId) {
    socket.emit('school:join-fleet', schoolId);
  }
}

export function emitLocationUpdate(data) {
  if (socket?.connected) {
    socket.emit('driver:location-update', data);
  }
}

export function emitDriverSOS(data) {
  if (socket?.connected) {
    socket.emit('driver:sos', data);
  }
}

export function onTripLocationUpdate(callback) {
  if (socket) {
    socket.on('trip:location-update', callback);
    return () => socket.off('trip:location-update', callback);
  }
  return () => {};
}

export function onFleetLocationUpdate(callback) {
  if (socket) {
    socket.on('fleet:location-update', callback);
    return () => socket.off('fleet:location-update', callback);
  }
  return () => {};
}

export function onFleetAlert(callback) {
  if (socket) {
    socket.on('fleet:alert', callback);
    return () => socket.off('fleet:alert', callback);
  }
  return () => {};
}

export function onEmergencyAlert(callback) {
  if (socket) {
    socket.on('emergency:alert', callback);
    return () => socket.off('emergency:alert', callback);
  }
  return () => {};
}

export function onEmergencyAcknowledged(callback) {
  if (socket) {
    socket.on('emergency:acknowledged', callback);
    return () => socket.off('emergency:acknowledged', callback);
  }
  return () => {};
}

export function onTripStarted(callback) {
  if (socket) {
    socket.on('trip:started', callback);
    return () => socket.off('trip:started', callback);
  }
  return () => {};
}

export function onTripEnded(callback) {
  if (socket) {
    socket.on('trip:ended', callback);
    return () => socket.off('trip:ended', callback);
  }
  return () => {};
}

export function onNewNotification(callback) {
  if (socket) {
    socket.on('notification:new', callback);
    return () => socket.off('notification:new', callback);
  }
  return () => {};
}

