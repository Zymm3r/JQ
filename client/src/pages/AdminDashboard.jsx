import { useState, useEffect } from 'react';
import { api, socket } from '../api';
import toast from 'react-hot-toast';
import { Bell, CheckCircle, XCircle, RefreshCw, Settings, Users, Clock, Utensils, Tv, Lock, LogOut } from 'lucide-react';

export default function AdminDashboard() {
    const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem('admin_token') === 'true');
    const [pin, setPin] = useState('');
    const [queues, setQueues] = useState([]);
    const [stats, setStats] = useState({ total: 0, completed: 0, cancelled: 0, waiting: 0 });
    const [showSettings, setShowSettings] = useState(false);
    const [avgTime, setAvgTime] = useState(30);
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        if (!isAuthenticated) return;
        const timer = setInterval(() => setNow(new Date()), 1000); // Live timer updates
        return () => clearInterval(timer);
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;
        fetchQueues();
        fetchStats();

        const handleUpdate = (updatedQueues) => {
            setQueues(updatedQueues);
            fetchStats();
        };

        socket.on('queue_updated', handleUpdate);
        return () => socket.off('queue_updated', handleUpdate);
    }, [isAuthenticated]);

    const handleLogin = (e) => {
        e.preventDefault();
        if (pin === '1234') {
            setIsAuthenticated(true);
            localStorage.setItem('admin_token', 'true');
            toast.success('Welcome Admin');
        } else {
            toast.error('Invalid PIN');
        }
    };

    const handleLogout = () => {
        setIsAuthenticated(false);
        localStorage.removeItem('admin_token');
        setPin('');
    };

    if (!isAuthenticated) {
        return (
            <div style={{ padding: 40, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f1f5f9' }}>
                <div className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
                    <div style={{ marginBottom: 20, color: 'var(--primary)' }}>
                        <Lock size={48} />
                    </div>
                    <h2>Admin Access</h2>
                    <p style={{ color: 'var(--text-light)', marginBottom: 20 }}>Please enter the PIN to continue</p>
                    <form onSubmit={handleLogin}>
                        <div className="input-group">
                            <input
                                type="password"
                                value={pin}
                                onChange={e => setPin(e.target.value)}
                                placeholder="Enter PIN"
                                style={{ textAlign: 'center', fontSize: '1.2rem', letterSpacing: 4 }}
                                autoFocus
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Login</button>
                    </form>
                </div>
            </div>
        );
    }

    useEffect(() => {
        fetchQueues();
        fetchStats();

        const handleUpdate = (updatedQueues) => {
            setQueues(updatedQueues);
            fetchStats();
        };

        socket.on('queue_updated', handleUpdate);
        return () => socket.off('queue_updated', handleUpdate);
    }, []);

    const fetchQueues = () => {
        api.get('/queues').then(res => setQueues(res.data));
    };

    const fetchStats = () => {
        api.get('/admin/stats').then(res => setStats(res.data));
    };

    const handleCall = async (id) => {
        try {
            await api.post('/admin/call', { id });
            toast.success(`Called Q${id}`);
        } catch (err) {
            toast.error('Failed to call');
        }
    };

    const handleSeat = async (id) => {
        try {
            await api.post('/admin/seat', { id });
            toast.success(`Seated Q${id}`);
        } catch (err) {
            toast.error('Failed to seat');
        }
    };

    const handleComplete = async (id, skipConfirm = false) => {
        if (!skipConfirm && !window.confirm(`Clear Dining Q${id}?`)) return;
        try {
            await api.post('/admin/complete', { id });
            if (!skipConfirm) toast.success(`Completed Q${id}`);
        } catch (err) {
            console.error(err);
            if (!skipConfirm) toast.error('Failed to complete');
        }
    };

    const handleCancel = async (id) => {
        if (!window.confirm(`Cancel Q${id}?`)) return;
        try {
            await api.post('/cancel', { id });
            toast.success(`Cancelled Q${id}`);
        } catch (err) {
            toast.error('Failed to cancel');
        }
    };

    const handleResetAll = async () => {
        if (!window.confirm('WARNING: This will clear ALL active queues. Continue?')) return;
        try {
            await api.post('/admin/reset');
            toast.success('Reset Successful');
            fetchStats();
        } catch (err) {
            toast.error('Failed to reset');
        }
    };

    const saveSettings = async () => {
        try {
            await api.post('/admin/settings', { avgTime });
            toast.success('Settings Saved');
            setShowSettings(false);
        } catch (err) {
            toast.error('Failed to save settings');
        }
    };

    const getDiningTime = (startTime) => {
        if (!startTime) return '00:00';
        const start = new Date(startTime).getTime();
        const diff = now.getTime() - start;

        // Format as HH:MM:SS
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);

        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const isOverLimit = (startTime) => {
        if (!startTime) return false;
        const start = new Date(startTime).getTime();
        return (now.getTime() - start) > (2 * 60 * 60 * 1000); // 2 Hours
    };

    const waitingQueues = queues.filter(q => q.status === 'waiting');
    const calledQueues = queues.filter(q => q.status === 'called');
    const diningQueues = queues.filter(q => q.status === 'dining');

    return (
        <div>
            {/* Header & Stats */}
            <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2>Admin Dashboard</h2>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => setShowSettings(!showSettings)} className="btn-secondary" style={{ padding: '8px' }}>
                            <Settings size={18} />
                        </button>
                        <button onClick={handleResetAll} className="btn-secondary" style={{ padding: '8px', color: 'var(--danger)' }}>
                            <RefreshCw size={18} />
                        </button>
                        <button onClick={() => window.open('/monitor', '_blank')} className="btn-secondary" style={{ padding: '8px' }} title="Open Monitor">
                            <Tv size={18} />
                        </button>
                        <button onClick={handleLogout} className="btn-secondary" style={{ padding: '8px', color: 'var(--text-light)' }} title="Logout">
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>

                {showSettings && (
                    <div style={{ padding: 15, background: '#f8fafc', borderRadius: 8, marginBottom: 20 }}>
                        <h4>Settings</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                            <label>Avg Time per Table (mins):</label>
                            <input
                                type="number"
                                value={avgTime}
                                onChange={e => setAvgTime(e.target.value)}
                                style={{ width: 80, padding: 5 }}
                            />
                            <button onClick={saveSettings} className="btn-primary" style={{ padding: '5px 15px' }}>Save</button>
                        </div>
                    </div>
                )}

                <div className="grid-2">
                    <div className="stat-box" style={{ background: '#eff6ff', padding: 15, borderRadius: 8 }}>
                        <div style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>Waiting</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)' }}>{stats.waiting}</div>
                    </div>
                    <div className="stat-box" style={{ background: '#fefce8', padding: 15, borderRadius: 8 }}>
                        <div style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>Dining</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ca8a04' }}>{diningQueues.length}</div>
                    </div>
                    <div className="stat-box" style={{ background: '#f8fafc', padding: 15, borderRadius: 8 }}>
                        <div style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>Completed</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.completed}</div>
                    </div>
                    <div className="stat-box" style={{ background: '#fef2f2', padding: 15, borderRadius: 8 }}>
                        <div style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>Cancelled</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)' }}>{stats.cancelled}</div>
                    </div>
                </div>
            </div>

            <div className="dashboard-grid">
                {/* 1. Dining (Priority) */}
                <div className="section-col">
                    <h3 style={{ color: '#ca8a04', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Utensils size={20} /> ทานอยู่ (Dining)
                    </h3>
                    <div className="queue-list">
                        {diningQueues.length === 0 ? <EmptyState text="No dining tables" /> : diningQueues.map(q => (
                            <div key={q.id} className={`card queue-item-row dining ${isOverLimit(q.start_time) ? 'overtime' : ''}`}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div className="q-number">{q.id}</div>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{q.customer_name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{q.pax} ท่าน</div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div className="timer-badge" style={{
                                            background: isOverLimit(q.start_time) ? '#fee2e2' : '#fef9c3',
                                            color: isOverLimit(q.start_time) ? '#dc2626' : '#854d0e',
                                        }}>
                                            <Clock size={12} style={{ marginRight: 4 }} />
                                            {getDiningTime(q.start_time)}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button onClick={() => handleComplete(q.id)} className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                                        Clear Table
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. Called */}
                <div className="section-col">
                    <h3 style={{ color: 'var(--success)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Bell size={20} /> เรียกแล้ว (Called)
                    </h3>
                    <div className="queue-list">
                        {calledQueues.length === 0 ? <EmptyState text="No called queues" /> : calledQueues.map(q => (
                            <div key={q.id} className="card queue-item-row called">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div className="q-number">{q.id}</div>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{q.customer_name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{q.pax} ท่าน</div>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => handleSeat(q.id)} className="btn btn-success" style={{ width: '100%' }}>
                                    <CheckCircle size={16} style={{ marginRight: 5 }} /> Customer Seated
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 3. Waiting */}
                <div className="section-col">
                    <h3 style={{ color: 'var(--primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Users size={20} /> รอคิว (Waiting)
                    </h3>
                    <div className="queue-list">
                        {waitingQueues.length === 0 ? <EmptyState text="No waiting queues" /> : waitingQueues.map(q => (
                            <div key={q.id} className="card queue-item-row">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div className="q-number">{q.id}</div>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>
                                                {q.customer_name}
                                                {q.time_slot && <span style={{ marginLeft: 8, background: '#e0e7ff', color: '#4338ca', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem' }}>{q.time_slot}</span>}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{q.pax} ท่าน</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 5 }}>
                                        <button onClick={() => handleCall(q.id)} className="btn-icon btn-primary">
                                            <Bell size={16} />
                                        </button>
                                        <button onClick={() => handleCancel(q.id)} className="btn-icon btn-danger">
                                            <XCircle size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <style>{`
                .dashboard-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 20px;
                }
                @media (max-width: 900px) {
                    .dashboard-grid { grid-template-columns: 1fr; }
                }
                .section-col {
                    background: #f8fafc;
                    padding: 15px;
                    border-radius: 12px;
                }
                .queue-item-row {
                    padding: 12px 16px;
                    margin-bottom: 10px;
                    border-left: 4px solid var(--border);
                    background: white;
                }
                .queue-item-row.called { border-left-color: var(--success); }
                .queue-item-row.dining { border-left-color: #ca8a04; }
                .queue-item-row.dining.overtime { 
                    border-left-color: #dc2626; 
                    border: 2px solid #dc2626;
                }
                
                .q-number {
                    font-size: 1.2rem;
                    fontWeight: 700;
                    min-width: 35px;
                }
                .timer-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 0.8rem;
                    fontWeight: 600;
                }
                .btn-icon {
                    border: none;
                    border-radius: 6px;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    cursor: pointer;
                }
                .btn-icon.btn-primary { background: var(--primary); }
                .btn-icon.btn-danger { background: var(--danger); }
                .btn-outline {
                    background: transparent;
                    border: 1px solid var(--border);
                    color: var(--text);
                    cursor: pointer;
                    border-radius: 6px;
                }
            `}</style>
        </div>
    );
}

function EmptyState({ text }) {
    return (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-light)', background: '#fff', borderRadius: 8, fontStyle: 'italic', fontSize: '0.9rem' }}>
            {text}
        </div>
    );
}
