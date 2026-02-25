// models/Counter.js
const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // e.g., 'queueNumber-2026-02-26'
    seq: { type: Number, default: 0 }
});

module.exports = mongoose.model('Counter', counterSchema);
