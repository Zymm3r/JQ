// models/Setting.js
const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
    avgWaitMins: { type: Number, default: 15 },
    avgTimePerTableMins: { type: Number, default: 60 }
});

module.exports = mongoose.model('Setting', settingSchema);
