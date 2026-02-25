// models/QueueSession.js
const mongoose = require('mongoose');

const queueSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true }
});

module.exports = mongoose.model('QueueSession', queueSessionSchema);
