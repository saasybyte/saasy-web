import type {
  ISignalRequestEnvelope,
  ISignalResponseEnvelope,
  ISfuEvent,
} from "@saasybyte/saasy-proto-ts";
import { SignalRequestEnvelope, SignalResponseEnvelope, SfuEvent } from "@saasybyte/saasy-proto-ts";

// ========================================================================
// DO NOT RENAME OR CHANGE THESE STRINGS.
// These request types MUST remain consistent with the `type` field used in
// WebSocket envelopes on both the Signal and SFU services.
// ========================================================================
export type WebSocketRequestEnvelopeType =
  | "register_session"
  | "join_session"
  | "get_router_rtp_capabilities"
  | "set_rtp_capabilities"
  | "create_transport"
  | "connect_transport"
  | "create_producer"
  | "create_consumer"
  | "resume_consumer"
  | "close_session"
  | "subscribe_to_events"
  | "error";

export type WebSocketRequestEnvelope = ISignalRequestEnvelope;
export const WebSocketRequestEnvelopeProto = SignalRequestEnvelope;
export type WebSocketRequestEnvelopeData = Omit<
  ISignalRequestEnvelope,
  "type" | "requestId" | "sessionId" | "participantId"
>;

export type WebSocketResponseEnvelope = ISignalResponseEnvelope;
export const WebSocketResponseEnvelopeProto = SignalResponseEnvelope;

export type WebSocketPendingRequest = {
  resolve: (data: WebSocketResponseEnvelope) => void;
  reject: (error: Error) => void;
  timeout: number;
};

export type WebSocketEvent = ISfuEvent;
export const WebSocketEventProto = SfuEvent;

export interface WebSocketServiceConfig {
  url?: string;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  connectionTimeout?: number;
  maxQueueSize?: number;
  maxBatchSize?: number;
}
export type WebSocketServiceConfigWithDefaults = Required<WebSocketServiceConfig>;

export interface WebSocketServiceEvents {
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Error) => void;
  onReconnect?: (attempt: number, delay: number) => void;
  onReconnectFailed?: () => void;
  onEvent?: (event: WebSocketEvent) => void;
}
