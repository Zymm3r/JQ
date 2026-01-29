const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./database');
const { pushMessage, client: lineClient } = require('./lineService');
const line = require('@line/bot-sdk');

// Auto-run migrations on start
try {
    require('./database_migrate');
    require('./database_migrate_timeslot');
    console.log('Database migrations executed.');
} catch (err) {
    console.error('Migration execution failed:', err);
}

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
function broadcastUpdate() {
    // Return only active queues (waiting, called, dining)
    const queues = db.prepare("SELECT * FROM queues WHERE status IN ('waiting', 'called', 'dining') ORDER BY id ASC").all();

    // Calculate Wait Time Estimate
    const avgTimeSetting = db.prepare("SELECT value FROM settings WHERE key = 'avg_time'").get();
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
app.get('/api/queues', (req, res) => {
    const queues = db.prepare("SELECT * FROM queues WHERE status IN ('waiting', 'called', 'dining') ORDER BY id ASC").all();
    // Re-calculate times (duplicate logic, should refactor but fine for now)
    const avgTimeSetting = db.prepare("SELECT value FROM settings WHERE key = 'avg_time'").get();
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
app.get('/api/queues/:id', (req, res) => {
    const queue = db.prepare('SELECT * FROM queues WHERE id = ?').get(req.params.id);
    if (!queue) return res.status(404).json({ error: 'Queue not found' });

    // Calculate position
    if (queue.status === 'waiting') {
        const position = db.prepare("SELECT count(*) as count FROM queues WHERE status = 'waiting' AND id < ?").get(queue.id).count;
        const avgTimeSetting = db.prepare("SELECT value FROM settings WHERE key = 'avg_time'").get();
        const avgTime = parseInt(avgTimeSetting?.value || 30);
        const timePerTable = avgTime / 10;
        queue.estimatedWaitTime = Math.ceil((position + 1) * timePerTable);
        queue.queueAhead = position;
    }

    res.json(queue);
});

// Reserve Queue (New Dynamic)
app.post('/api/reserve', (req, res) => {
    const { name, lineId, pax, phone, timeSlot } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    // Check if Line ID already has active queue
    if (lineId) {
        const existing = db.prepare("SELECT * FROM queues WHERE line_id = ? AND status IN ('waiting', 'called', 'dining')").get(lineId);
        if (existing) {
            return res.status(409).json({ error: 'คุณมีคิวอยู่แล้ว (You already have a queue)', queueId: existing.id });
        }
    }

    try {
        const insert = db.prepare("INSERT INTO queues (customer_name, line_id, phone_number, pax, status, time_slot) VALUES (?, ?, ?, ?, 'waiting', ?)");
        const info = insert.run(name, lineId || null, phone || null, pax || 1, timeSlot || null);

        // Log history
        db.prepare("INSERT INTO history (queue_id, action) VALUES (?, 'reserved')").run(info.lastInsertRowid);

        broadcastUpdate();
        res.json({ success: true, id: info.lastInsertRowid });
    } catch (err) {
        console.error('Error in /api/reserve:', err);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
});

// Cancel Queue (Customer)
app.post('/api/cancel', (req, res) => {
    try {
        const { id, lineId } = req.body;
        const queue = db.prepare('SELECT * FROM queues WHERE id = ?').get(id);

        if (!queue) return res.status(404).json({ error: 'Queue not found' });

        // Verify ownership if lineId passed (optional security)
        if (lineId && queue.line_id !== lineId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const update = db.prepare("UPDATE queues SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        update.run(id);

        db.prepare("INSERT INTO history (queue_id, action) VALUES (?, 'cancelled')").run(id);

        broadcastUpdate();
        res.json({ success: true });
    } catch (err) {
        console.error('Error in /api/cancel:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin: Call Queue
app.post('/api/admin/call', async (req, res) => {
    const { id } = req.body;
    const queue = db.prepare('SELECT * FROM queues WHERE id = ?').get(id);

    if (!queue) return res.status(404).json({ error: 'Queue not found' });

    const update = db.prepare("UPDATE queues SET status = 'called', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    update.run(id);

    db.prepare("INSERT INTO history (queue_id, action) VALUES (?, 'called')").run(id);

    // Send LINE
    if (queue.line_id) {
        const msg = `ถึงคิวของคุณแล้ว! (คิวที่ ${id})\nกรุณามาที่หน้าร้านได้เลยครับ\n\nYour queue (${id}) is ready!`;
        await pushMessage(queue.line_id, msg);
    }

    broadcastUpdate();
    res.json({ success: true });
});

// Admin: Seat Customer (Start Timer)
app.post('/api/admin/seat', (req, res) => {
    const { id } = req.body;
    const update = db.prepare("UPDATE queues SET status = 'dining', start_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    update.run(id);

    db.prepare("INSERT INTO history (queue_id, action) VALUES (?, 'seated')").run(id);

    broadcastUpdate();
    res.json({ success: true });
});

// Admin: Complete Queue (Was Clear)
app.post('/api/admin/complete', (req, res) => {
    const { id } = req.body;
    const update = db.prepare("UPDATE queues SET status = 'completed', end_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    update.run(id);

    db.prepare("INSERT INTO history (queue_id, action) VALUES (?, 'completed')").run(id);

    broadcastUpdate();
    res.json({ success: true });
});

// Admin: Get Stats
app.get('/api/admin/stats', (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        const total = db.prepare("SELECT count(*) as count FROM queues WHERE date(created_at) = date('now')").get().count;
        const completed = db.prepare("SELECT count(*) as count FROM queues WHERE status = 'completed' AND date(created_at) = date('now')").get().count;
        const cancelled = db.prepare("SELECT count(*) as count FROM queues WHERE status = 'cancelled' AND date(created_at) = date('now')").get().count;
        const waiting = db.prepare("SELECT count(*) as count FROM queues WHERE status = 'waiting'").get().count;

        res.json({ total, completed, cancelled, waiting });
    } catch (err) {
        console.error('Error in /api/admin/stats:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin: Update Settings
app.post('/api/admin/settings', (req, res) => {
    const { avgTime, avgWaitTime } = req.body;
    if (avgTime) {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('avg_time', ?)").run(String(avgTime));
    }
    if (avgWaitTime) {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('avg_wait_time', ?)").run(String(avgWaitTime));
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
io.on('connection', (socket) => {
    console.log('Client connected');
    // Trigger an update just for this client (hacky but works to reuse logic)
    // Ideally we extract the logic to 'getQueuesData()' and emit that.

    // Send initial state manually
    const queues = db.prepare("SELECT * FROM queues WHERE status IN ('waiting', 'called', 'dining') ORDER BY id ASC").all();
    socket.emit('queue_updated', queues);
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
