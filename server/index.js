const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const Queue = require('./models/Queue');
const Setting = require('./models/Setting');
require('./database'); // Initialize DB seeding

const { pushMessage, client: lineClient } = require('./lineService');
const line = require('@line/bot-sdk');

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Mongoose connected successfully.'))
    .catch((err) => console.error('Mongoose connection error:', err));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for dev
        methods: ["GET", "POST"]
    }
});

app.use(cors());

// --- LINE Webhook Config ---
const lineConfig = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// Webhook Route
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

// Event Handler
function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
    }

    // Reply with User ID
    const userId = event.source.userId;
    const replyText = `สวัสดีครับ! นี่คือ ID ของคุณ:\n\n${userId}\n\n(กดคัดลอก แล้วนำไปใส่ในช่องจองคิวได้เลยครับ)`;

    return lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: replyText
    });
}

// --- Body Parser for other routes ---
app.use(express.json());

// Helper: Broadcast update
async function broadcastUpdate() {
    // Return only active queues (waiting, called, dining)
    const queues = await Queue.find({ status: { $in: ['waiting', 'called', 'dining'] } }).sort({ _id: 1 }).lean();
    queues.forEach(q => { q.id = q._id.toString(); });

    // Calculate Wait Time Estimate
    const avgTimeSetting = await Setting.findOne({ key: 'avg_time' }).lean();
    const avgTime = parseInt(avgTimeSetting?.value || 30);

    // Simple Heuristic: 
    // We assume 1 table clears every (AvgTime / TotalTables) minutes.
    // Let's assume we have 10 tables for now (fixed constant).
    const TOTAL_TABLES = 10;
    const timePerTable = avgTime / TOTAL_TABLES;

    // Add estimated wait time to each queue
    let waitingCount = 0;
    const queuesWithTime = queues.map(q => {
        if (q.status === 'called' || q.status === 'dining') {
            return { ...q, estimatedWaitTime: 0 };
        }
        // For waiting queues
        // Wait time = (My Position in Waiting List) * TimePerTable
        const waitMins = Math.ceil((waitingCount + 1) * timePerTable);
        waitingCount++;
        return { ...q, estimatedWaitTime: waitMins };
    });

    io.emit('queue_updated', queuesWithTime);
}

// --- API Routes ---

// Get active queues
app.get('/api/queues', async (req, res) => {
    const queues = await Queue.find({ status: { $in: ['waiting', 'called', 'dining'] } }).sort({ _id: 1 }).lean();
    queues.forEach(q => { q.id = q._id.toString(); });

    // Re-calculate times (duplicate logic, should refactor but fine for now)
    const avgTimeSetting = await Setting.findOne({ key: 'avg_time' }).lean();
    const avgTime = parseInt(avgTimeSetting?.value || 30);
    const TOTAL_TABLES = 10;
    const timePerTable = avgTime / TOTAL_TABLES;

    let waitingCount = 0;
    const queuesWithTime = queues.map(q => {
        if (q.status === 'called' || q.status === 'dining') return { ...q, estimatedWaitTime: 0 };
        const waitMins = Math.ceil((waitingCount + 1) * timePerTable);
        waitingCount++;
        return { ...q, estimatedWaitTime: waitMins };
    });

    res.json(queuesWithTime);
});

// Get single queue status
app.get('/api/queues/:id', async (req, res) => {
    try {
        const queue = await Queue.findById(req.params.id).lean();
        if (!queue) return res.status(404).json({ error: 'Queue not found' });
        queue.id = queue._id.toString();

        // Calculate position
        if (queue.status === 'waiting') {
            const position = await Queue.countDocuments({ status: 'waiting', _id: { $lt: queue._id } });
            const avgTimeSetting = await Setting.findOne({ key: 'avg_time' }).lean();
            const avgTime = parseInt(avgTimeSetting?.value || 30);
            const timePerTable = avgTime / 10;
            queue.estimatedWaitTime = Math.ceil((position + 1) * timePerTable);
            queue.queueAhead = position;
        }

        res.json(queue);
    } catch (err) {
        res.status(400).json({ error: 'Invalid ID' });
    }
});

// Reserve Queue (New Dynamic)
app.post('/api/reserve', async (req, res) => {
    const { name, lineId, pax, phone, timeSlot } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    // Check if Line ID already has active queue
    if (lineId) {
        const existing = await Queue.findOne({ line_id: lineId, status: { $in: ['waiting', 'called', 'dining'] } }).lean();
        if (existing) {
            return res.status(409).json({ error: 'คุณมีคิวอยู่แล้ว (You already have a queue)', queueId: existing._id.toString() });
        }
    }

    try {
        const newQueue = await Queue.create({
            customer_name: name,
            line_id: lineId || null,
            phone_number: phone || null,
            pax: pax || 1,
            time_slot: timeSlot || null,
            status: 'waiting',
            history: [{ action: 'reserved' }]
        });

        broadcastUpdate();
        res.json({ success: true, id: newQueue._id.toString() });
    } catch (err) {
        console.error('Error in /api/reserve:', err);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
});

// Cancel Queue (Customer)
app.post('/api/cancel', async (req, res) => {
    try {
        const { id, lineId } = req.body;
        const queue = await Queue.findById(id);

        if (!queue) return res.status(404).json({ error: 'Queue not found' });

        // Verify ownership if lineId passed (optional security)
        if (lineId && queue.line_id !== lineId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        queue.status = 'cancelled';
        queue.history.push({ action: 'cancelled' });
        await queue.save();

        broadcastUpdate();
        res.json({ success: true });
    } catch (err) {
        console.error('Error in /api/cancel:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin: Call Queue
app.post('/api/admin/call', async (req, res) => {
    try {
        const { id } = req.body;
        const queue = await Queue.findById(id);

        if (!queue) return res.status(404).json({ error: 'Queue not found' });

        queue.status = 'called';
        queue.history.push({ action: 'called' });
        await queue.save();

        // Send LINE
        if (queue.line_id) {
            const msg = `ถึงคิวของคุณแล้ว! (คิวที่ ${id})\nกรุณามาที่หน้าร้านได้เลยครับ\n\nYour queue (${id}) is ready!`;
            await pushMessage(queue.line_id, msg);
        }

        broadcastUpdate();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin: Seat Customer (Start Timer)
app.post('/api/admin/seat', async (req, res) => {
    try {
        const { id } = req.body;
        const queue = await Queue.findById(id);
        if (!queue) return res.status(404).json({ error: 'Queue not found' });

        queue.status = 'dining';
        queue.start_time = new Date();
        queue.history.push({ action: 'seated' });
        await queue.save();

        broadcastUpdate();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin: Complete Queue (Was Clear)
app.post('/api/admin/complete', async (req, res) => {
    try {
        const { id } = req.body;
        const queue = await Queue.findById(id);
        if (!queue) return res.status(404).json({ error: 'Queue not found' });

        queue.status = 'completed';
        queue.end_time = new Date();
        queue.history.push({ action: 'completed' });
        await queue.save();

        broadcastUpdate();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin: Get Stats
app.get('/api/admin/stats', async (req, res) => {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const total = await Queue.countDocuments({ created_at: { $gte: startOfToday } });
        const completed = await Queue.countDocuments({ status: 'completed', created_at: { $gte: startOfToday } });
        const cancelled = await Queue.countDocuments({ status: 'cancelled', created_at: { $gte: startOfToday } });
        const waiting = await Queue.countDocuments({ status: 'waiting' });

        res.json({ total, completed, cancelled, waiting });
    } catch (err) {
        console.error('Error in /api/admin/stats:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin: Update Settings
app.post('/api/admin/settings', async (req, res) => {
    const { avgTime, avgWaitTime } = req.body;
    if (avgTime) {
        await Setting.updateOne({ key: 'avg_time' }, { value: String(avgTime) }, { upsert: true });
    }
    if (avgWaitTime) {
        await Setting.updateOne({ key: 'avg_wait_time' }, { value: String(avgWaitTime) }, { upsert: true });
    }
    broadcastUpdate(); // Update estimates
    res.json({ success: true });
});

// Serve Static Files (Frontend)
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// Handle SPA (React Router) - Send index.html for any other requests
// EXCLUDE /api routes
app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return res.status(404).json({ error: 'Not Found' });
    }
    res.sendFile(path.join(clientDist, 'index.html'));
});

// Socket Connection
io.on('connection', async (socket) => {
    console.log('Client connected');
    // Trigger an update just for this client (hacky but works to reuse logic)
    // Ideally we extract the logic to 'getQueuesData()' and emit that.

    // Send initial state manually
    try {
        const queues = await Queue.find({ status: { $in: ['waiting', 'called', 'dining'] } }).sort({ _id: 1 }).lean();
        queues.forEach(q => { q.id = q._id.toString(); });
        socket.emit('queue_updated', queues);
    } catch (error) {
        console.error('Socket init error:', error);
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
