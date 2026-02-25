const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    line_id: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        default: null
    }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
