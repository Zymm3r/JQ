import { useState, useEffect } from 'react';
import { socket, api } from '../api';
import { Clock } from 'lucide-react';

export default function Monitor() {
    const [queues, setQueues] = useState([]);

    useEffect(() => {
        api.get('/queues').then(res => setQueues(res.data));

        const handleUpdate = (updatedQueues) => {
            setQueues(updatedQueues);
        };

        socket.on('queue_updated', handleUpdate);
        return () => socket.off('queue_updated', handleUpdate);
    }, []);

    const calledQueues = queues.filter(q => q.status === 'called');
    const waitingQueues = queues.filter(q => q.status === 'waiting');

    return (
        <div style={{ padding: 20, height: '100vh', background: '#f8fafc', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, height: '100%' }}>

                {/* Left: Called (Flashy) */}
                <div className="card" style={{ background: '#ecfccb', display: 'flex', flexDirection: 'column' }}>
                    <h1 style={{ textAlign: 'center', fontSize: '3rem', color: '#3f6212', marginBottom: 30, borderBottom: '2px solid #3f6212', paddingBottom: 10 }}>
                        เชิญหมายเลข (Called)
                    </h1>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {calledQueues.map(q => (
                            <div key={q.id} className="monitor-item called-flash">
                                <div style={{ fontSize: '5rem', fontWeight: 800, color: '#365314' }}>{q.id}</div>
                                <div style={{ fontSize: '2rem', color: '#4d7c0f' }}>{q.customer_name}</div>
                                <div style={{ fontSize: '1.5rem', color: '#65a30d' }}>{q.pax} ท่าน</div>
                            </div>
                        ))}
                        {calledQueues.length === 0 && (
                            <div style={{ textAlign: 'center', fontSize: '2rem', color: '#84cc16', marginTop: 100 }}>
                                รอเรียกคิว...
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Waiting */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <h1 style={{ textAlign: 'center', fontSize: '2.5rem', color: 'var(--primary)', marginBottom: 30, borderBottom: '2px solid var(--primary)', paddingBottom: 10 }}>
                        รอสักครู่ (Waiting)
                    </h1>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {waitingQueues.map((q, i) => (
                            <div key={q.id} className="monitor-item waiting-row">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                                    <div style={{ fontSize: '2.5rem', fontWeight: 700, width: 80 }}>{q.id}</div>
                                    <div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                                            {q.customer_name}
                                            {q.time_slot && <span className="time-tag">{q.time_slot}</span>}
                                        </div>
                                        <div style={{ fontSize: '1.2rem', color: 'var(--text-light)' }}>{q.pax} ท่าน</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--primary)' }}>
                                    {q.estimatedWaitTime} min
                                </div>
                            </div>
                        ))}
                        {waitingQueues.length === 0 && (
                            <div style={{ textAlign: 'center', fontSize: '2rem', color: '#cbd5e1', marginTop: 100 }}>
                                ว่าง
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .monitor-item {
                    background: white;
                    border-radius: 16px;
                    padding: 20px 30px;
                    margin-bottom: 20px;
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
                    text-align: center;
                }
                .called-flash {
                    animation: flash 2s infinite;
                    border: 4px solid #84cc16;
                }
                @keyframes flash {
                    0% { transform: scale(1); background-color: white; }
                    50% { transform: scale(1.02); background-color: #f7fee7; }
                    100% { transform: scale(1); background-color: white; }
                }
                .waiting-row {
                    display: flex; 
                    justify-content: space-between;
                    align-items: center;
                    text-align: left;
                    border-left: 6px solid var(--primary);
                }
                .time-tag {
                    margin-left: 15px; 
                    background: #e0e7ff; 
                    color: #4338ca; 
                    padding: 4px 12px; 
                    border-radius: 8px; 
                    font-size: 1rem;
                }
            `}</style>
        </div>
    );
}
