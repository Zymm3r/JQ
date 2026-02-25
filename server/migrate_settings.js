const mongoose = require('mongoose');
require('dotenv').config();

const cleanSettings = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB. Starting settings migration...');

        // 1. Delete all settings where "key" is null or missing (due to the old schema)
        const result = await mongoose.connection.collection('settings').deleteMany({ key: { $in: [null, undefined] } });
        console.log(`Migration step 1: Deleted ${result.deletedCount} invalid settings with missing or null keys.`);

        // 2. Re-initialize defaults using the models with proper schema
        console.log('Migration step 2: Seeding default database settings safely...');
        const Setting = require('./models/Setting');

        const defaults = [
            { key: 'avg_time', value: '30' },
            { key: 'avg_wait_time', value: '15' }
        ];

        let insertedCount = 0;
        for (const def of defaults) {
            const updated = await Setting.findOneAndUpdate(
                { key: def.key },
                { $setOnInsert: { value: def.value } },
                { upsert: true, new: true, runValidators: true }
            );
            if (updated) insertedCount++;
        }
        console.log(`Migration step 2 complete. Ensured ${insertedCount} core settings.`);

        await mongoose.disconnect();
        console.log('Migration successfully ended.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

cleanSettings();
