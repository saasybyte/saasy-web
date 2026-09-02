import { v4 as uuidv4 } from "uuid";
import { logger } from "@/utils";
import { WEBSOCKET_CONFIG } from "../configs/websocket";
import type {
  WebSocketPendingRequest,
  WebSocketRequestEnvelope,
  WebSocketRequestEnvelopeData,
  WebSocketRequestEnvelopeType,
  WebSocketResponseEnvelope,
  WebSocketServiceConfig,
  WebSocketServiceConfigWithDefaults,
  WebSocketServiceEvents,
} from "../types/websocket";
import {
  WebSocketEventProto,
  WebSocketRequestEnvelopeProto,
  WebSocketResponseEnvelopeProto,
} from "../types/websocket";

export class WebSocketService {
  private config: WebSocketServiceConfigWithDefaults;
  private events: WebSocketServiceEvents;
  private socket: WebSocket | null = null;
  private requestTimeout: number = 10000; // 10 seconds timeout
  private connectionInProgress: boolean = false;
  private reconnectAttempt: number = 0;
  private reconnectTimeout: number | null = null;
  private connected: boolean = false;
  private disposed: boolean = false;
  private messageQueue: Array<Uint8Array> = [];
  private pendingRequests: Map<string, WebSocketPendingRequest> = new Map();

  constructor(config: WebSocketServiceConfig = {}, events: WebSocketServiceEvents = {}) {
    this.config = {
      ...WEBSOCKET_CONFIG,
      ...config,
    };
    this.events = events;

    if (!this.config.url || !this.config.url.startsWith("ws")) {
      throw new Error("WebSocket URL is required");
    }
  }

  public isConnected(): boolean {
    return this.connected && this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  public async connect(): Promise<void> {
    if (this.disposed) {
      return Promise.reject<void>(new Error("WebSocket service is disposed"));
    }
    if (this.connectionInProgress) {
      return Promise.reject<void>(new Error("Connection already in progress"));
    }
    this.connectionInProgress = true;

    return new Promise<void>((resolve, reject) => {
      if (this.socket) {
        if (this.isConnected()) {
          return resolve();
        }
        this.disconnect();
      }

      const timeout = window.setTimeout(() => {
        if (!this.isConnected()) {
          const err = new Error(`WebSocket timeout after ${this.config.connectionTimeout}ms`);
          this.handleError(err);
          reject(err);
        }
      }, this.config.connectionTimeout);

      this.socket = new WebSocket(this.config.url);
      this.socket.binaryType = "arraybuffer";

      this.socket.onopen = this.handleSocketOpen(resolve, timeout);
      this.socket.onmessage = this.handleSocketMessage();
      this.socket.onclose = this.handleSocketClose(reject, timeout);
      this.socket.onerror = this.handleSocketError(reject);
    }).finally(() => {
      this.connectionInProgress = false;
    });
  }

  public disconnect(): void {
    if (this.reconnectTimeout !== null) {
      window.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error("WebSocket disconnected"));
    });
    this.pendingRequests.clear();

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;

      if (
        this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING
      ) {
        this.socket.close();
      }

      this.socket = null;
    }

    this.connected = false;
    this.connectionInProgress = false;
    this.reconnectAttempt = 0;
  }

  public dispose(): void {
    this.disposed = true;
    this.disconnect();
    this.messageQueue = [];
  }

  public sendRequest(
    type: WebSocketRequestEnvelopeType,
    sessionId: string,
    participantId: string,
    data: WebSocketRequestEnvelopeData,
  ): Promise<WebSocketResponseEnvelope> {
    return new Promise((resolve, reject) => {
      const requestId = uuidv4();

      const sent = this.send({
        type,
        requestId,
        sessionId,
        participantId,
        ...data,
      });

      if (!sent) {
        return reject(new Error(`Failed to send ${type} request`));
      }

      const timeout = window.setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request ${type} timed out after ${this.requestTimeout}ms`));
        }
      }, this.requestTimeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });
    });
  }

  private send(envelope: WebSocketRequestEnvelope): boolean {
    const message = WebSocketRequestEnvelopeProto.create(envelope);
    const buffer = WebSocketRequestEnvelopeProto.encode(message).finish();

    if (this.socket && this.isConnected()) {
      try {
        this.socket.send(buffer);
        return true;
      } catch (error) {
        this.handleError(new Error(`Failed to send WebSocket message: ${error}`));
        return false;
      }
    } else {
      // Queue message for when connection is established
      if (this.messageQueue.length >= this.config.maxQueueSize) {
        this.handleError(new Error("Message queue overflow, dropping oldest message"));
        this.messageQueue.shift();
      }
      this.messageQueue.push(buffer);

      if (!this.socket) {
        this.connect().catch(() => {
          // Connection error handled by connect method
        });
      }

      return false;
    }
  }

  private handleSocketOpen(resolve: () => void, timeout: number): (event: Event) => void {
    return (event) => {
      this.connected = true;
      this.connectionInProgress = false;
      this.reconnectAttempt = 0;
      window.clearTimeout(timeout);
      this.flushQueue();
      this.events.onOpen?.(event);
      resolve();
    };
  }

  private handleSocketMessage(): (event: MessageEvent<ArrayBuffer>) => void {
    return (event: MessageEvent<ArrayBuffer>) => {
      const buf = new Uint8Array(event.data);

      try {
        const evt = WebSocketEventProto.decode(buf);
        logger.log("Decoded as SfuEvent", evt);
        this.events.onEvent?.(evt);
        return;
      } catch {
        // Not an SfuEvent, continue to try as response
      }

      try {
        const envelope = WebSocketResponseEnvelopeProto.decode(buf);
        logger.log("Decoded as ClientResponseEnvelope", envelope);

        if (envelope.requestId) {
          this.dispatchMessage(envelope);
        } else {
          logger.warn("Received response without requestId", envelope);
        }
      } catch (err) {
        this.handleError(new Error(`Failed to decode WebSocket message: ${err}`));
      }
    };
  }

  private handleSocketClose(
    reject: (err: Error) => void,
    timeout: number,
  ): (event: CloseEvent) => void {
    return (event) => {
      this.connected = false;
      this.connectionInProgress = false;
      window.clearTimeout(timeout);
      this.events.onClose?.(event);

      this.pendingRequests.forEach(({ reject, timeout }) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket closed: ${event.code} ${event.reason}`));
      });
      this.pendingRequests.clear();

      if (event.code === 1000) {
        // Normal closure, no need to reject or reconnect
        logger.log("WebSocket closed normally");
      } else if (event.code >= 1001 && event.code <= 1015) {
        // Protocol-level issues, attempt reconnect
        this.attemptReconnect();
        reject(new Error(`WebSocket protocol error: ${event.code} ${event.reason}`));
      } else {
        // Abnormal closure or custom codes
        this.attemptReconnect();
        reject(new Error(`WebSocket closed unexpectedly: ${event.code} ${event.reason}`));
      }
    };
  }

  private handleSocketError(reject: (err: Error) => void): (event: Event) => void {
    return (event) => {
      const errorInfo = event instanceof ErrorEvent ? event.message : "Unknown error";
      const err = new Error(`WebSocket error: ${errorInfo}`);
      this.handleError(err);
      if (!this.isConnected()) {
        this.connectionInProgress = false;
        reject(err);
      }
    };
  }

  private flushQueue(): void {
    if (!this.isConnected()) return;

    const messagesToProcess = Math.min(this.messageQueue.length, this.config.maxBatchSize);

    for (let i = 0; i < messagesToProcess; i++) {
      const message = this.messageQueue.shift();
      if (!message) continue;

      try {
        this.socket!.send(message);
      } catch (error) {
        this.handleError(new Error(`Failed to send queued message: ${error}`));
      }
    }

    if (this.messageQueue.length > 0) {
      setTimeout(() => this.flushQueue(), 0);
    }
  }

  private dispatchMessage(envelope: WebSocketResponseEnvelope): void {
    const requestId = envelope.requestId;
    if (!requestId) return;

    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    this.pendingRequests.delete(requestId);
    clearTimeout(pending.timeout);

    if (envelope.type === "error") {
      const errorMessage = envelope.errorResponse?.message || "Unknown error";
      pending.reject(new Error(errorMessage));
    } else {
      pending.resolve(envelope);
    }
  }

  private attemptReconnect(): void {
    if (this.disposed) return;

    if (this.reconnectAttempt >= (this.config.reconnectAttempts || 0)) {
      if (this.reconnectAttempt === (this.config.reconnectAttempts || 0)) {
        this.events.onReconnectFailed?.();
        logger.warn(`WebSocket reconnection failed after ${this.reconnectAttempt} attempts`);
      }
      return;
    }

    if (this.reconnectTimeout !== null) {
      return;
    }

    this.reconnectAttempt++;
    const delay = this.calculateReconnectDelay();
    this.events.onReconnect?.(this.reconnectAttempt, delay);

    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;

      this.connect().catch(() => {
        setTimeout(() => this.attemptReconnect(), 0);
      });
    }, delay);
  }

  private calculateReconnectDelay(): number {
    // Exponential backoff: delay doubles with each attempt
    const exponentialDelay = Math.min(
      this.config.maxReconnectInterval,
      this.config.reconnectInterval * Math.pow(2, this.reconnectAttempt - 1),
    );

    // Add random jitter (±20%) to prevent synchronized reconnection attempts
    const jitter = 0.8 + Math.random() * 0.4;

    return Math.floor(exponentialDelay * jitter);
  }

  private handleError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("WebSocketService error:", error);
    this.events.onError?.(error);
  }
}

export default WebSocketService;
