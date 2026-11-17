import { RACK_CONFIGS } from './constants';

interface CrowdSectionAnchor {
  id: 'baseline' | 'left' | 'right';
  x: number;
  y: number;
  baseWeight: number;
  lowpassHz: number;
  bandpassHz: number;
}

const CROWD_SECTIONS: CrowdSectionAnchor[] = [
  { id: 'baseline', x: 0, y: -11.5, baseWeight: 1.0, lowpassHz: 350, bandpassHz: 740 },
  { id: 'left', x: -29.0, y: 8.5, baseWeight: 1.15, lowpassHz: 410, bandpassHz: 860 },
  { id: 'right', x: 29.0, y: 8.5, baseWeight: 0.94, lowpassHz: 390, bandpassHz: 820 },
];

interface SectionSpatialMix {
  id: 'baseline' | 'left' | 'right';
  gain: number;
  pan: number;
  brightness: number;
}

interface RackCrowdAcoustics {
  cheerGain: number;
  cheerPan: number;
  brightnessHz: number;
  sections: SectionSpatialMix[];
}

interface AmbientCrowdChannel {
  filter: BiquadFilterNode;
  gain: GainNode;
  panner: StereoPannerNode | null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;

  // Persistent positional arena crowd ambience graph
  private crowdBuffer: AudioBuffer | null = null;
  private crowdSources: AudioBufferSourceNode[] = [];
  private crowdLfo: OscillatorNode | null = null;
  private crowdMasterGain: GainNode | null = null;
  private crowdChannels: Partial<Record<'baseline' | 'left' | 'right', AmbientCrowdChannel>> = {};
  private crowdTargetGain = 0.018;
  private crowdExcitement = 0;
  private currentRackIndex = 2;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    this.updateCrowdStateGraph();
  }

  private getRackCrowdAcoustics(rackIndex: number): RackCrowdAcoustics {
    const safeIdx = Math.max(0, Math.min(RACK_CONFIGS.length - 1, rackIndex));
    const rack = RACK_CONFIGS[safeIdx];

    // Listener orientation from shooter POV camera looking toward hoop
    const fwdX = rack.camTarget.x - rack.camPos.x;
    const fwdY = rack.camTarget.y - rack.camPos.y;
    const fwdLen = Math.hypot(fwdX, fwdY) || 1;
    const ux = fwdX / fwdLen;
    const uy = fwdY / fwdLen;
    // Matches projection.ts: right = cross(forward, worldUp) = (uy, -ux)
    const rightX = uy;
    const rightY = -ux;

    let weightedGainSum = 0;
    let panWeightedSum = 0;
    let totalWeight = 0;
    let closestDist = 999;

    const sections: SectionSpatialMix[] = CROWD_SECTIONS.map((sec) => {
      const sdx = sec.x - rack.x;
      const sdy = sec.y - rack.y;
      const rackDist = Math.hypot(sdx, sdy);
      closestDist = Math.min(closestDist, rackDist);

      // Inverse-distance crowd proximity (corners near bleachers are ~1.3x, open key is ~0.68x)
      const proximity = clamp(Math.pow(21.5 / Math.max(9.5, rackDist), 0.92), 0.36, 1.55);
      const sectionGain = proximity * sec.baseWeight;

      const camDx = sec.x - rack.camPos.x;
      const camDy = sec.y - rack.camPos.y;
      const camDist = Math.hypot(camDx, camDy) || 1;
      const dotRight = (camDx * rightX + camDy * rightY) / camDist;
      const pan = clamp(dotRight * 0.92, -0.88, 0.88);

      weightedGainSum += sectionGain;
      panWeightedSum += pan * sectionGain;
      totalWeight += sectionGain;

      return {
        id: sec.id,
        gain: sectionGain,
        pan,
        brightness: clamp(1.18 - rackDist * 0.012, 0.72, 1.22),
      };
    });

    // Normalize overall rack cheer multiplier:
    // Corner racks (~10 ft from stands) ~ 1.26x, Wings ~ 0.94x, Top of Key (~33 ft from stands) ~ 0.66x
    const avgProximity = weightedGainSum / CROWD_SECTIONS.length;
    const cheerGain = clamp(0.45 + avgProximity * 0.85, 0.62, 1.38);
    const cheerPan = clamp(panWeightedSum / (totalWeight || 1), -0.68, 0.68);
    const brightnessHz = clamp(1520 - closestDist * 14, 960, 1460);

    return { cheerGain, cheerPan, brightnessHz, sections };
  }

  public setCrowdState(
    mode: 'TITLE' | 'ACTIVE' | 'PAUSED' | 'GAME_OVER',
    excitement = 0,
    rackIndex = this.currentRackIndex
  ): void {
    this.crowdExcitement = Math.max(0, Math.min(1, excitement));
    this.currentRackIndex = Math.max(0, Math.min(RACK_CONFIGS.length - 1, rackIndex));
    if (mode === 'ACTIVE') {
      this.crowdTargetGain = 0.044 + this.crowdExcitement * 0.056;
    } else if (mode === 'PAUSED') {
      this.crowdTargetGain = 0.012;
    } else if (mode === 'GAME_OVER') {
      this.crowdTargetGain = 0.032 + this.crowdExcitement * 0.025;
    } else {
      this.crowdTargetGain = 0.018;
    }
    this.updateCrowdStateGraph();
  }

  private updateCrowdStateGraph(): void {
    if (!this.ctx || !this.crowdMasterGain) return;
    const now = this.ctx.currentTime;
    const acoustics = this.getRackCrowdAcoustics(this.currentRackIndex);
    const positionalMaster = this.crowdTargetGain * (0.78 + acoustics.cheerGain * 0.28);
    const target = this.muted ? 0 : positionalMaster;

    this.crowdMasterGain.gain.cancelScheduledValues(now);
    this.crowdMasterGain.gain.setTargetAtTime(target, now, 0.18);

    // Smoothly steer ambient crowd sections across stereo field & proximity
    for (const secMix of acoustics.sections) {
      const ch = this.crowdChannels[secMix.id];
      if (!ch) continue;
      const baseAnchor = CROWD_SECTIONS.find((s) => s.id === secMix.id)!;
      ch.gain.gain.setTargetAtTime(clamp(secMix.gain * 0.48, 0.18, 0.85), now, 0.22);
      ch.filter.frequency.setTargetAtTime(
        baseAnchor.bandpassHz * secMix.brightness * (0.92 + this.crowdExcitement * 0.24),
        now,
        0.22
      );
      if (ch.panner) {
        ch.panner.pan.setTargetAtTime(secMix.pan, now, 0.24);
      }
    }
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx) {
      this.ensureCrowdAmbience(this.ctx);
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    this.unlock();
    return this.ctx;
  }

  private connectWithPan(ctx: AudioContext, node: AudioNode, pan: number): void {
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      node.connect(panner).connect(ctx.destination);
    } else {
      node.connect(ctx.destination);
    }
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const len = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private getCrowdLoopBuffer(ctx: AudioContext): AudioBuffer {
    if (this.crowdBuffer && this.crowdBuffer.sampleRate === ctx.sampleRate) {
      return this.crowdBuffer;
    }
    // 3.5-second seamless pink/brown murmur noise buffer with smooth loop crossfade
    const durationSec = 3.5;
    const len = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      b3 = 0.85 * b3 + white * 0.09;
      data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + b3) * 1.45));
    }

    // Crossfade last 0.15s into first 0.15s for zero-click looping
    const fadeLen = Math.min(Math.floor(ctx.sampleRate * 0.15), Math.floor(len / 4));
    for (let i = 0; i < fadeLen; i++) {
      const t = i / fadeLen;
      const tailIdx = len - fadeLen + i;
      const mixed = data[i] * t + data[tailIdx] * (1 - t);
      data[i] = mixed;
      data[tailIdx] = mixed;
    }

    this.crowdBuffer = buffer;
    return buffer;
  }

  private ensureCrowdAmbience(ctx: AudioContext): void {
    if (this.crowdSources.length > 0) {
      this.updateCrowdStateGraph();
      return;
    }

    const buffer = this.getCrowdLoopBuffer(ctx);
    const masterGain = ctx.createGain();
    masterGain.gain.value = this.muted ? 0 : this.crowdTargetGain;
    masterGain.connect(ctx.destination);

    // Slow organic crowd swell modulation across bowl stands
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.24;
    lfoGain.gain.value = 125;
    lfo.start();

    const offsets = [0, 1.15, 2.3];
    CROWD_SECTIONS.forEach((sec, idx) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const lowFilter = ctx.createBiquadFilter();
      lowFilter.type = 'lowpass';
      lowFilter.frequency.value = sec.lowpassHz;
      lowFilter.Q.value = 0.65;

      const midFilter = ctx.createBiquadFilter();
      midFilter.type = 'bandpass';
      midFilter.frequency.value = sec.bandpassHz;
      midFilter.Q.value = 0.92;
      lfo.connect(lfoGain).connect(midFilter.frequency);

      const midGain = ctx.createGain();
      midGain.gain.value = 0.56;

      const secGain = ctx.createGain();
      secGain.gain.value = 0.42;

      const panner =
        typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
      if (panner) {
        panner.pan.value = idx === 1 ? -0.65 : idx === 2 ? 0.65 : 0;
        secGain.connect(panner).connect(masterGain);
      } else {
        secGain.connect(masterGain);
      }

      src.connect(lowFilter).connect(secGain);
      src.connect(midFilter).connect(midGain).connect(secGain);
      src.start(0, offsets[idx] % buffer.duration);

      this.crowdSources.push(src);
      this.crowdChannels[sec.id] = { filter: midFilter, gain: secGain, panner };
    });

    this.crowdLfo = lfo;
    this.crowdMasterGain = masterGain;
    this.updateCrowdStateGraph();
  }

  public playCrowdCheer(
    streak: number,
    isMoney: boolean,
    rackIndex = this.currentRackIndex
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const acoustics = this.getRackCrowdAcoustics(rackIndex);
    // Streak magnitude scales smoothly from single make (0.22) -> 3+ (0.55) -> 6+ (0.82) -> 9+ (1.0)
    const streakFactor = clamp(0.16 + Math.pow(Math.min(streak, 10) / 10, 0.78) * 0.78, 0.16, 0.94);
    const strength = clamp(streakFactor + (isMoney ? 0.16 : 0), 0.18, 1.0);
    const positionalGainMult = acoustics.cheerGain;
    const cheerDuration = 0.62 + strength * 0.85;

    // 1. Primary localized stand cheer steered toward the closest / loudest rack crowd section
    const primarySrc = ctx.createBufferSource();
    primarySrc.buffer = this.getCrowdLoopBuffer(ctx);

    const primaryFilter = ctx.createBiquadFilter();
    primaryFilter.type = 'bandpass';
    const startFreq = 540 + (acoustics.brightnessHz - 960) * 0.3;
    const peakFreq = acoustics.brightnessHz + strength * 480;
    primaryFilter.frequency.setValueAtTime(startFreq, now);
    primaryFilter.frequency.exponentialRampToValueAtTime(peakFreq, now + 0.14);
    primaryFilter.frequency.exponentialRampToValueAtTime(640, now + cheerDuration);
    primaryFilter.Q.value = 0.82;

    const primaryGain = ctx.createGain();
    const peakAmp = (0.026 + strength * 0.095) * positionalGainMult;
    primaryGain.gain.setValueAtTime(0.001, now);
    primaryGain.gain.linearRampToValueAtTime(peakAmp, now + 0.08);
    primaryGain.gain.exponentialRampToValueAtTime(0.001, now + cheerDuration);

    primarySrc.connect(primaryFilter).connect(primaryGain);
    this.connectWithPan(ctx, primaryGain, acoustics.cheerPan);
    primarySrc.start(now, Math.random() * 1.5, cheerDuration + 0.1);

    // 2. Full-bowl low-mid stadium roar layer that erupts on streaks (3+) or money balls
    if (streak >= 3 || isMoney) {
      const bowlSrc = ctx.createBufferSource();
      bowlSrc.buffer = this.getCrowdLoopBuffer(ctx);

      const bowlFilter = ctx.createBiquadFilter();
      bowlFilter.type = 'lowpass';
      bowlFilter.frequency.setValueAtTime(340, now);
      bowlFilter.frequency.exponentialRampToValueAtTime(
        680 + strength * 320,
        now + 0.2
      );
      bowlFilter.frequency.exponentialRampToValueAtTime(320, now + cheerDuration + 0.22);
      bowlFilter.Q.value = 0.7;

      const bowlGain = ctx.createGain();
      const bowlPeak = (0.028 + strength * 0.068) * (0.7 + positionalGainMult * 0.3);
      bowlGain.gain.setValueAtTime(0.001, now);
      bowlGain.gain.linearRampToValueAtTime(bowlPeak, now + 0.13);
      bowlGain.gain.exponentialRampToValueAtTime(0.001, now + cheerDuration + 0.22);

      bowlSrc.connect(bowlFilter).connect(bowlGain);
      this.connectWithPan(ctx, bowlGain, acoustics.cheerPan * 0.35);
      bowlSrc.start(now, Math.random() * 1.5, cheerDuration + 0.3);
    }
  }

  public playCrowdGroan(rackIndex = this.currentRackIndex, lostStreak = 2): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const acoustics = this.getRackCrowdAcoustics(rackIndex);
    const streakWeight = clamp(0.75 + lostStreak * 0.08, 0.75, 1.35);

    const src = ctx.createBufferSource();
    src.buffer = this.getCrowdLoopBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(510, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + 0.52);
    filter.Q.value = 1.2;

    const gain = ctx.createGain();
    const peak = 0.044 * acoustics.cheerGain * streakWeight;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);

    src.connect(filter).connect(gain);
    this.connectWithPan(ctx, gain, acoustics.cheerPan * 0.75);
    src.start(now, Math.random() * 1.5, 0.68);
  }

  public playRecordStreakEruption(
    streak: number,
    rackIndex = this.currentRackIndex
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const acoustics = this.getRackCrowdAcoustics(rackIndex);
    const intensity = clamp(0.72 + Math.min(streak, 12) * 0.03, 0.72, 1.0);
    const duration = 1.85;

    // 1. Massive full-stadium roar wave
    const roarSrc = ctx.createBufferSource();
    roarSrc.buffer = this.getCrowdLoopBuffer(ctx);

    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'lowpass';
    roarFilter.frequency.setValueAtTime(340, now);
    roarFilter.frequency.exponentialRampToValueAtTime(1120, now + 0.22);
    roarFilter.frequency.exponentialRampToValueAtTime(420, now + duration);
    roarFilter.Q.value = 0.75;

    const roarGain = ctx.createGain();
    roarGain.gain.setValueAtTime(0.001, now);
    roarGain.gain.linearRampToValueAtTime(0.115 * intensity, now + 0.12);
    roarGain.gain.setValueAtTime(0.095 * intensity, now + 0.65);
    roarGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    roarSrc.connect(roarFilter).connect(roarGain);
    this.connectWithPan(ctx, roarGain, acoustics.cheerPan * 0.25);
    roarSrc.start(now, Math.random() * 1.2, duration + 0.15);

    // 2. High-energy arena upper-deck cheer & applause crest
    const crestSrc = ctx.createBufferSource();
    crestSrc.buffer = this.getCrowdLoopBuffer(ctx);

    const crestFilter = ctx.createBiquadFilter();
    crestFilter.type = 'bandpass';
    crestFilter.frequency.setValueAtTime(920, now);
    crestFilter.frequency.exponentialRampToValueAtTime(1950, now + 0.24);
    crestFilter.frequency.exponentialRampToValueAtTime(950, now + duration);
    crestFilter.Q.value = 0.85;

    const crestGain = ctx.createGain();
    crestGain.gain.setValueAtTime(0.001, now);
    crestGain.gain.linearRampToValueAtTime(0.092 * acoustics.cheerGain * intensity, now + 0.09);
    crestGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.92);

    crestSrc.connect(crestFilter).connect(crestGain);
    this.connectWithPan(ctx, crestGain, acoustics.cheerPan * 0.7);
    crestSrc.start(now, Math.random() * 1.2, duration + 0.1);

    // 3. Crisp stadium hype organ / brass flourish
    const notes = [349.23, 440.0, 523.25, 698.46]; // F4 - A4 - C5 - F5
    notes.forEach((freq, idx) => {
      const t0 = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, t0);

      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(0.026, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.48);

      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.5);
    });
  }

  public playGather(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Subtle hardwood sneaker chirp + soft ball palm thump
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(72, now + 0.06);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playRelease(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(1350, now + 0.11);
    filter.Q.value = 1.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.14);
  }

  public playSwish(
    isMoney: boolean,
    streak: number,
    isPerfect: boolean,
    rackIndex = this.currentRackIndex
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Nylon net swish (filtered noise burst)
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isPerfect ? 2600 : 2000, now);
    filter.frequency.exponentialRampToValueAtTime(900, now + 0.22);
    filter.Q.value = 1.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(isPerfect ? 0.24 : 0.17, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.26);

    // Ascending streak chime / money ball harmonic
    const baseFreq = isMoney ? 659.25 : 523.25;
    const semitoneBoost = Math.min(streak, 10) * 0.5;
    const pitchMult = Math.pow(2, semitoneBoost / 12);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = isMoney ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(baseFreq * pitchMult, now + 0.02);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * pitchMult * 1.25, now + 0.16);
    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.linearRampToValueAtTime(isMoney ? 0.14 : 0.09, now + 0.025);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(oscGain).connect(ctx.destination);
    osc.start(now + 0.01);
    osc.stop(now + 0.3);

    if (isMoney) {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77 * pitchMult, now + 0.05);
      gain2.gain.setValueAtTime(0.001, now + 0.05);
      gain2.gain.linearRampToValueAtTime(0.1, now + 0.07);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc2.connect(gain2).connect(ctx.destination);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.35);
    }

    // Positional arena crowd cheer scaled by rack position & streak magnitude
    this.playCrowdCheer(streak, isMoney, rackIndex);
  }

  public playRimClank(intensity = 1): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = Math.min(0.2, 0.11 * intensity);

    const freqs = [245, 392, 620];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f + Math.random() * 14, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.92, now + 0.16);
      gain.gain.setValueAtTime(vol / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    });
  }

  public playBackboard(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.09);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playDifficultyUp(level: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = level >= 4 ? [587.33, 739.99, 880] : [523.25, 659.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.001, now + i * 0.06);
      gain.gain.linearRampToValueAtTime(0.11, now + i * 0.06 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.24);
    });
  }

  public playTick(urgent: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(urgent ? 980 : 760, now);
    gain.gain.setValueAtTime(urgent ? 0.055 : 0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playWhistle(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2680, now);

    lfo.frequency.setValueAtTime(38, now);
    lfoGain.gain.setValueAtTime(85, now);
    lfo.connect(lfoGain).connect(osc.frequency);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.03);
    gain.gain.setValueAtTime(0.09, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    osc.connect(gain).connect(ctx.destination);
    lfo.start(now);
    osc.start(now);
    lfo.stop(now + 0.35);
    osc.stop(now + 0.35);
  }

  public playBuzzer(rackIndex = this.currentRackIndex, streak = 5): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [116.54, 155.56, 233.08].forEach((freq) => {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(820, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.03);
      gain.gain.setValueAtTime(0.085, now + 0.65);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.98);
    });

    this.playCrowdCheer(Math.max(5, streak), true, rackIndex);
  }
}

export const soundEngine = new SoundEngine();
