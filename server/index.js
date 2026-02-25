const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const Queue = require('./models/Queue');
const Setting = require('./models/Setting');
const Counter = require('./models/Counter');
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

// Helper: Get current Session ID
async function getCurrentSessionId() {
    let setting = await Setting.findOne({ key: 'active_session' }).lean();
    if (!setting || !setting.value) {
        throw new Error('NO_ACTIVE_SESSION');
    }
    return setting.value;
}

// Helper: Broadcast update
async function broadcastUpdate() {
    // Return only active queues (waiting, called, dining)
    try {
        const sessionId = await getCurrentSessionId();
        const queues = await Queue.find({ sessionId, status: { $in: ['waiting', 'called', 'dining'] } }).sort({ queueNumber: 1 }).lean();
        queues.forEach(q => {
            q.id = q.queueNumber !== undefined ? q.queueNumber : q._id.toString();
        });

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
    } catch (e) {
        if (e.message === 'NO_ACTIVE_SESSION') {
            io.emit('queue_updated', []); // Empty queues
        } else {
            console.error('Broadcast update error:', e);
        }
    }
}

// --- API Routes ---

// Get active queues
app.get('/api/queues', async (req, res) => {
    const queues = await Queue.find({ status: { $in: ['waiting', 'called', 'dining'] } }).sort({ _id: 1 }).lean();
    queues.forEach(q => {
        q.id = q.queueNumber !== undefined ? q.queueNumber : q._id.toString();
    });

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
        const id = String(req.params.id);
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
        const numId = Number(id);

        let sessionId;
        try {
            sessionId = await getCurrentSessionId();
        } catch (e) {
            return res.status(400).json({ error: 'No active session found. Please reset the queue.' });
        }

        const query = isObjectId ? { _id: id } : (!isNaN(numId) ? { sessionId, queueNumber: numId } : null);

        if (!query) return res.status(400).json({ error: 'Invalid ID format' });
        const queue = await Queue.findOne(query).lean();
        if (!queue) return res.status(404).json({ error: 'Queue not found' });
        queue.id = queue.queueNumber !== undefined ? queue.queueNumber : queue._id.toString();

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

    try {
        let sessionId;
        try {
            sessionId = await getCurrentSessionId();
        } catch (e) {
            return res.status(400).json({ error: 'No active session available. Please contact admin.' });
        }

        // Check if Line ID already has active queue
        if (lineId) {
            const existing = await Queue.findOne({ sessionId, line_id: lineId, status: { $in: ['waiting', 'called', 'dining'] } }).lean();
            if (existing) {
                const displayId = existing.queueNumber !== undefined ? existing.queueNumber : existing._id.toString();
                return res.status(409).json({ error: 'คุณมีคิวอยู่แล้ว (You already have a queue)', queueId: displayId });
            }
        }

        // Atomic queue number increment
        const counter = await Counter.findOneAndUpdate(
            { sessionId },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );

        const newQueue = await Queue.create({
            sessionId,
            queueNumber: counter.seq,
            customer_name: name,
            line_id: lineId || null,
            phone_number: phone || null,
            pax: pax || 1,
            time_slot: timeSlot || null,
            status: 'waiting',
            history: [{ action: 'reserved' }]
        });

        broadcastUpdate();
        const outputId = newQueue.queueNumber !== undefined ? newQueue.queueNumber : newQueue._id.toString();
        res.json({ success: true, id: outputId, queueNumber: newQueue.queueNumber });
    } catch (err) {
        console.error('Error in /api/reserve:', err);
        if (err.code === 11000) return res.status(409).json({ error: 'Queue conflict (duplicate key)' });
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
});

// Cancel Queue (Customer)
app.post('/api/cancel', async (req, res) => {
    try {
        const { id, lineId } = req.body;
        const numId = Number(id);
        if (isNaN(numId)) return res.status(400).json({ error: 'Invalid ID format' });

        let sessionId;
        try {
            sessionId = await getCurrentSessionId();
        } catch (e) {
            return res.status(400).json({ error: 'No active session found.' });
        }

        const query = { sessionId, queueNumber: numId, status: { $ne: 'cancelled' } };
        if (lineId) query.line_id = lineId;

        const queue = await Queue.findOneAndUpdate(
            query,
            {
                status: 'cancelled',
                cancelledAt: new Date(),
                manualAction: true,
                $push: { history: { action: 'cancelled' } }
            },
            { new: true }
        );

        if (!queue) return res.status(404).json({ error: 'Queue not found, unauthorized, or already cancelled' });

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
        const numId = Number(id);
        if (isNaN(numId)) return res.status(400).json({ error: 'Invalid ID format' });

        let sessionId;
        try {
            sessionId = await getCurrentSessionId();
        } catch (e) {
            return res.status(400).json({ error: 'No active session found.' });
        }

        const queue = await Queue.findOneAndUpdate(
            { sessionId, queueNumber: numId, status: 'waiting' },
            {
                status: 'called',
                calledAt: new Date(),
                $push: { history: { action: 'called' } }
            },
            { new: true }
        );

        if (!queue) return res.status(404).json({ error: 'Queue not found or not waiting' });

        // Send LINE
        if (queue.line_id) {
            const displayId = queue.queueNumber !== undefined ? queue.queueNumber : queue._id.toString();
            const msg = `ถึงคิวของคุณแล้ว! (คิวที่ ${displayId})\nกรุณามาที่หน้าร้านได้เลยครับ\n\nYour queue (${displayId}) is ready!`;
            await pushMessage(queue.line_id, msg);
        }

        broadcastUpdate();
        res.json({ success: true });
    } catch (err) {
        console.error('Error in /api/admin/call:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin: Seat Customer (Start Timer)
app.post('/api/admin/seat', async (req, res) => {
    try {
        const { id } = req.body;
        const numId = Number(id);
        if (isNaN(numId)) return res.status(400).json({ error: 'Invalid ID format' });

        let sessionId;
        try {
            sessionId = await getCurrentSessionId();
        } catch (e) {
            return res.status(400).json({ error: 'No active session found.' });
        }

        const queue = await Queue.findOneAndUpdate(
            { sessionId, queueNumber: numId, status: { $in: ['waiting', 'called'] } },
            {
                status: 'dining',
                start_time: new Date(),
                $push: { history: { action: 'seated' } }
            },
            { new: true }
        );

        if (!queue) return res.status(404).json({ error: 'Queue not found or cannot be seated' });

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
        const numId = Number(id);
        if (isNaN(numId)) return res.status(400).json({ error: 'Invalid ID format' });

        let sessionId;
        try {
            sessionId = await getCurrentSessionId();
        } catch (e) {
            return res.status(400).json({ error: 'No active session found.' });
        }

        const queue = await Queue.findOneAndUpdate(
            { sessionId, queueNumber: numId, status: 'dining' },
            {
                status: 'completed',
                end_time: new Date(),
                $push: { history: { action: 'completed' } }
            },
            { new: true }
        );

        if (!queue) return res.status(404).json({ error: 'Queue not found or not dining' });

        broadcastUpdate();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin: Reset Session
app.post('/api/admin/reset', async (req, res) => {
    try {
        const newSessionId = `session_${Date.now()}`;

        // Ensure active_session is uniquely stored
        await Setting.findOneAndUpdate(
            { key: 'active_session' },
            { value: newSessionId },
            { upsert: true, new: true, runValidators: true }
        );

        // Reset counter for that session
        await Counter.findOneAndUpdate(
            { sessionId: newSessionId },
            { $set: { seq: 0 } },
            { upsert: true, new: true }
        );

        broadcastUpdate();
        res.json({ success: true, sessionId: newSessionId, message: 'Queue system reset successfully for new session' });
    } catch (err) {
        console.error('Error in /api/admin/reset:', err);
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
    try {
        const { avgTime, avgWaitTime } = req.body;
        if (avgTime) {
            await Setting.findOneAndUpdate(
                { key: 'avg_time' },
                { value: String(avgTime) },
                { upsert: true, new: true, runValidators: true }
            );
        }
        if (avgWaitTime) {
            await Setting.findOneAndUpdate(
                { key: 'avg_wait_time' },
                { value: String(avgWaitTime) },
                { upsert: true, new: true, runValidators: true }
            );
        }
        broadcastUpdate(); // Update estimates
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
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
        queues.forEach(q => {
            q.id = q.queueNumber !== undefined ? q.queueNumber : q._id.toString();
        });
        socket.emit('queue_updated', queues);
    } catch (error) {
        console.error('Socket init error:', error);
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
