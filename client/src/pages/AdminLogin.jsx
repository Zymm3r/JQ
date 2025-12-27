import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminLogin() {
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const handleLogin = (e) => {
        e.preventDefault();
        // Simple hardcoded password for demonstration
        if (password === '1234') {
            localStorage.setItem('admin_auth', 'true');
            toast.success('ยินดีต้อนรับครับ (Welcome)');
            navigate('/admin');
        } else {
            toast.error('รหัสผ่านไม่ถูกต้อง (Incorrect Password)');
            setPassword('');
        }
    };

    return (
        <div className="card" style={{ maxWidth: '400px', margin: '40px auto', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', color: 'var(--primary)' }}>
                <Lock size={48} />
            </div>
            <h2 style={{ marginBottom: '8px' }}>Admin Login</h2>
            <p style={{ color: 'var(--text-light)', marginBottom: '24px' }}>
                เข้าสู่ระบบจัดการคิวร้านค้า
            </p>

            <form onSubmit={handleLogin}>
                <div className="input-group">
                    <input
                        type="password"
                        placeholder="กรอกรหัสผ่าน (Password)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ textAlign: 'center', fontSize: '1.2rem', letterSpacing: '4px' }}
                        autoFocus
                    />
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                    เข้าสู่ระบบ <ArrowRight size={18} style={{ marginLeft: 8 }} />
                </button>
            </form>

            <button
                onClick={() => navigate('/')}
                className="btn"
                style={{ marginTop: '16px', background: 'transparent', color: 'var(--text-light)', border: 'none' }}
            >
                กลับหน้าหลัก
            </button>
        </div>
    );
}
