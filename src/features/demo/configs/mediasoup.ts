import { MediaSoupServiceConfig } from "../types/mediasoup";

export const MEDIASOUP_CONFIG: MediaSoupServiceConfig = {
  mediaConstraints: {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
    video: false, // Default to audio-only
  },
};
