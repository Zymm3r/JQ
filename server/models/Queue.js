const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
    action: {
        type: String,
        enum: ['reserved', 'called', 'seated', 'completed', 'cancelled'],
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const queueSchema = new mongoose.Schema({
    queueNumber: {
        type: Number,
        unique: true
    },
    status: {
        type: String,
        enum: ['waiting', 'called', 'dining', 'completed', 'cancelled'],
        default: 'waiting',
        required: true
    },
    customer_name: {
        type: String,
        required: true
    },
    line_id: {
        type: String,
        default: null
    },
    phone_number: {
        type: String,
        default: null
    },
    pax: {
        type: Number,
        default: 1
    },
    time_slot: {
        type: String,
        default: null
    },
    start_time: {
        type: Date,
        default: null
    },
    end_time: {
        type: Date,
        default: null
    },
    history: [historySchema]
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

const Queue = mongoose.model('Queue', queueSchema);

module.exports = Queue;
