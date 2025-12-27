import { useState, useEffect } from 'react';
import { api, socket } from '../api';
import toast from 'react-hot-toast';
import { Bell, Trash2, RefreshCw } from 'lucide-react';

export default function AdminDashboard() {
    const [queues, setQueues] = useState([]);

    useEffect(() => {
        fetchQueues();

        const handleUpdate = (updatedQueues) => {
            // Check if there is a NEW reservation
            setQueues(prevQueues => {
                const hasNewReservation = updatedQueues.some(q =>
                    q.status === 'reserved' &&
                    prevQueues.find(pq => pq.id === q.id)?.status === 'available'
                );

                if (hasNewReservation) {
                    import('../utils/audio').then(mod => mod.playNotificationSound());
                }
                return updatedQueues;
            });
        };

        socket.on('queue_updated', handleUpdate);
        return () => socket.off('queue_updated', handleUpdate);
    }, []);

    const fetchQueues = () => {
        api.get('/queues').then(res => setQueues(res.data));
    };

    const handleCall = async (id) => {
        try {
            await api.post('/admin/call', { id });
            toast.success(`เรียกคิว ${id} แล้ว`);
        } catch (err) {
            toast.error('Failed to call');
        }
    };

    const handleClear = async (id) => {
        if (!window.confirm(`ต้องการเคลียร์คิวที่ ${id} ใช่หรือไม่?`)) return;
        try {
            await api.post('/admin/clear', { id });
            toast.success(`เคลียร์คิว ${id} แล้ว`);
        } catch (err) {
            toast.error('Failed to clear');
        }
    };

    const handleResetAll = async () => {
        if (!window.confirm('ยืนยันล้างข้อมูลทุกคิว? (Reset All)')) return;
        try {
            await api.post('/admin/reset');
            toast.success('Reset All Successful');
        } catch (err) {
            toast.error('Failed to reset');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('admin_auth');
        window.location.href = '/login';
    };

    return (
        <div>
            <div className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>แผงควบคุม (Admin)</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleResetAll} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8rem' }}>
                        <RefreshCw size={14} style={{ marginRight: 6 }} /> Reset All
                    </button>
                    <button
                        onClick={handleLogout}
                        style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #ef4444', color: '#ef4444', background: 'white', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                        ออกจากระบบ
                    </button>
                </div>
            </div>

            <div className="queue-grid">
                {queues.map(q => (
                    <div key={q.id} className={`card queue-item ${q.status}`} style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <span style={{ fontWeight: 700, fontSize: '1.2rem' }}>Q{q.id}</span>
                            <span className={`status-badge status-${q.status}`}>
                                {q.status}
                            </span>
                        </div>

                        <div style={{ minHeight: 60, fontSize: '0.9rem' }}>
                            {q.status === 'available' ? (
                                <span style={{ color: 'var(--text-light)' }}>- ว่าง -</span>
                            ) : (
                                <div>
                                    <p style={{ fontWeight: 600 }}>{q.customer_name}</p>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Line: {q.line_id}</p>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                            <button
                                className="btn btn-primary"
                                style={{ padding: '8px', fontSize: '0.9rem' }}
                                disabled={q.status !== 'reserved'}
                                onClick={() => handleCall(q.id)}
                            >
                                <Bell size={16} /> เรียก
                            </button>
                            <button
                                className="btn btn-danger"
                                style={{ padding: '8px', fontSize: '0.9rem' }}
                                disabled={q.status === 'available'}
                                onClick={() => handleClear(q.id)}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
