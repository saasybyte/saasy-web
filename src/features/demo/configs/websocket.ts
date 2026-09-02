import { WebSocketServiceConfigWithDefaults } from "../types/websocket";

export const WEBSOCKET_CONFIG: WebSocketServiceConfigWithDefaults = {
  url: import.meta.env.VITE_SIGNAL_URL || "",
  reconnectAttempts: 5,
  reconnectInterval: 1000, // in ms
  maxReconnectInterval: 30000, // in ms
  connectionTimeout: 10000, // in ms
  maxQueueSize: 100,
  maxBatchSize: 20,
};
