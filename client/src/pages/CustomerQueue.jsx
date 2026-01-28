import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, socket } from '../api';
import toast from 'react-hot-toast';
import { User, CheckCircle, AlertCircle, Clock, XCircle, Home } from 'lucide-react';

export default function CustomerQueue() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [queue, setQueue] = useState(null);
    const [loading, setLoading] = useState(true);

    // Check if I am the owner (optional check)
    // const myRes = JSON.parse(localStorage.getItem('my_queue') || '{}');

    useEffect(() => {
        // Initial fetch
        fetchQueue();

        // Realtime updates
        const handleUpdate = (updatedQueues) => {
            if (!Array.isArray(updatedQueues)) return;
            // If the current queue is in the list, update it
            const me = updatedQueues.find(q => q.id === parseInt(id));
            if (me) {
                setQueue(me);
            } else {
                // If not in waiting/called list, it might be completed/cancelled/expired
                // We should re-fetch to get status from DB specific API
                // But for now, if it disappears from 'active' list, might mean completed.
                // Better to relying on re-fetch if 'me' is missing but we had it before.
                fetchQueue();
            }
        };

        socket.on('queue_updated', handleUpdate);
        return () => socket.off('queue_updated', handleUpdate);
    }, [id]);

    const fetchQueue = () => {
        api.get(`/queues/${id}`).then(res => {
            setQueue(res.data);
            setLoading(false);
        }).catch(err => {
            // toast.error('ไม่พบข้อมูลคิว (Queue not found)');
            setLoading(false);
            setQueue(null);
        });
    };

    const handleCancel = async () => {
        if (!window.confirm('ต้องการยกเลิกคิวใช่หรือไม่? (Cancel Queue?)')) return;
        try {
            await api.post('/cancel', { id });
            toast.success('ยกเลิกคิวแล้ว');
            fetchQueue(); // Refresh status
        } catch (err) {
            toast.error('Failed to cancel');
        }
    };

    // Play sound when status becomes 'called'
    useEffect(() => {
        if (queue?.status === 'called') {
            import('../utils/audio').then(mod => mod.playAlertSound());
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
    }, [queue?.status]);

    if (loading) return <div className="card">Loading...</div>;
    if (!queue) return (
        <div className="card" style={{ textAlign: 'center' }}>
            <AlertCircle size={48} color="var(--text-light)" />
            <h2>ไม่พบข้อมูลคิว</h2>
            <p>Queue ID {id} not found</p>
            <button onClick={() => navigate('/')} className="btn btn-secondary" style={{ marginTop: 20 }}>
                กลับหน้าหลัก
            </button>
        </div>
    );

    // --- Status: WAITING ---
    if (queue.status === 'waiting') {
        return (
            <div className="card">
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ fontSize: '4rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{queue.id}</div>
                    <p style={{ color: 'var(--text-light)' }}>หมายเลขคิวของคุณ (Your Queue)</p>
                </div>

                <div className="status-box" style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: 20, borderRadius: 12, marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span><Clock size={16} /> รออีกประมาณ (Wait time)</span>
                        <span style={{ fontWeight: 700 }}>{queue.estimatedWaitTime || '-'} mins</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span><User size={16} /> คิวรอข้างหน้า (Queues ahead)</span>
                        <span style={{ fontWeight: 700 }}>{queue.queueAhead || 0} คิว</span>
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <p><strong>คุณ:</strong> {queue.customer_name}</p>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-light)' }}>{queue.pax} ท่าน</p>
                </div>

                <button onClick={handleCancel} className="btn btn-danger" style={{ width: '100%' }}>
                    <XCircle size={16} /> ยกเลิกจอง (Cancel)
                </button>
            </div>
        );
    }

    // --- Status: CALLED ---
    if (queue.status === 'called') {
        return (
            <div className="card" style={{ border: '2px solid var(--warning)' }}>
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <CheckCircle size={64} color="var(--success)" style={{ marginBottom: 16 }} />
                    <h1>ถึงคิวคุณแล้ว!</h1>
                    <div style={{ fontSize: '3rem', fontWeight: 800 }}>{queue.id}</div>
                    <p style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--primary)', marginTop: 20 }}>
                        กรุณามาที่หน้าร้านได้เลย
                    </p>
                </div>
            </div>
        );
    }

    // --- Status: CANCELLED ---
    if (queue.status === 'cancelled') {
        return (
            <div className="card" style={{ textAlign: 'center', opacity: 0.7 }}>
                <XCircle size={48} color="var(--danger)" />
                <h2 style={{ marginTop: 16 }}>คิวถูกยกเลิก</h2>
                <p>Queue Cancelled</p>
                <button onClick={() => navigate('/')} className="btn btn-primary" style={{ marginTop: 20 }}>
                    จองคิวใหม่
                </button>
            </div>
        );
    }

    // --- Status: COMPLETED ---
    if (queue.status === 'completed') {
        return (
            <div className="card" style={{ textAlign: 'center' }}>
                <CheckCircle size={48} color="var(--text-light)" />
                <h2 style={{ marginTop: 16 }}>ขอบคุณที่ใช้บริการ</h2>
                <p>Completed</p>
                <button onClick={() => navigate('/')} className="btn btn-secondary" style={{ marginTop: 20 }}>
                    <Home size={16} /> หน้าหลัก
                </button>
            </div>
        );
    }

    return <div>Unknown Status: {queue.status}</div>;
}
