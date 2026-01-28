import axios from 'axios';
import { io } from 'socket.io-client';

// Auto-detect production mode
const isProd = import.meta.env.PROD;
// In production, use relative path (same origin). In dev, use localhost or env var.
const API_URL = isProd ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3000');

console.log('Connecting to API:', API_URL);

export const api = axios.create({
    baseURL: `${API_URL}/api`,
});

export const socket = io(API_URL);
