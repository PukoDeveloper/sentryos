// ── AudioManager ──────────────────────────────────────────────
// 管理全系統的音訊播放。
// - HTMLAudioElement 播放 URL 音訊（系統音效、App 音效）
// - Web Audio API OscillatorNode 合成純音（嗶聲、提示音）
// - 以 processAppId 為單位追蹤與釋放音訊資源
// - 程序終止時呼叫 stopAll(processAppId) 自動清理

export type OscillatorWaveType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export type AudioError =
  | 'PermissionDenied'
  | 'InvalidSource'
  | 'InvalidParams'
  | 'AudioContextError'
  | 'NotFound';

export interface AudioResult {
  success: boolean;
  data?: string;
  error?: AudioError;
}

interface ElementEntry {
  id: string;
  kind: 'element';
  element: HTMLAudioElement;
}

interface OscillatorEntry {
  id: string;
  kind: 'oscillator';
  oscillator: OscillatorNode;
  gainNode: GainNode;
}

type SoundEntry = ElementEntry | OscillatorEntry;

class AudioManager {
  private audioContext: AudioContext | null = null;
  /** processAppId → Map<soundId, SoundEntry> */
  private readonly sounds = new Map<string, Map<string, SoundEntry>>();
  /** processAppId → volume multiplier (0–1) */
  private readonly volumes = new Map<string, number>();
  private nextId = 1;

  // ── AudioContext ────────────────────────────────────────────

  private getContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => { /* 忽略 */ });
    }
    return this.audioContext;
  }

  private genId(): string {
    return `snd_${Date.now()}_${this.nextId++}`;
  }

  private appVolume(appId: string): number {
    return this.volumes.get(appId) ?? 1.0;
  }

  private register(appId: string, entry: SoundEntry): void {
    if (!this.sounds.has(appId)) this.sounds.set(appId, new Map());
    this.sounds.get(appId)!.set(entry.id, entry);
  }

  private unregister(appId: string, id: string): void {
    this.sounds.get(appId)?.delete(id);
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * 播放指定 URL 的音訊。
   * @returns 成功時 data 為 soundId，可用於 stop()
   */
  play(
    appId: string,
    src: string,
    options?: { volume?: number; loop?: boolean },
  ): AudioResult {
    if (!src || typeof src !== 'string') {
      return { success: false, error: 'InvalidSource' };
    }

    const id = this.genId();
    const appVol = this.appVolume(appId);
    const vol = typeof options?.volume === 'number'
      ? Math.max(0, Math.min(1, options.volume))
      : 1;

    const audio = new Audio(src);
    audio.volume = vol * appVol;
    audio.loop = options?.loop ?? false;
    audio.play().catch(() => { /* 自動播放政策可能拒絕，忽略 */ });

    const entry: ElementEntry = { id, kind: 'element', element: audio };
    this.register(appId, entry);

    audio.addEventListener('ended', () => this.unregister(appId, id), { once: true });
    audio.addEventListener('error', () => this.unregister(appId, id), { once: true });

    return { success: true, data: id };
  }

  /**
   * 以 Web Audio API 合成並播放純音。
   * @param frequency  頻率（Hz），範圍 20–20000
   * @param duration   持續時間（ms）
   * @param wave       波形類型（預設 'sine'）
   * @param volume     音量（0–1，預設 0.5）
   * @returns 成功時 data 為 soundId
   */
  playTone(
    appId: string,
    frequency: number,
    duration: number,
    wave: OscillatorWaveType = 'sine',
    volume: number = 0.5,
  ): AudioResult {
    if (!Number.isFinite(frequency) || !Number.isFinite(duration) || duration <= 0) {
      return { success: false, error: 'InvalidParams' };
    }

    let ctx: AudioContext;
    try {
      ctx = this.getContext();
    } catch {
      return { success: false, error: 'AudioContextError' };
    }

    const id = this.genId();
    const appVol = this.appVolume(appId);
    const clampedVol = Math.max(0, Math.min(1, volume)) * appVol;
    const clampedFreq = Math.max(20, Math.min(20000, frequency));
    const durationSec = duration / 1000;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(clampedFreq, ctx.currentTime);

    gainNode.gain.setValueAtTime(clampedVol, ctx.currentTime);
    // 在結束前淡出，避免爆音（click）
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      ctx.currentTime + durationSec,
    );

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + durationSec);

    const entry: OscillatorEntry = { id, kind: 'oscillator', oscillator, gainNode };
    this.register(appId, entry);

    oscillator.onended = () => {
      gainNode.disconnect();
      this.unregister(appId, id);
    };

    return { success: true, data: id };
  }

  /** 停止指定音訊 */
  stop(appId: string, id: string): AudioResult {
    const entry = this.sounds.get(appId)?.get(id);
    if (!entry) return { success: false, error: 'NotFound' };
    this.stopEntry(entry);
    this.unregister(appId, id);
    return { success: true };
  }

  /** 停止此 App 的所有音訊（程序終止時呼叫） */
  stopAll(appId: string): void {
    const appSounds = this.sounds.get(appId);
    if (!appSounds) return;
    for (const entry of appSounds.values()) {
      this.stopEntry(entry);
    }
    this.sounds.delete(appId);
    this.volumes.delete(appId);
  }

  /**
   * 設定此 App 的音量（0–1）。
   * 立即更新所有正在播放的 HTMLAudioElement 音量。
   * OscillatorNode 不在此調整（已排定淡出曲線）。
   */
  setVolume(appId: string, volume: number): AudioResult {
    const v = Math.max(0, Math.min(1, volume));
    this.volumes.set(appId, v);

    const appSounds = this.sounds.get(appId);
    if (appSounds) {
      for (const entry of appSounds.values()) {
        if (entry.kind === 'element') {
          entry.element.volume = v;
        }
      }
    }

    return { success: true };
  }

  /** 取得此 App 目前正在播放的音訊數量 */
  getActiveSoundCount(appId: string): number {
    return this.sounds.get(appId)?.size ?? 0;
  }

  // ── 內部工具 ────────────────────────────────────────────────

  private stopEntry(entry: SoundEntry): void {
    if (entry.kind === 'element') {
      entry.element.pause();
      entry.element.src = '';
    } else {
      try {
        entry.oscillator.stop();
      } catch { /* 可能已自然結束 */ }
      try {
        entry.gainNode.disconnect();
      } catch { /* 同上 */ }
    }
  }
}

export { AudioManager };
