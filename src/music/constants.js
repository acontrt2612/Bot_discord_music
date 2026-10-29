export const LoopMode = Object.freeze({ OFF: 'off', TRACK: 'track', QUEUE: 'queue' });

export const LoopLabels = {
  [LoopMode.OFF]: 'Tắt',
  [LoopMode.TRACK]: 'Bài hiện tại',
  [LoopMode.QUEUE]: 'Cả hàng đợi',
};

/**
 * ffmpeg audio filters. `speed` is how fast the source plays back, used to keep
 * the playback position in sync with the original track.
 */
export const Filters = {
  off: { label: 'Tắt', af: null },
  bassboost: { label: 'Bass Boost', af: 'bass=g=12' },
  nightcore: { label: 'Nightcore', af: 'aresample=48000,asetrate=60000,aresample=48000', speed: 1.25 },
  vaporwave: { label: 'Vaporwave', af: 'aresample=48000,asetrate=38400,aresample=48000', speed: 0.8 },
  slowedreverb: {
    label: 'Slowed + Reverb',
    af: 'aresample=48000,asetrate=40800,aresample=48000,aecho=0.8:0.88:60:0.4',
    speed: 0.85,
  },
  '8d': { label: '8D Audio', af: 'apulsator=hz=0.08' },
  karaoke: { label: 'Karaoke (giảm giọng hát)', af: 'pan=stereo|c0=c0-c1|c1=c1-c0' },
  speedup: { label: 'Tăng tốc 1.25x', af: 'atempo=1.25', speed: 1.25 },
  treble: { label: 'Treble Boost', af: 'treble=g=6' },
};

export const SEEK_STEP = 10;
export const VOLUME_STEP = 10;
export const MAX_VOLUME = 150;
