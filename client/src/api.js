import axios from 'axios';
import { io } from 'socket.io-client';

// Use environment variable for production, fallback to localhost for dev
// Use current origin for production (relative path), fallback to localhost:3000 for local dev
const isDev = import.meta.env.MODE === 'development';
const API_URL = isDev ? 'http://localhost:3000' : '';

console.log('Connecting to API:', API_URL);

export const api = axios.create({
    baseURL: `${API_URL}/api`,
});

export const socket = io(API_URL);
