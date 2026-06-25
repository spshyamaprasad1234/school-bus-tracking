import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

let socket = null;

export function connectSocket() {
  if (socket?.connected) return socket;

  const token = localStorage.getItem('token');
  if (!token) return null;

  socket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000
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
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinTripRoom(tripId) {
  if (socket?.connected && tripId) {
    socket.emit('parent:join-trip', tripId);
  }
}

export function emitLocationUpdate(data) {
  if (socket?.connected) {
    socket.emit('driver:location-update', data);
  }
}

export function onTripLocationUpdate(callback) {
  if (socket) {
    socket.on('trip:location-update', callback);
    return () => socket.off('trip:location-update', callback);
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
