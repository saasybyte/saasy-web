import { types } from "mediasoup-client";
import type { IConsumerInfo } from "@saasybyte/saasy-proto-ts";
import type { MediaSoupServiceConfig } from "./mediasoup";
import type { WebSocketServiceConfig } from "./websocket";

export interface AssistantServiceConfig {
  assistant: {
    autoStartLocalMedia: boolean;
  };
  mediasoup?: MediaSoupServiceConfig;
  websocket?: WebSocketServiceConfig;
}

export interface AssistantServiceEvents {
  onError?: (error: Error) => void;
  onLocalMediaFailure?: () => void;
  onUsageStatus?: (remainingSeconds: number, budgetExhausted: boolean) => void;
  onSessionEnded?: (reason: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onConnectionFailed?: () => void;
  onConnectionStateChanged?: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChanged?: (state: RTCIceConnectionState) => void;
  onLocalStream?: (stream: MediaStream) => void;
  onLocalStreamStopped?: () => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onRemoteTrackAdded?: (consumerInfo: IConsumerInfo) => void;
  onRemoteTrackRemoved?: (producerId: string) => void;
  onProducingStarted?: () => void;
  onProducingStopped?: () => void;
  onSubscriptionConfirmed?: () => void;
}

export interface AssistantServiceState {
  sessionId: string | null;
  participantId: string | null;

  // Transport information
  sendTransportId: string | null;
  recvTransportId: string | null;
  iceParameters: types.IceParameters | null;
  iceCandidates: types.IceCandidate[];
  dtlsParameters: types.DtlsParameters | null;

  // ICE servers from Signal
  iceServers: RTCIceServer[];

  // Connection states
  connected: boolean;
  connectionInProgress: boolean;

  // Media states
  localStreamStarted: boolean;
  sendTransportConnected: boolean;
  recvTransportConnected: boolean;

  // Device capabilities
  rtpCapabilities: types.RtpCapabilities | null;
}

export interface ProviderConfig {
  provider: string;
  modelId: string;
}

export interface ConnectOptions {
  authToken?: string;
  sessionId?: string;
  providers?: {
    llm: ProviderConfig;
    tts: ProviderConfig;
    stt: ProviderConfig;
  };
}
