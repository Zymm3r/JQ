const line = require('@line/bot-sdk');
require('dotenv').config();

const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'mock_token',
    channelSecret: process.env.LINE_CHANNEL_SECRET || 'mock_secret'
};

const client = process.env.LINE_CHANNEL_ACCESS_TOKEN
    ? new line.Client(config)
    : null;

async function pushMessage(userId, text) {
    if (!client) {
        console.log(`[MOCK LINE SEND] To: ${userId} | Message: ${text}`);
        return Promise.resolve();
    }

    try {
        await client.pushMessage(userId, {
            type: 'text',
            text: text,
        });
        console.log(`[LINE SEND] To: ${userId} | Message: ${text}`);
    } catch (error) {
        console.error('Error sending LINE message:', error.originalError?.response?.data || error);
    }
}

module.exports = {
    pushMessage,
    client
};
