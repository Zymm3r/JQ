const Queue = require('../models/Queue');
const Setting = require('../models/Setting');

// Default delays to act as fallbacks
const DEFAULT_SEAT_DELAY_MINUTES = 1;

let intervalId = null;

async function runAutomationLoop(onUpdateCallback) {
    try {
        const now = new Date();

        // 1. Fetch configurable time settings
        const waitTimeSetting = await Setting.findOne({ key: 'avg_wait_time' }).lean();
        const avgTimeSetting = await Setting.findOne({ key: 'avg_time' }).lean();

        const avgWaitTime = parseFloat(waitTimeSetting?.value) || 0;
        const avgTime = parseFloat(avgTimeSetting?.value) || 0;

        // Calculate thresholds
        const waitThreshold = new Date(now.getTime() - (avgWaitTime * 60000));
        const callThreshold = new Date(now.getTime() - (DEFAULT_SEAT_DELAY_MINUTES * 60000));
        const diningThreshold = new Date(now.getTime() - (avgTime * 60000));

        let updatedCount = 0;

        // Rule 1: Waiting -> Called
        if (avgWaitTime > 0) {
            const res1 = await Queue.updateMany(
                {
                    status: 'waiting',
                    created_at: { $lte: waitThreshold }
                },
                {
                    $set: {
                        status: 'called',
                        calledAt: now
                    },
                    $push: { history: { action: 'called', timestamp: now } }
                }
            );
            updatedCount += res1.modifiedCount;
        }

        // Rule 2: Called -> Seated (Dining)
        // Note: Using start_time as the DB schema mapping for diningAt
        const res2 = await Queue.updateMany(
            {
                status: 'called',
                calledAt: { $lte: callThreshold }
            },
            {
                $set: {
                    status: 'dining',
                    start_time: now
                },
                $push: { history: { action: 'seated', timestamp: now } }
            }
        );
        updatedCount += res2.modifiedCount;

        // Rule 3: Seated (Dining) -> Completed
        // Note: Using end_time as the DB schema mapping for completedAt
        if (avgTime > 0) {
            const res3 = await Queue.updateMany(
                {
                    status: 'dining',
                    start_time: { $lte: diningThreshold }
                },
                {
                    $set: {
                        status: 'completed',
                        end_time: now
                    },
                    $push: { history: { action: 'completed', timestamp: now } }
                }
            );
            updatedCount += res3.modifiedCount;
        }

        if (updatedCount > 0) {
            console.log(`[Automation] Successfully transitioned ${updatedCount} queue(s) based on time rules.`);
            if (typeof onUpdateCallback === 'function') {
                onUpdateCallback().catch(err => console.error('[Automation] Socket broadcast error:', err.message));
            }
        }

    } catch (err) {
        // Automation errors must not crash the server per constraints
        console.error('[Automation] Execution error:', err.message);
    }
}

function startAutomation(onUpdateCallback) {
    if (intervalId) return; // Idempotent startup
    console.log('[Automation] Engine initialized. Running every 60 seconds...');

    // Initial run to clear any backlog
    runAutomationLoop(onUpdateCallback);

    // Schedule repeating loop
    intervalId = setInterval(() => runAutomationLoop(onUpdateCallback), 60000);
}

module.exports = { startAutomation };
