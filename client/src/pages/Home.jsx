import { useNavigate } from 'react-router-dom';
import { QrCode } from 'lucide-react';

export default function Home() {
    const navigate = useNavigate();

    return (
        <div className="card" style={{ textAlign: 'center', marginTop: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', color: 'var(--primary)' }}>
                <QrCode size={64} />
            </div>
            <h2>ระบบจองคิวออนไลน์</h2>
            <p style={{ color: 'var(--text-light)', marginBottom: '30px' }}>
                Smart Queue Reservation System
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Admin button removed for separation. Access via /admin */}

                <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginTop: '20px' }}>
                    *สำหรับลูกค้า กรุณาสแกน QR Code ที่โต๊ะ/หน้าร้าน
                </p>

                {/* Debug Links for demo */}
                <div style={{ borderTop: '1px solid #eee', paddingTop: '20px', marginTop: '20px' }}>
                    <p style={{ fontSize: '0.8rem', marginBottom: '10px' }}>Demo Links (Click to simulate scan):</p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map(i => (
                            <button key={i} onClick={() => navigate(`/queue/${i}`)}
                                style={{ padding: '8px', background: '#f1f5f9', border: 'none', borderRadius: '8px' }}>
                                Q{i}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
