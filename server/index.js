const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./database');
const { pushMessage, client: lineClient } = require('./lineService');
const line = require('@line/bot-sdk');

const app = express();
const server = http.createServer(app);
const path = require('path'); // Add path module

const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for dev
        methods: ["GET", "POST"]
    }
});

app.use(cors());

// Serve Static Files (Frontend)
app.use(express.static(path.join(__dirname, '../client/dist'))); // Serve built files

// --- LINE Webhook Config ---
// Middleware to handle LINE signature validation
// Note: build-in bodyParser cannot be used before this for signature validation to work
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

// Helper to broadcast update
function broadcastUpdate() {
    const queues = db.prepare('SELECT * FROM queues ORDER BY id ASC').all();
    io.emit('queue_updated', queues);
}

// --- API Routes ---

// Get all queues
app.get('/api/queues', (req, res) => {
    const queues = db.prepare('SELECT * FROM queues ORDER BY id ASC').all();
    res.json(queues);
});

// Get single queue
app.get('/api/queues/:id', (req, res) => {
    const queue = db.prepare('SELECT * FROM queues WHERE id = ?').get(req.params.id);
    if (queue) {
        res.json(queue);
    } else {
        res.status(404).json({ error: 'Queue not found' });
    }
});

// Reserve Queue
app.post('/api/reserve', (req, res) => {
    const { id, name, lineId } = req.body;
    if (!id || !name || !lineId) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    const queue = db.prepare('SELECT * FROM queues WHERE id = ?').get(id);
    if (!queue) return res.status(404).json({ error: 'Queue not found' });

    if (queue.status !== 'available') {
        return res.status(409).json({ error: 'Queue already reserved or called' });
    }

    // Check if this lineId already has an active queue (optional but good)
    const existing = db.prepare("SELECT * FROM queues WHERE line_id = ? AND status IN ('reserved', 'called')").get(lineId);
    if (existing) {
        return res.status(409).json({ error: 'คุณจองคิวอื่นไว้แล้ว (You already have a queue)' });
    }

    const update = db.prepare("UPDATE queues SET status = 'reserved', customer_name = ?, line_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    update.run(name, lineId, id);

    broadcastUpdate();
    res.json({ success: true, message: 'Reserved successfully' });
});

// Admin: Call Queue
app.post('/api/admin/call', async (req, res) => {
    const { id } = req.body;
    const queue = db.prepare('SELECT * FROM queues WHERE id = ?').get(id);

    if (!queue) return res.status(404).json({ error: 'Queue not found' });
    if (queue.status !== 'reserved') return res.status(400).json({ error: 'Queue not ready to call' });

    const update = db.prepare("UPDATE queues SET status = 'called', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    update.run(id);

    // Send LINE Notification
    if (queue.line_id) {
        const msg = `ถึงคิวของคุณแล้ว! (คิวที่ ${id})\nกรุณามาที่หน้าร้านได้เลยครับ\n\nYour queue (${id}) is ready!`;
        await pushMessage(queue.line_id, msg);
    }

    broadcastUpdate();
    res.json({ success: true });
});

// Admin: Clear/Cancel Queue
app.post('/api/admin/clear', (req, res) => {
    const { id } = req.body;
    const update = db.prepare("UPDATE queues SET status = 'available', customer_name = NULL, line_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    update.run(id);

    broadcastUpdate();
    res.json({ success: true });
});

// Reset All (Optional)
app.post('/api/admin/reset', (req, res) => {
    db.prepare("UPDATE queues SET status = 'available', customer_name = NULL, line_id = NULL").run();
    broadcastUpdate();
    res.json({ success: true });
});


// Socket Connection
io.on('connection', (socket) => {
    console.log('Client connected');
    // Send initial state
    const queues = db.prepare('SELECT * FROM queues ORDER BY id ASC').all();
    socket.emit('queue_updated', queues);

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// All other requests -> Serve Frontend (SPA Support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3000; // Use env PORT for Render
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
