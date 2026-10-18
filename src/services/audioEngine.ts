import { formatClock } from '../utils/geo';

/**
 * Web Audio API synthesizer for HIIT timer and GPS cues.
 * Completely zero-dependency and works offline without downloading mp3 files.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    const saved = localStorage.getItem('pulse_audio_muted');
    if (saved !== null) {
      this.isMuted = saved === 'true';
    }
  }

  private initContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    localStorage.setItem('pulse_audio_muted', String(muted));
  }

  public toggleMuted(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /**
   * Short countdown beep for 3, 2, 1 seconds before transition
   */
  public playCountdown(pitch: number = 600) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  private activeGains: GainNode[] = [];

  /**
   * Smoothly stops all currently playing synthesizer audio cues
   */
  public stopAllSounds() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      for (const gain of this.activeGains) {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      }
    } catch {
      // Ignore
    }
    this.activeGains = [];
  }

  private makeDistortionCurve(amount: number = 25): Float32Array<ArrayBuffer> {
    const k = amount;
    const nSamples = 22050;
    const buffer = new ArrayBuffer(nSamples * 4);
    const curve = new Float32Array(buffer);
    const deg = Math.PI / 180;
    for (let i = 0; i < nSamples; ++i) {
      const x = (i * 2) / nSamples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  /**
   * Som de Gongo de Boxe Profissional (~5 Segundos)
   * 3 badaladas metálicas reais CLANG! CLANG! CLAAAANG! com gongo profundo vibrando por 5 segundos.
   * Utilizado tanto para Início de Corrida/Tiro quanto para Início de Descanso.
   */
  public playBoxingGongSound() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      this.stopAllSounds();

      const now = this.ctx.currentTime;
      const masterGain = this.ctx.createGain();
      masterGain.gain.setValueAtTime(0.85, now);
      masterGain.connect(this.ctx.destination);
      this.activeGains.push(masterGain);

      // 1. Sino de Boxe Real / Gongo Metálico (3 badaladas: 0.0s, 0.75s, 1.5s)
      const strikes = [
        { time: 0.0, dur: 1.8, vol: 0.60 },
        { time: 0.75, dur: 1.8, vol: 0.65 },
        { time: 1.50, dur: 3.4, vol: 0.80 }, // Terceira badalada ressoa por mais de 3.4s
      ];

      // Parciais inarmônicas metálicas de sino de boxe real
      const bellPartials = [
        { mult: 1.0, decay: 1.0, vol: 0.55 },  // 720Hz
        { mult: 1.41, decay: 0.75, vol: 0.38 }, // 1015Hz
        { mult: 2.02, decay: 0.55, vol: 0.28 }, // 1454Hz
        { mult: 2.82, decay: 0.35, vol: 0.22 },  // 2030Hz
        { mult: 4.15, decay: 0.25, vol: 0.16 }, // 2988Hz
      ];

      strikes.forEach(({ time, dur, vol }) => {
        if (!this.ctx) return;
        const strikeTime = now + time;

        // Golpe do martelo no sino (percussão metálica)
        const clickOsc = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        clickOsc.type = 'triangle';
        clickOsc.frequency.setValueAtTime(1450, strikeTime);
        clickOsc.frequency.exponentialRampToValueAtTime(280, strikeTime + 0.05);
        clickGain.gain.setValueAtTime(vol * 0.7, strikeTime);
        clickGain.gain.exponentialRampToValueAtTime(0.001, strikeTime + 0.05);
        clickOsc.connect(clickGain);
        clickGain.connect(masterGain);
        clickOsc.start(strikeTime);
        clickOsc.stop(strikeTime + 0.05);

        // Ressonância metálica do sino
        bellPartials.forEach((partial) => {
          if (!this.ctx) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(720 * partial.mult, strikeTime);

          const partialDur = dur * partial.decay;
          gain.gain.setValueAtTime(0.001, strikeTime);
          gain.gain.linearRampToValueAtTime(vol * partial.vol, strikeTime + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.0001, strikeTime + partialDur);

          osc.connect(gain);
          gain.connect(masterGain);

          osc.start(strikeTime);
          osc.stop(strikeTime + partialDur);
        });
      });

      // 2. Sub-Gongo Grave Industrial (110Hz a 55Hz)
      const gongOsc = this.ctx.createOscillator();
      const gongGain = this.ctx.createGain();
      gongOsc.type = 'triangle';
      gongOsc.frequency.setValueAtTime(110, now + 1.5);
      gongOsc.frequency.exponentialRampToValueAtTime(50, now + 4.9);

      gongGain.gain.setValueAtTime(0.001, now + 1.5);
      gongGain.gain.linearRampToValueAtTime(0.45, now + 1.6);
      gongGain.gain.exponentialRampToValueAtTime(0.0001, now + 5.0);

      gongOsc.connect(gongGain);
      gongGain.connect(masterGain);

      gongOsc.start(now + 1.5);
      gongOsc.stop(now + 5.0);

      // Rampa final do Master Gain aos 5.0s
      masterGain.gain.setValueAtTime(0.85, now + 4.4);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 5.0);
    } catch {
      // Audio fallback
    }
  }

  /**
   * Som de Início de Corrida / Trabalho: Gongo de Boxe (~5s)
   */
  public playRunStartSound() {
    this.playBoxingGongSound();
  }

  /**
   * Som de Início de Descanso / Recuperação: Gongo de Boxe (~5s)
   */
  public playRestSound() {
    this.playBoxingGongSound();
  }

  /**
   * Alias de início de burst
   */
  public playStartBurst() {
    this.playBoxingGongSound();
  }

  /**
   * Alias de descanso
   */
  public playRestChime() {
    this.playBoxingGongSound();
  }

  /**
   * Fanfare melody for complete workout finish
   */
  public playVictory() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      const noteDuration = 0.16;

      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime + idx * noteDuration;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (idx === notes.length - 1 ? 0.6 : noteDuration * 0.9));

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + (idx === notes.length - 1 ? 0.6 : noteDuration * 0.9));
      });
    } catch {
      // Fallback
    }
  }

  private silentAudioEl: HTMLAudioElement | null = null;
  private isKeepAliveRunning: boolean = false;
  private onHeartbeatCallback: (() => void) | null = null;
  private lastHeartbeatTime: number = 0;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private worker: Worker | null = null;

  public setHeartbeatCallback(cb: (() => void) | null) {
    this.onHeartbeatCallback = cb;
  }

  private triggerHeartbeat() {
    if (!this.isKeepAliveRunning || !this.onHeartbeatCallback) return;
    const now = Date.now();
    // Fire heartbeat roughly every 1.5s to keep GPS hardware active without overloading
    if (now - this.lastHeartbeatTime >= 1500) {
      this.lastHeartbeatTime = now;
      try {
        this.onHeartbeatCallback();
      } catch (err) {
        console.warn('Heartbeat callback error:', err);
      }
    }
  }

  /**
   * Generates a 10-second inaudible 8-bit PCM silent WAV data URL.
   * Completely zero-network and works 100% offline.
   * 10 seconds buffer prevents mobile browser audio-loop throttle when screen is locked.
   */
  private getSilentWavUrl(): string {
    const sampleRate = 8000;
    const numSamples = sampleRate * 10; // 10 seconds
    const buffer = new ArrayBuffer(44 + numSamples);
    const view = new DataView(buffer);

    // RIFF identifier
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + numSamples, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    // format chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    // data chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, numSamples, true);

    // 8-bit PCM silence center value (128 = 0 amplitude in unsigned 8-bit)
    for (let i = 0; i < numSamples; i++) {
      view.setUint8(44 + i, 128);
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  /**
   * Starts persistent mobile background running keep-alive:
   * 1. Plays a continuous HTML5 silent audio loop.
   * 2. Registers Media Session API on Android/iOS lock screens.
   * 3. Uses audio timeupdate + Web Audio ScriptProcessor + Web Worker
   *    to keep GPS polling active every 1.5s when the screen is turned off.
   */
  public startKeepAlive(
    activityTitle: string = 'Corrida com GPS',
    onTogglePause?: () => void,
    onBackgroundHeartbeat?: () => void
  ) {
    this.isKeepAliveRunning = true;
    if (onBackgroundHeartbeat) {
      this.onHeartbeatCallback = onBackgroundHeartbeat;
    }

    try {
      this.initContext();

      if (!this.silentAudioEl) {
        const audio = new Audio();
        audio.src = this.getSilentWavUrl();
        audio.loop = true;
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audio.volume = 0.05;
        audio.addEventListener('ended', () => {
          if (this.isKeepAliveRunning) {
            audio.play().catch(() => {});
          }
        });
        // Audio timeupdate fires continuously (3-4 times/sec) even when screen is locked
        audio.addEventListener('timeupdate', () => {
          this.triggerHeartbeat();
        });
        this.silentAudioEl = audio;
      }

      this.silentAudioEl.play().catch(() => {
        // Auto-play policy handled on user tap
      });

      // Web Audio ScriptProcessorNode runs on the native hardware audio clock
      // This is immune to main-thread timer freezing when screen turns off
      if (this.ctx) {
        try {
          if (this.scriptProcessor) {
            try { this.scriptProcessor.disconnect(); } catch {}
          }
          const sp = this.ctx.createScriptProcessor(4096, 1, 1);
          sp.onaudioprocess = () => {
            this.triggerHeartbeat();
          };
          const zeroGain = this.ctx.createGain();
          zeroGain.gain.setValueAtTime(0, this.ctx.currentTime);
          sp.connect(zeroGain);
          zeroGain.connect(this.ctx.destination);
          this.scriptProcessor = sp;
        } catch (err) {
          console.warn('ScriptProcessor background ticker setup:', err);
        }
      }

      // Inline Web Worker ticker: Worker timers are not throttled when audio is playing
      try {
        if (!this.worker && typeof window !== 'undefined' && 'Worker' in window) {
          const workerCode = `
            let timer = null;
            self.onmessage = function(e) {
              if (e.data === 'start') {
                if (timer) clearInterval(timer);
                timer = setInterval(function() {
                  self.postMessage('tick');
                }, 1500);
              } else if (e.data === 'stop') {
                if (timer) clearInterval(timer);
                timer = null;
              }
            };
          `;
          const blob = new Blob([workerCode], { type: 'application/javascript' });
          const workerUrl = URL.createObjectURL(blob);
          this.worker = new Worker(workerUrl);
          this.worker.onmessage = () => {
            this.triggerHeartbeat();
          };
        }
        if (this.worker) {
          this.worker.postMessage('start');
        }
      } catch (err) {
        console.warn('Background worker ticker setup:', err);
      }

      // Register Media Session API for mobile lock screen
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '0,00 km  •  00:00',
          artist: 'Ritmo: 0:00 /km  •  0 kcal',
          album: `JPX MOTION  •  ${activityTitle}`,
          artwork: [
            { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' },
          ],
        });

        navigator.mediaSession.playbackState = 'playing';

        if (onTogglePause) {
          navigator.mediaSession.setActionHandler('pause', () => {
            onTogglePause();
          });
          navigator.mediaSession.setActionHandler('play', () => {
            onTogglePause();
          });
        }
      }
    } catch (err) {
      console.warn('Keep-alive start error:', err);
    }
  }

  /**
   * Updates Media Session metadata on Android and iOS lock screens in real time.
   * Displays Distance, Pace, Calories, Time, and Activity Name directly on the lock screen widget!
   */
  public updateKeepAliveMetrics(params: {
    activityTitle: string;
    distanceKm: number;
    paceStr: string;
    elapsedSeconds: number;
    calories: number;
    extraInfo?: string;
  }) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      const distStr = `${params.distanceKm.toFixed(2).replace('.', ',')} km`;
      const timeStr = formatClock(params.elapsedSeconds);
      const paceText = params.paceStr && params.paceStr !== '--:-- /km' && params.paceStr !== '-:-- /km'
        ? params.paceStr
        : '0:00 /km';
      const calText = `${Math.round(params.calories || 0)} kcal`;

      // Line 1 on Lock Screen: "1,45 km  •  08:24"
      const title = `${distStr}  •  ${timeStr}`;

      // Line 2 on Lock Screen: "Ritmo: 5:12 /km  •  96 kcal" or HIIT round info
      const artist = params.extraInfo
        ? `${params.extraInfo}  •  ${calText}`
        : `Ritmo: ${paceText}  •  ${calText}`;

      // Line 3 on Lock Screen: "JPX MOTION  •  Corrida GPS"
      const album = `JPX MOTION  •  ${params.activityTitle}`;

      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork: [
          { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      });

      if ('setPositionState' in navigator.mediaSession) {
        navigator.mediaSession.setPositionState({
          duration: Math.max(params.elapsedSeconds, 1),
          playbackRate: 1,
          position: params.elapsedSeconds,
        });
      }
    } catch {
      // Ignore media session errors
    }
  }

  public stopKeepAlive() {
    this.isKeepAliveRunning = false;
    this.onHeartbeatCallback = null;

    if (this.worker) {
      try {
        this.worker.postMessage('stop');
      } catch {
        // Ignore
      }
    }

    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
      } catch {
        // Ignore
      }
      this.scriptProcessor = null;
    }

    if (this.silentAudioEl) {
      try {
        this.silentAudioEl.pause();
      } catch {
        // Ignore
      }
    }

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }
}

export const soundFx = new AudioEngine();
