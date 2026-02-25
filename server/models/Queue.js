// models/Queue.js
const mongoose = require('mongoose');

const queueSchema = new mongoose.Schema({
    dateKey: { type: String, required: true, index: true }, // e.g., 'YYYY-MM-DD'
    queueNumber: { type: Number, required: true },
    status: {
        type: String,
        enum: ['waiting', 'calling', 'dining', 'completed', 'cancelled'],
        default: 'waiting',
        index: true // Indexed for scheduler performance
    },
    customer_name: { type: String, required: true },
    line_id: { type: String, default: null },
    phone_number: { type: String, default: null },
    pax: { type: Number, default: 1 },
    time_slot: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    calledAt: { type: Date, default: null },
    diningAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    manualAction: { type: Boolean, default: false }
});

// CRITICAL: Prevent duplicate queue numbers per day at the database layer
queueSchema.index({ dateKey: 1, queueNumber: 1 }, { unique: true });

// Optimize cron job queries
queueSchema.index({ status: 1, createdAt: 1, manualAction: 1 });

module.exports = mongoose.model('Queue', queueSchema);
