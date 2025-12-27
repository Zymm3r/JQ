// Simple notification sound (Base64) to avoid external dependencies
const NOTIFICATION_SOUND = "data:audio/wav;base64,UklGRl9vT1BXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"; // Placeholder, I'll use a real short beep base64 below

// A simple pleasant "Ding" sound (synthetic) using Web Audio API to avoid large base64 strings
export function playNotificationSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        // Nice "Ding" effect
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.1); // Octave up quickly

        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);

        osc.start();
        osc.stop(ctx.currentTime + 0.8);
    } catch (e) {
        console.error("Audio play failed", e);
    }
}

export function playAlertSound() {
    // Try playing the custom file first
    // Note: User must fetch/put 'alert.m4a' in client/public/ folder
    const audio = new Audio('/alert.m4a');
    audio.play().catch(e => {
        // console.warn("Custom sound not found or blocked, using fallback beep.", e);
        playSynthAlert();
    });
}

// Fallback synthetic beep
function playSynthAlert() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        // Urgent "Beep Beep"
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, ctx.currentTime);

        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.1);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.11);

        gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.2);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.3);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.31);

        osc.start();
        osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
        console.error("Audio play failed", e);
    }
}
