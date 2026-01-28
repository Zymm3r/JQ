// ... existing code ...
app.post('/api/admin/seat', (req, res) => {
    const { id } = req.body;
    const update = db.prepare("UPDATE queues SET status = 'dining', start_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    update.run(id);

    db.prepare("INSERT INTO history (queue_id, action) VALUES (?, 'seated')").run(id);

    broadcastUpdate();
    res.json({ success: true });
});
