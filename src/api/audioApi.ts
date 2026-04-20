import type { Kernel } from '../kernel/Kernel';
import type { OscillatorWaveType } from '../audio/AudioManager';
import { Permissions } from '../kernel/constants';

const VALID_WAVE_TYPES: readonly string[] = ['sine', 'square', 'sawtooth', 'triangle'];

export function registerAudioApi(kernel: Kernel): void {
  const runtimeRegistry = kernel.resolve('runtimeRegistry');
  const permissions = kernel.resolve('permissions');
  const audioManager = kernel.resolve('audioManager');

  runtimeRegistry.registerApi('audioApi', ({ process }) => {
    const appId = process.processAppId;

    return {
      /**
       * 播放指定 URL 的音訊檔案（例如 .mp3、.wav、.ogg）。
       * @param src     音訊來源 URL
       * @param options { volume?: number (0–1), loop?: boolean }
       * @returns       { success, data: soundId }
       */
      play: (src: unknown, options?: Record<string, unknown>) => {
        if (!permissions.has(appId, Permissions.AUDIO_PLAY)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (typeof src !== 'string' || !src) {
          return { success: false, error: 'InvalidSource' };
        }
        return audioManager.play(appId, src, {
          volume: typeof options?.volume === 'number' ? options.volume : undefined,
          loop: typeof options?.loop === 'boolean' ? options.loop : undefined,
        });
      },

      /**
       * 以 Web Audio API 合成並播放純音。
       * @param frequency  頻率（Hz），建議範圍 20–20000
       * @param duration   持續時間（ms），需為正數
       * @param options    { wave?: 'sine'|'square'|'sawtooth'|'triangle', volume?: number (0–1) }
       * @returns          { success, data: soundId }
       */
      playTone: (frequency: unknown, duration: unknown, options?: Record<string, unknown>) => {
        if (!permissions.has(appId, Permissions.AUDIO_PLAY)) {
          return { success: false, error: 'PermissionDenied' };
        }
        const freq = Number(frequency);
        const dur = Number(duration);
        if (!Number.isFinite(freq) || !Number.isFinite(dur) || dur <= 0) {
          return { success: false, error: 'InvalidParams' };
        }
        const wave = (typeof options?.wave === 'string' && VALID_WAVE_TYPES.includes(options.wave))
          ? (options.wave as OscillatorWaveType)
          : 'sine';
        const volume = typeof options?.volume === 'number' ? options.volume : 0.5;
        return audioManager.playTone(appId, freq, dur, wave, volume);
      },

      /**
       * 停止指定音訊。
       * @param id  play() 或 playTone() 回傳的 soundId
       */
      stop: (id: unknown) => {
        if (!permissions.has(appId, Permissions.AUDIO_PLAY)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (typeof id !== 'string') {
          return { success: false, error: 'InvalidParams' };
        }
        return audioManager.stop(appId, id);
      },

      /**
       * 停止此 App 所有正在播放的音訊。
       */
      stopAll: () => {
        if (!permissions.has(appId, Permissions.AUDIO_PLAY)) {
          return { success: false, error: 'PermissionDenied' };
        }
        audioManager.stopAll(appId);
        return { success: true };
      },

      /**
       * 設定此 App 的音量（0–1）。
       * @param volume 0 = 靜音，1 = 最大
       */
      setVolume: (volume: unknown) => {
        if (!permissions.has(appId, Permissions.AUDIO_PLAY)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (typeof volume !== 'number' || !Number.isFinite(volume)) {
          return { success: false, error: 'InvalidParams' };
        }
        return audioManager.setVolume(appId, volume);
      },
    };
  }, [Permissions.AUDIO_PLAY], 'audio');
}
