// Sound effects made with the Web Audio API (no audio files).
(function () {
  let ctx = null;
  let muted = false;
  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone({ f = 440, f2 = null, type = 'sine', dur = 0.15, vol = 0.2, delay = 0, attack = 0.005 }) {
    if (muted) return;
    const a = ac();
    if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function noise({ dur = 0.2, vol = 0.15, delay = 0, hp = 1000 }) {
    if (muted) return;
    const a = ac();
    if (!a) return;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    src.buffer = buf;
    const filt = a.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = hp;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(filt).connect(g).connect(a.destination);
    src.start(a.currentTime + delay);
  }
  const S = {
    unlock: () => ac(),
    setMuted: (m) => { muted = !!m; },
    isMuted: () => muted,
    ding: () => { tone({ f: 1320, dur: 0.25, vol: 0.12 }); tone({ f: 1760, dur: 0.3, vol: 0.08, delay: 0.06 }); },
    coin: () => { tone({ f: 1900, type: 'square', dur: 0.06, vol: 0.05 }); tone({ f: 2500, type: 'square', dur: 0.12, vol: 0.05, delay: 0.06 }); },
    cost: () => { tone({ f: 220, f2: 140, type: 'triangle', dur: 0.22, vol: 0.18 }); noise({ dur: 0.08, vol: 0.05, hp: 3000 }); },
    register: () => { noise({ dur: 0.12, vol: 0.12, hp: 2000 }); tone({ f: 980, dur: 0.4, vol: 0.12, delay: 0.1 }); tone({ f: 1470, dur: 0.5, vol: 0.08, delay: 0.14 }); },
    buzz: () => { tone({ f: 110, type: 'sawtooth', dur: 0.35, vol: 0.12 }); tone({ f: 104, type: 'sawtooth', dur: 0.35, vol: 0.12, delay: 0.4 }); },
    tick: () => tone({ f: 1800, type: 'square', dur: 0.03, vol: 0.04 }),
    whoosh: () => noise({ dur: 0.35, vol: 0.06, hp: 600 }),
    fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.45, vol: 0.14, delay: i * 0.14 })); tone({ f: 1047, type: 'triangle', dur: 0.9, vol: 0.12, delay: 0.62 }); },
    sting: () => { [392, 370, 349, 262].forEach((f, i) => tone({ f, type: 'sawtooth', dur: 0.5, vol: 0.1, delay: i * 0.28 })); },
    flip: () => { for (let i = 0; i < 6; i++) tone({ f: 900 + i * 60, type: 'square', dur: 0.03, vol: 0.04, delay: i * 0.09 }); },
  };
  window.Sound = S;
})();
