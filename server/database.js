const mongoose = require('mongoose');
const Setting = require('./models/Setting');

// Initialize Database
async function initDb() {
  try {
    // Seed Default Settings
    const settingCount = await Setting.countDocuments();
    if (settingCount === 0) {
      await Setting.create({ key: 'avg_time', value: '30' });
      console.log('Seeded default settings.');
    }
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

initDb();

module.exports = {};
