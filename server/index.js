// server/index.js
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');
const line = require('@line/bot-sdk');

const Queue = require('./models/Queue');
const Setting = require('./models/Setting');
const Counter = require('./models/Counter');
require('dotenv').config();

const { pushMessage, client: lineClient } = require('./lineService');

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Mongoose connected successfully.'))
    .catch((err) => console.error('Mongoose connection error:', err));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());

// --- LINE Webhook Config ---
const lineConfig = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
};

app.post('/webhook', line.middleware(lineConfig), (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
    }
    const userId = event.source.userId;
    const replyText = `สวัสดีครับ! นี่คือ ID ของคุณ:\n\n${userId}\n\n(กดคัดลอก แล้วนำไปใส่ในช่องจองคิวได้เลยครับ)`;
    return lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: replyText
    });
}

// --- Body Parser for other routes ---
app.use(express.json());

// Helper to get today's active scope safely (Server TZ or UTC+7)
const getActiveDateKey = () => {
    const tzOffset = 7 * 60 * 60000;
    return new Date(Date.now() + tzOffset).toISOString().split('T')[0];
};

// Helper: Broadcast update
async function broadcastUpdate() {
    const today = getActiveDateKey();
    const queues = await Queue.find({
        dateKey: today,
        status: { $in: ['waiting', 'calling', 'dining'] }
    }).sort({ queueNumber: 1 }).lean();

    // Calculate Wait Time Estimate
    const settings = await Setting.findOne() || new Setting();
    const avgTimeMins = settings.avgTimePerTableMins || 60;
    const TOTAL_TABLES = 10;
    const timePerTable = avgTimeMins / TOTAL_TABLES;

    let waitingCount = 0;
    const queuesWithTime = queues.map(q => {
        q.id = q.queueNumber;

        if (q.status === 'calling' || q.status === 'dining') {
            return { ...q, estimatedWaitTime: 0 };
        }
        const waitMins = Math.ceil((waitingCount + 1) * timePerTable);
        waitingCount++;
        return { ...q, estimatedWaitTime: waitMins };
    });

    io.emit('queue_updated', queuesWithTime);
}

// ==========================================
// API ROUTES
// ==========================================

// Get active queues
app.get('/api/queues', async (req, res, next) => {
    try {
        const today = getActiveDateKey();
        const queues = await Queue.find({
            dateKey: today,
            status: { $in: ['waiting', 'calling', 'dining'] }
        }).sort({ queueNumber: 1 }).lean();

        const settings = await Setting.findOne() || new Setting();
        const avgTimeMins = settings.avgTimePerTableMins || 60;
        const TOTAL_TABLES = 10;
        const timePerTable = avgTimeMins / TOTAL_TABLES;

        let waitingCount = 0;
        const queuesWithTime = queues.map(q => {
            q.id = q.queueNumber;
            if (q.status === 'calling' || q.status === 'dining') return { ...q, estimatedWaitTime: 0 };
            const waitMins = Math.ceil((waitingCount + 1) * timePerTable);
            waitingCount++;
            return { ...q, estimatedWaitTime: waitMins };
        });

        res.json(queuesWithTime);
    } catch (err) { next(err); }
});

// Get single queue status
app.get('/api/queues/:id', async (req, res, next) => {
    try {
        const queueNum = parseInt(req.params.id, 10);
        if (isNaN(queueNum)) {
            const error = new Error('BAD_REQUEST');
            error.status = 400;
            throw error;
        }

        const dateKey = getActiveDateKey();
        const queue = await Queue.findOne({ dateKey, queueNumber: queueNum }).lean();
        if (!queue) {
            const error = new Error('NOT_FOUND');
            error.status = 404;
            throw error;
        }

        queue.id = queue.queueNumber;

        // Calculate position
        if (queue.status === 'waiting') {
            const position = await Queue.countDocuments({
                dateKey,
                status: 'waiting',
                queueNumber: { $lt: queue.queueNumber }
            });
            const settings = await Setting.findOne() || new Setting();
            const timePerTable = (settings.avgTimePerTableMins || 60) / 10;
            queue.estimatedWaitTime = Math.ceil((position + 1) * timePerTable);
            queue.queueAhead = position;
        }

        res.json(queue);
    } catch (err) { next(err); }
});

// Reserve Queue
app.post('/api/reserve', async (req, res, next) => {
    try {
        const { name, lineId, pax, phone, timeSlot } = req.body;
        if (!name) {
            const error = new Error('Name is required');
            error.status = 400;
            throw error;
        }

        const dateKey = getActiveDateKey();

        // Check if Line ID already has active queue today
        if (lineId) {
            const existing = await Queue.findOne({
                dateKey,
                line_id: lineId,
                status: { $in: ['waiting', 'calling', 'dining'] }
            }).lean();
            if (existing) {
                return res.status(409).json({
                    error: 'คุณมีคิวอยู่แล้ว (You already have a queue)',
                    queueId: existing.queueNumber
                });
            }
        }

        const counterName = `queueNumber-${dateKey}`;

        // ATOMIC INCREMENT
        const counter = await Counter.findOneAndUpdate(
            { name: counterName },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );

        const newQueue = await Queue.create({
            dateKey,
            queueNumber: counter.seq,
            customer_name: name,
            line_id: lineId || null,
            phone_number: phone || null,
            pax: pax || 1,
            time_slot: timeSlot || null,
            status: 'waiting'
        });

        broadcastUpdate();
        res.status(201).json({ success: true, id: newQueue.queueNumber, queueNumber: newQueue.queueNumber });
    } catch (err) {
        next(err);
    }
});

// GENERIC QUEUE ACTION PROCESSOR
const processQueueAction = async (queueNumber, fromStatuses, targetStatus, timeField) => {
    const dateKey = getActiveDateKey();
    const queueNum = parseInt(queueNumber, 10);

    if (isNaN(queueNum)) {
        const error = new Error('BAD_REQUEST');
        error.status = 400;
        throw error;
    }

    const updatedQueue = await Queue.findOneAndUpdate(
        { dateKey, queueNumber: queueNum, status: { $in: fromStatuses } },
        {
            $set: {
                status: targetStatus,
                [timeField]: new Date(),
                manualAction: true
            }
        },
        { new: true }
    );

    if (!updatedQueue) {
        const error = new Error('NOT_FOUND');
        error.status = 404;
        throw error;
    }

    return updatedQueue;
};

// Admin: Call Queue
app.post('/api/admin/call', async (req, res, next) => {
    try {
        const { id } = req.body;
        const queue = await processQueueAction(id, ['waiting'], 'calling', 'calledAt');

        // Send LINE
        if (queue.line_id) {
            const displayId = queue.queueNumber;
            const msg = `ถึงคิวของคุณแล้ว! (คิวที่ ${displayId})\nกรุณามาที่หน้าร้านได้เลยครับ\n\nYour queue (${displayId}) is ready!`;
            await pushMessage(queue.line_id, msg);
        }

        broadcastUpdate();
        res.json({ success: true, queue });
    } catch (err) { next(err); }
});

// Admin: Seat Customer
app.post('/api/admin/seat', async (req, res, next) => {
    try {
        const { id } = req.body;
        await processQueueAction(id, ['waiting', 'calling'], 'dining', 'diningAt');

        broadcastUpdate();
        res.json({ success: true });
    } catch (err) { next(err); }
});

// Admin: Complete Queue
app.post('/api/admin/complete', async (req, res, next) => {
    try {
        const { id } = req.body;
        await processQueueAction(id, ['calling', 'dining'], 'completed', 'completedAt');

        broadcastUpdate();
        res.json({ success: true });
    } catch (err) { next(err); }
});

// Customer & Admin: Cancel Route
app.post('/api/cancel', async (req, res, next) => {
    try {
        const { id, lineId } = req.body;
        const dateKey = getActiveDateKey();
        const queueNum = parseInt(id, 10);

        if (isNaN(queueNum)) {
            const err = new Error('BAD_REQUEST');
            err.status = 400;
            throw err;
        }

        const queue = await Queue.findOne({ dateKey, queueNumber: queueNum });
        if (!queue) {
            const err = new Error('NOT_FOUND');
            err.status = 404;
            throw err;
        }

        // Verify ownership if lineId passed
        if (lineId && queue.line_id !== lineId) {
            const err = new Error('Unauthorized');
            err.status = 403;
            throw err;
        }

        // It is perfectly safe to cancel no matter status up until completed
        if (queue.status !== 'completed' && queue.status !== 'cancelled') {
            queue.status = 'cancelled';
            queue.cancelledAt = new Date();
            queue.manualAction = true;
            await queue.save();
        }

        broadcastUpdate();
        res.json({ success: true });
    } catch (err) { next(err); }
});

// Admin: Reset (End of Day/Store Closure)
app.post('/api/admin/reset', async (req, res, next) => {
    try {
        const dateKey = getActiveDateKey();
        // Archive all active queues for today smoothly
        await Queue.updateMany(
            { dateKey, status: { $in: ['waiting', 'calling', 'dining'] } },
            {
                $set: {
                    status: 'cancelled',
                    cancelledAt: new Date(),
                    manualAction: true
                }
            }
        );

        broadcastUpdate();
        res.json({ success: true, message: "Queues archived. Ready for new day." });
    } catch (err) { next(err); }
});

// Admin: Get Stats
app.get('/api/admin/stats', async (req, res, next) => {
    try {
        const dateKey = getActiveDateKey();

        const total = await Queue.countDocuments({ dateKey });
        const completed = await Queue.countDocuments({ dateKey, status: 'completed' });
        const cancelled = await Queue.countDocuments({ dateKey, status: 'cancelled' });
        const waiting = await Queue.countDocuments({ dateKey, status: 'waiting' });

        res.json({ total, completed, cancelled, waiting });
    } catch (err) { next(err); }
});

// Admin: Settings Data (If requested directly)
app.get('/api/admin/settings', async (req, res, next) => {
    try {
        const settings = await Setting.findOne() || new Setting();
        res.json(settings);
    } catch (err) { next(err); }
});

// Admin: Update Settings
app.post('/api/admin/settings', async (req, res, next) => {
    try {
        const { avgTime, avgWaitTime } = req.body;
        let setUpdate = {};
        if (avgTime) setUpdate.avgTimePerTableMins = Number(avgTime);
        if (avgWaitTime) setUpdate.avgWaitMins = Number(avgWaitTime);

        await Setting.findOneAndUpdate(
            {},
            { $set: setUpdate },
            { upsert: true, new: true }
        );

        broadcastUpdate();
        res.json({ success: true });
    } catch (err) { next(err); }
});

// Global Error Middleware
app.use((err, req, res, next) => {
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message || err);

    if (err.status) {
        return res.status(err.status).json({ error: err.message });
    }
    if (err.code === 11000) {
        return res.status(409).json({ error: 'Conflict. Duplicate key detected.' });
    }
    if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal Server Error' });
});

// Serve Static Files (Frontend)
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// Handle SPA (React Router) - EXCLUDE /api routes
app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return res.status(404).json({ error: 'Not Found' });
    }
    res.sendFile(path.join(clientDist, 'index.html'));
});

// Socket Connection
io.on('connection', async (socket) => {
    console.log('Client connected');
    try {
        const today = getActiveDateKey();
        const queues = await Queue.find({
            dateKey: today,
            status: { $in: ['waiting', 'calling', 'dining'] }
        }).sort({ queueNumber: 1 }).lean();

        queues.forEach(q => { q.id = q.queueNumber; });
        socket.emit('queue_updated', queues);
    } catch (error) {
        console.error('Socket init error:', error);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // START CRON SCHEDULER
    cron.schedule('*/60 * * * * *', async () => {
        try {
            const settings = await Setting.findOne() || new Setting();
            const now = new Date();
            const today = getActiveDateKey();

            const waitMins = settings.avgWaitMins || 15;
            const dineMins = settings.avgTimePerTableMins || 60;

            const callThreshold = new Date(now.getTime() - (waitMins * 60000));
            const completeThreshold = new Date(now.getTime() - (dineMins * 60000));

            // Auto-Call: waiting -> calling
            const callResult = await Queue.updateMany(
                { dateKey: today, status: 'waiting', createdAt: { $lte: callThreshold }, manualAction: false },
                { $set: { status: 'calling', calledAt: now } }
            );

            // Auto-Complete: dining -> completed
            const completeResult = await Queue.updateMany(
                { dateKey: today, status: 'dining', diningAt: { $lte: completeThreshold }, manualAction: false },
                { $set: { status: 'completed', completedAt: now } }
            );

            if (callResult.modifiedCount > 0 || completeResult.modifiedCount > 0) {
                console.log(`[Cron] Executed. Auto-Called: ${callResult.modifiedCount} | Auto-Completed: ${completeResult.modifiedCount}`);
                broadcastUpdate();
            }
        } catch (err) {
            console.error('[CRON Error] Failed to execute queue automation:', err);
        }
    });
});
