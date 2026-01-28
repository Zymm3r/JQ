import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrCode, User, MessageCircle, Phone, Users, LogIn, Clock } from 'lucide-react';
import { api } from '../api';
import toast from 'react-hot-toast';
import liff from '@line/liff';

export default function Home() {
    const navigate = useNavigate();
    const [form, setForm] = useState({ name: '', lineId: '', phone: '', pax: 1, timeSlot: '' });
    const [submitting, setSubmitting] = useState(false);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [liffError, setLiffError] = useState(null);

    useEffect(() => {
        const initLiff = async () => {
            try {
                // Attempt to initialize LIFF
                // Note: You must set VITE_LIFF_ID in client/.env
                const liffId = import.meta.env.VITE_LIFF_ID;

                if (!liffId || liffId === 'YOUR_LIFF_ID_HERE') {
                    // Fallback for demo/dev without LIFF
                    console.warn("LIFF ID not found. Running in manual mode.");
                    setLoading(false);
                    return;
                }

                await liff.init({ liffId });

                if (liff.isLoggedIn()) {
                    const profile = await liff.getProfile();
                    setProfile(profile);
                    setForm(prev => ({
                        ...prev,
                        name: profile.displayName,
                        lineId: profile.userId
                    }));
                } else {
                    // Auto login if opened in LINE, otherwise show login button
                    if (liff.isInClient()) {
                        liff.login();
                    }
                }
            } catch (err) {
                console.error("LIFF Init Error:", err);
                setLiffError(err.message);
            } finally {
                setLoading(false);
            }
        };

        initLiff();
    }, []);

    const handleLogin = () => {
        if (!import.meta.env.VITE_LIFF_ID) {
            toast.error("LIFF ID not configured");
            return;
        }
        liff.login();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name) return toast.error('Required: Name');

        setSubmitting(true);
        try {
            const res = await api.post('/reserve', form);
            localStorage.setItem('my_queue', JSON.stringify({ queueId: res.data.id, ...form }));
            toast.success('Reservation Success!');
            navigate(`/queue/${res.data.id}`);

            // Close window if in LINE
            if (liff.isInClient()) {
                setTimeout(() => liff.closeWindow(), 2000);
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to reserve');
            if (err.response?.data?.queueId) {
                navigate(`/queue/${err.response.data.queueId}`);
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div style={{ textAlign: 'center', marginTop: 100 }}>Loading...</div>;
    }

    return (
        <div className="card" style={{ maxWidth: '500px', margin: '40px auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', color: 'var(--primary)' }}>
                    {profile?.pictureUrl ? (
                        <img src={profile.pictureUrl} alt="Profile" style={{ width: 80, height: 80, borderRadius: '50%', border: '4px solid var(--primary-light)' }} />
                    ) : (
                        <QrCode size={64} />
                    )}
                </div>
                <h2>Shabu Q</h2>
                <p style={{ color: 'var(--text-light)' }}>
                    {profile ? `สวัสดีคุณ ${profile.displayName}` : 'จองคิวออนไลน์รวดเร็วทันใจ'}
                </p>
            </div>

            <form onSubmit={handleSubmit}>
                {!profile && (
                    <div style={{ marginBottom: 20, textAlign: 'center' }}>
                        <button type="button" onClick={handleLogin} className="btn" style={{ background: '#06C755', color: 'white', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                            <LogIn size={20} /> Login with LINE
                        </button>
                        <div style={{ margin: '15px 0', position: 'relative' }}>
                            <span style={{ background: 'white', padding: '0 10px', color: 'var(--text-light)', fontSize: '0.8rem' }}>หรือ กรอกเอง</span>
                        </div>
                    </div>
                )}

                <div className="input-group">
                    <label><User size={18} /> ชื่อ (Name) *</label>
                    <input
                        type="text"
                        required
                        placeholder="Ex. Somchai"
                        value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        disabled={!!profile} // Lock name if from LIFF
                        style={{ background: profile ? '#f1f5f9' : 'white' }}
                    />
                </div>

                <div className="input-group">
                    <label><Clock size={18} /> Time Slot (ช่วงเวลา)</label>
                    <select
                        value={form.timeSlot}
                        onChange={e => setForm({ ...form, timeSlot: e.target.value })}
                        style={{ border: '2px solid var(--primary-light)' }}
                    >
                        <option value="">คิวปกติ (Now)</option>
                        {['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'].map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>

                <div className="input-group">
                    <label><Users size={18} /> Pax (จำนวนคน)</label>
                    <select
                        value={form.pax}
                        onChange={e => setForm({ ...form, pax: parseInt(e.target.value) })}
                    >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                            <option key={n} value={n}>{n} คน</option>
                        ))}
                    </select>
                </div>

                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ marginTop: '10px' }}>
                    {submitting ? 'กำลังจอง...' : 'รับบัตรคิว (Get Queue)'}
                </button>
            </form>

        </div>
    );
}
