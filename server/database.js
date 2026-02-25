const mongoose = require('mongoose');
const Setting = require('./models/Setting');

// Initialize Database defaults
async function initDb() {
  try {
    const defaults = [
      { key: 'avg_time', value: '30' },
      { key: 'avg_wait_time', value: '15' }
    ];

    // Safely upsert all default settings without stripping 'key'
    for (const def of defaults) {
      await Setting.findOneAndUpdate(
        { key: def.key },
        { $setOnInsert: { value: def.value } },
        { upsert: true, new: true, runValidators: true }
      );
    }
    console.log('Seeded default database settings safely.');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

initDb();

module.exports = {};
