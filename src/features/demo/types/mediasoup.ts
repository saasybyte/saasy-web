import { types } from "mediasoup-client";

export interface TransportConnectParams {
  transportId: string;
  dtlsParameters: types.DtlsParameters;
  callback: () => void;
  errback: (error: Error) => void;
}

export interface TransportProduceParams {
  transportId: string;
  kind: types.MediaKind;
  rtpParameters: types.RtpParameters;
  appData: types.AppData;
  callback: (params: { id: string }) => void;
  errback: (error: Error) => void;
}

export type MediaConstraints = {
  audio?: boolean | MediaTrackConstraints;
  video?: boolean | MediaTrackConstraints;
};

// Configuration interface
export interface MediaSoupServiceConfig {
  mediaConstraints?: MediaConstraints;
}

// Combined events interface
export interface MediaSoupServiceEvents {
  // Error handling
  onError?: (error: Error) => void;

  // MediaSoup lifecycle events
  onInitialized?: () => void;
  onDispose?: () => void;

  // Transport events
  onTransportConnect?: (params: TransportConnectParams) => void | Promise<void>;
  onTransportProduce?: (params: TransportProduceParams) => void | Promise<void>;
  onTransportClosed?: (transportId: string) => void;

  // Producer events
  onProducerClosed?: (producerId: string) => void;
  onProducerTrackEnded?: (producerId: string) => void;

  // Consumer events
  onConsumerClosed?: (consumerId: string) => void;
  onConsumerTrackEnded?: (consumerId: string) => void;

  // Media stream events
  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onTrack?: (track: MediaStreamTrack, stream: MediaStream) => void;

  // Connection state events
  // Note: MediaSoup only provides connectionstatechange, not separate ICE state
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}
