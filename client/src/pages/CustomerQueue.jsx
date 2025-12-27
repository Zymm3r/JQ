import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api, socket } from '../api';
import toast from 'react-hot-toast';
import { User, MessageCircle, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import liff from '@line/liff';

export default function CustomerQueue() {
    const { id } = useParams();
    const [queue, setQueue] = useState(null);
    const [name, setName] = useState('');
    const [lineId, setLineId] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Check if I am the owner of this queue from local storage
    const myRes = JSON.parse(localStorage.getItem('my_queue') || '{}');
    const isMyQueue = myRes.queueId === parseInt(id);

    useEffect(() => {
        // Initial fetch
        api.get(`/queues/${id}`).then(res => {
            setQueue(res.data);
            setLoading(false);
        }).catch(err => {
            toast.error('ไม่พบข้อมูลคิว (Queue not found)');
            setLoading(false);
        });

        // Realtime updates
        const handleUpdate = (updatedQueues) => {
            if (!Array.isArray(updatedQueues)) return;
            const me = updatedQueues.find(q => q.id === parseInt(id));
            if (me) setQueue(me);
        };

        socket.on('queue_updated', handleUpdate);
        return () => socket.off('queue_updated', handleUpdate);
    }, [id]);

    // Initialize LIFF
    useEffect(() => {
        const initLiff = async () => {
            try {
                const liffId = import.meta.env.VITE_LIFF_ID;
                if (!liffId) {
                    // console.warn('LIFF ID not configured'); 
                    return;
                }

                await liff.init({ liffId });
                if (liff.isLoggedIn()) {
                    const profile = await liff.getProfile();
                    setLineId(profile.userId);
                    // Only set name if empty (user might have typed it)
                    setName(prev => prev || profile.displayName);
                } else {
                    // Optional: liff.login(); if you want to force login
                }
            } catch (err) {
                console.error('LIFF Init Error:', err);
            }
        };
        initLiff();
    }, []);

    const handleReserve = async (e) => {
        e.preventDefault();
        if (!name || !lineId) return toast.error('กรุณากรอกข้อมูลให้ครบ');

        setSubmitting(true);
        try {
            await api.post('/reserve', { id, name, lineId });
            toast.success('จองคิวสำเร็จ! (Reserved)');
            localStorage.setItem('my_queue', JSON.stringify({ queueId: parseInt(id), name, lineId }));
        } catch (err) {
            toast.error(err.response?.data?.error || 'การจองล้มเหลว');
        } finally {
            setSubmitting(false);
        }
    };

    // Play sound when status becomes 'called'
    useEffect(() => {
        if (queue?.status === 'called') {
            import('../utils/audio').then(mod => mod.playAlertSound());

            // Vibrate on mobile
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
    }, [queue?.status]);

    if (loading) return <div className="card">Loading...</div>;
    if (!queue) return <div className="card">ไม่พบหมายเลขคิวนี้</div>;

    // --- Status: AVAILABLE ---
    if (queue.status === 'available') {
        return (
            <div className="card">
                <div className="app-header">
                    <h1>คิวที่ {id}</h1>
                    <span className="status-badge status-available">ว่าง / Available</span>
                </div>

                <form onSubmit={handleReserve}>
                    {/* LIFF Active State: One Click Reserve */}
                    {lineId ? (
                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            <div style={{
                                width: 80, height: 80, borderRadius: '50%', background: '#f1f5f9',
                                margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '3px solid white', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                            }}>
                                {/* Use actual profile image if potentially available later, now default icon */}
                                <User size={40} color="var(--primary)" />
                            </div>
                            <h3 style={{ margin: '0 0 8px', color: 'var(--text-dark)' }}>สวัสดี, {name}</h3>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-light)' }}>
                                ยืนยันการจองด้วยบัญชี LINE นี้
                            </p>

                            <div style={{ marginTop: 24 }}>
                                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '16px', fontSize: '1.2rem' }} disabled={submitting}>
                                    {submitting ? 'กำลังจอง...' : 'ยืนยันการจอง (Confirm)'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Fallback State: Manual Input */
                        <>
                            <div className="input-group">
                                <label><User size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />ชื่อของคุณ (Name)</label>
                                <input
                                    type="text"
                                    placeholder="Ex. สมชาย"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                />
                            </div>

                            <div className="input-group">
                                <label><MessageCircle size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />LINE ID</label>
                                <input
                                    type="text"
                                    placeholder="Ex. somchai.line"
                                    value={lineId}
                                    onChange={e => setLineId(e.target.value)}
                                />
                            </div>

                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {submitting ? 'กำลังบันทึก...' : 'จองคิวทันที (Reserve Now)'}
                            </button>

                            <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8', marginTop: 10 }}>
                                *แนะนำ: เปิดใน LINE เพื่อจองง่ายๆ เพียงคลิกเดียว
                            </p>
                        </>
                    )}
                </form>
            </div>
        );
    }

    // --- Status: RESERVED (My Queue) ---
    if (queue.status === 'reserved' && isMyQueue) {
        return (
            <div className="card">
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <Clock size={48} color="var(--warning)" style={{ marginBottom: 16 }} />
                    <h2>จองสำเร็จ!</h2>
                    <p style={{ color: 'var(--text-light)' }}>คุณกำลังรอคิวที่ {id}</p>
                </div>
                <div style={{ background: '#fef3c7', padding: 16, borderRadius: 12, marginBottom: 16 }}>
                    <p><strong>ชื่อ:</strong> {queue.customer_name}</p>
                    <p><strong>Status:</strong> รอเรียก (Waiting)</p>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', textAlign: 'center' }}>
                    กรุณารอการแจ้งเตือนผ่าน LINE หรือหน้าร้าน
                </p>
            </div>
        );
    }

    // --- Status: RESERVED (Someone else) ---
    if (queue.status === 'reserved' && !isMyQueue) {
        return (
            <div className="card" style={{ textAlign: 'center' }}>
                <AlertCircle size={48} color="var(--text-light)" />
                <h2 style={{ marginTop: 16 }}>ไม่ว่าง / Taken</h2>
                <p>คิวที่ {id} ถูกจองแล้ว</p>
                <div style={{ marginTop: 20 }}>
                    ไม่สามารถจองซ้ำได้
                </div>
            </div>
        );
    }

    // --- Status: CALLED ---
    if (queue.status === 'called') {
        return (
            <div className="card" style={{ border: '2px solid var(--warning)' }}>
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <CheckCircle size={48} color="var(--success)" style={{ marginBottom: 16 }} />
                    <h1>ถึงคิวคุณแล้ว!</h1>
                    <p style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--primary)' }}>กรุณามาที่หน้าร้านได้เลย</p>
                </div>

                {isMyQueue && (
                    <div style={{ textAlign: 'center', marginTop: 20, padding: 10, background: '#d1fae5', borderRadius: 8 }}>
                        <p>นี่คือคิวของคุณ ({queue.customer_name})</p>
                    </div>
                )}
            </div>
        );
    }

    return <div>Unknown Status</div>;
}
