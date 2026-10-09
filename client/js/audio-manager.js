/**
 * Gomoku AudioManager - Web Audio API sound synthesizer for game sound effects.
 * All sounds are synthesized locally (no external audio files); handles volume
 * controls, mute state persistence, and browser autoplay unlock.
 */

class AudioManager {
    constructor() {
        this.ctx = null;
        this.isMuted = localStorage.getItem('gomoku_muted') === 'true';
        this.volume = parseFloat(localStorage.getItem('gomoku_volume') || '0.7');
        this.soundPool = {};
        this.isUnlocked = false;

        this._initAudioContext();
        this._setupAutoplayUnlock();
    }

    /**
     * Initialize AudioContext with webkit fallback
     */
    _initAudioContext() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            this.ctx = new AudioContextClass();
        }
    }

    /**
     * Unlock AudioContext on initial user interaction (click, tap, keydown)
     */
    _setupAutoplayUnlock() {
        const unlock = () => {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().then(() => {
                    this.isUnlocked = true;
                }).catch(() => {});
            } else {
                this.isUnlocked = true;
            }
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
            window.removeEventListener('keydown', unlock);
        };

        window.addEventListener('click', unlock);
        window.addEventListener('touchstart', unlock);
        window.addEventListener('keydown', unlock);
    }

    /**
     * Ensure AudioContext is active
     */
    _ensureActive() {
        if (!this.ctx) {
            this._initAudioContext();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Set Master Volume (0.0 to 1.0)
     */
    setVolume(val) {
        this.volume = Math.max(0, Math.min(1, val));
        localStorage.setItem('gomoku_volume', this.volume.toString());
    }

    /**
     * Toggle Mute State
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        localStorage.setItem('gomoku_muted', this.isMuted.toString());
        return this.isMuted;
    }

    /**
     * Set Mute State explicitly
     */
    setMute(muted) {
        this.isMuted = !!muted;
        localStorage.setItem('gomoku_muted', this.isMuted.toString());
    }

    // =========================================================================
    // WEB AUDIO API SYNTHESIZERS (Zero external assets fallback)
    // =========================================================================

    /**
     * Synthesizes a tactile wooden stone click sound simulating Go/Gomoku stone placement
     * @param {boolean} isOpponent - pitch variation for opponent move
     */
    playMoveSound(isOpponent = false) {
        if (this.isMuted) return;
        this._ensureActive();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const masterGain = this.ctx.createGain();
        masterGain.gain.setValueAtTime(this.volume, now);
        masterGain.connect(this.ctx.destination);

        // 1. Resonant Wood Body (Sine / Lowpass filter)
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();

        const baseFreq = isOpponent ? 420 : 480;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.3, now + 0.08);

        oscGain.gain.setValueAtTime(0.7, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(oscGain);
        oscGain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.08);

        // 2. High-frequency transient impact (Noise click)
        const bufferSize = this.ctx.sampleRate * 0.015; // 15ms noise burst
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1200, now);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(masterGain);

        noise.start(now);
    }

    /**
     * Synthesizes a victorious ascending chime/arpeggio
     */
    playWinSound() {
        if (this.isMuted) return;
        this._ensureActive();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (Major triad)
        
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const startTime = now + idx * 0.09;
            const duration = 0.4;

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.4 * this.volume, startTime + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(startTime);
            osc.stop(startTime + duration);
        });
    }

    /**
     * Synthesizes a soft minor defeat chord
     */
    playLoseSound() {
        if (this.isMuted) return;
        this._ensureActive();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const notes = [392.00, 349.23, 329.63, 293.66]; // G4, F4, E4, D4 (Descending minor tone)

        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const startTime = now + idx * 0.12;
            const duration = 0.5;

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.2 * this.volume, startTime + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(startTime);
            osc.stop(startTime + duration);
        });
    }

    /**
     * Synthesizes an invalid move warning thud
     */
    playInvalidMoveSound() {
        if (this.isMuted) return;
        this._ensureActive();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);

        gain.gain.setValueAtTime(0.3 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.12);
    }

    /**
     * Synthesizes a clock tick sound
     */
    playTimerTickSound() {
        if (this.isMuted) return;
        this._ensureActive();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.03);

        gain.gain.setValueAtTime(0.2 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.03);
    }

    /**
     * Synthesizes a short dual-tone "message received" chime (E5 → A5).
     * Used by Private Chat (#159) when an incoming message arrives, including
     * while the tab is hidden. Respects volume + mute like the other sounds.
     */
    playMessageSound() {
        if (this.isMuted) return;
        this._ensureActive();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now);           // E5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.5 * this.volume, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.35);
    }
}

// Export singleton instance globally or for ES6 modules
if (typeof window !== 'undefined') {
    window.audioManager = new AudioManager();
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioManager;
}
