const Database = require('better-sqlite3');
const path = require('path');

const db = new Database('queue.db', { verbose: console.log });

// Initialize Database
function initDb() {
    const schema = `
    CREATE TABLE IF NOT EXISTS queues (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'available', -- available, reserved, called
      customer_name TEXT,
      line_id TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
    db.exec(schema);

    // Seed data if empty
    const count = db.prepare('SELECT count(*) as count FROM queues').get();
    if (count.count === 0) {
        const insert = db.prepare('INSERT INTO queues (id, status) VALUES (?, ?)');
        for (let i = 1; i <= 10; i++) {
            insert.run(i, 'available');
        }
        console.log('Seeded 10 queues.');
    }
}

initDb();

module.exports = db;
