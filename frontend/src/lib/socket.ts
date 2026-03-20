import { io } from 'socket.io-client';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.');
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (isLocal ? `http://${window.location.hostname}:5000` : '');
if (!SOCKET_URL && !isLocal) {
  console.warn('VITE_SOCKET_URL is required for production deployments!');
}

export const socket = io(SOCKET_URL, {
  autoConnect: false,
});
