// models/Setting.js
const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
    key: {
        type: String,
        required: [true, 'Setting key is required'],
        unique: true,
        trim: true
    },
    value: {
        type: String,
        required: [true, 'Setting value is required'],
        trim: true
    }
}, { timestamps: true });

// Explicitly define unique index
settingSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('Setting', settingSchema);
