const Database = require('better-sqlite3');
const path = require('path');

const db = new Database('queue.db', { verbose: console.log });

// Initialize Database
function initDb() {
  const schema = `
    CREATE TABLE IF NOT EXISTS queues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'waiting', -- waiting, called, completed, cancelled
      customer_name TEXT,
      line_id TEXT,
      phone_number TEXT,
      pax INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        queue_id INTEGER,
        action TEXT, -- reserved, called, completed, cancelled
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
  `;
  db.exec(schema);

  // Seed Default Settings
  const settingCount = db.prepare('SELECT count(*) as count FROM settings').get();
  if (settingCount.count === 0) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('avg_time', '30')").run();
    console.log('Seeded default settings.');
  }
}

initDb();

module.exports = db;
