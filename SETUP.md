# Thai QR Code Queue System Setup

## Prerequisites
- Node.js (v18+)
- NPM

## Installation

### 1. Backend (Server) setup
```bash
cd server
npm install
```

### 2. Frontend (Client) setup
```bash
cd client
npm install
```

## Running the System

You need to run both the server and client terminals.

**Terminal 1 (Backend):**
```bash
cd server
node index.js
```
Server runs on `http://localhost:3000`.

**Terminal 2 (Frontend):**
```bash
cd client
npm run dev
```
Client runs on `http://localhost:5173`.

## Usage

1. **Admin Dashboard**: Open `http://localhost:5173/admin`
2. **Customer View**: 
   - Simulate a QR code scan by visiting `http://localhost:5173/queue/1` (change 1 to 1-10).
   - Or use the links on the Home page (`http://localhost:5173/`).

## LINE Integration (Optional)
To enable real LINE notifications:
1. Create a provider and channel on [LINE Developers Console](https://developers.line.biz/).
2. Get `Channel Access Token` and `Channel Secret`.
3. Create a `.env` file in `server/` folder:
   ```
   LINE_CHANNEL_ACCESS_TOKEN=your_token
   LINE_CHANNEL_SECRET=your_secret
   ```
4. Without this, notifications are logged to the backend console.

### LINE LIFF (Auto Profile & Login)
To enable the "One-Click Reserve" feature:
1. Create a `LIFF` channel in LINE Developers.
2. Set Endpoint URL to your frontend URL (e.g., https://your-ngrok-url.app).
3. Select Scopes: `profile`, `openid`.
4. Create a `.env` file in `client/` folder:
   ```
   VITE_LIFF_ID=your_liff_id_here
   ```
