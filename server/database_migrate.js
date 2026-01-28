const db = require('./database');

try {
    console.log('Migrating database...');

    // Add start_time column
    try {
        db.prepare("ALTER TABLE queues ADD COLUMN start_time DATETIME").run();
        console.log('Added start_time column');
    } catch (err) {
        if (!err.message.includes('duplicate column')) console.error(err.message);
    }

    // Add end_time column
    try {
        db.prepare("ALTER TABLE queues ADD COLUMN end_time DATETIME").run();
        console.log('Added end_time column');
    } catch (err) {
        if (!err.message.includes('duplicate column')) console.error(err.message);
    }

    console.log('Migration complete.');
} catch (err) {
    console.error('Migration failed:', err);
}
