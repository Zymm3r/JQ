const db = require('./database');

try {
    console.log('Migrating database (Time Slots)...');

    // Add time_slot column
    // Format will be "HH:MM" (e.g., "15:00") - simplified mostly for viewing/sorting
    try {
        db.prepare("ALTER TABLE queues ADD COLUMN time_slot TEXT").run();
        console.log('Added time_slot column');
    } catch (err) {
        if (!err.message.includes('duplicate column')) console.error(err.message);
    }

    console.log('Migration complete.');
} catch (err) {
    console.error('Migration failed:', err);
}
