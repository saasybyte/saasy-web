import { v4 as uuidv4 } from "uuid";
import {
  mediasoupToProtoDtlsParameters,
  mediasoupToProtoMediaKind,
  mediasoupToProtoRtpCapabilities,
  mediasoupToProtoRtpParameters,
  protoToMediasoupMediaKind,
  protoToMediasoupRtpCapabilities,
  protoToMediasoupRtpParameters,
  protoToMediasoupTransportOptions,
  protoToStringSessionEndReason,
} from "@saasybyte/saasy-proto-ts";
import { logger } from "@/utils";
import { ASSISTANT_CONFIG } from "../configs/assistant";
import { ParticipantType, TransportDirection } from "@saasybyte/saasy-proto-ts";
import {
  AssistantServiceConfig,
  AssistantServiceEvents,
  AssistantServiceState,
  ConnectOptions,
} from "../types/assistant";
import {
  MediaConstraints,
  TransportConnectParams,
  TransportProduceParams,
} from "../types/mediasoup";
import { WebSocketEvent } from "../types/websocket";
import { MediaSoupService } from "./mediasoup";
import { WebSocketService } from "./websocket";

export class AssistantService {
  private webSocketService: WebSocketService;
  private mediaSoupService: MediaSoupService;
  private config: AssistantServiceConfig;
  private events: AssistantServiceEvents;
  private state: AssistantServiceState;
  private pendingConsumerProducerId: string | null = null;
  private isProducing = false;

  constructor(config: AssistantServiceConfig, events: AssistantServiceEvents = {}) {
    this.config = {
      ...ASSISTANT_CONFIG,
      ...config,
    };
    this.events = events;
    this.state = {
      sessionId: null,
      participantId: null,
      sendTransportId: null,
      recvTransportId: null,
      iceCandidates: [],
      iceParameters: null,
      dtlsParameters: null,
      iceServers: [],
      connected: false,
      connectionInProgress: false,
      localStreamStarted: false,
      sendTransportConnected: false,
      recvTransportConnected: false,
      rtpCapabilities: null,
    };

    this.webSocketService = new WebSocketService(this.config.websocket ?? {}, {
      onOpen: this.handleWebSocketOpen.bind(this),
      onClose: this.handleWebSocketClose.bind(this),
      onError: this.handleError.bind(this),
      onReconnectFailed: this.handleWebSocketReconnectFailed.bind(this),
      onEvent: this.handleWebSocketSfuEvent.bind(this),
      // onReconnect???
    });

    this.mediaSoupService = new MediaSoupService(
      {
        mediaConstraints: this.config.mediasoup?.mediaConstraints,
      },
      {
        onError: this.handleError.bind(this),
        onInitialized: this.handleMediaSoupInitialized.bind(this),
        onDispose: this.handleMediaSoupDispose.bind(this),
        onTransportConnect: this.handleMediaSoupTransportConnect.bind(this),
        onTransportProduce: this.handleMediaSoupTransportProduce.bind(this),
        onTransportClosed: this.handleMediaSoupTransportClosed.bind(this),
        onProducerClosed: this.handleMediaSoupProducerClosed.bind(this),
        onProducerTrackEnded: this.handleMediaSoupProducerTrackEnded.bind(this),
        onConsumerClosed: this.handleMediaSoupConsumerClosed.bind(this),
        onConsumerTrackEnded: this.handleMediaSoupConsumerTrackEnded.bind(this),
        onLocalStream: this.handleLocalStream.bind(this),
        onRemoteStream: this.handleRemoteStream.bind(this),
        onConnectionStateChange: this.handleConnectionStateChange.bind(this),
        // onTrack???
      },
    );
  }

  public async connect(options?: ConnectOptions): Promise<boolean> {
    logger.log(`AssistantService.connect() called with options:`, options);
    if (this.state.connected || this.state.connectionInProgress) {
      logger.log("Already connected or connecting, returning early");
      return this.state.connected;
    }

    this.state.connectionInProgress = true;

    try {
      await this.establishSignalingConnection();
      await this.joinOrRegisterSession(options);
      await this.setupRtpCapabilities();
      await this.subscribeToSfuEvents();

      // Connection is now fully established
      this.state.connected = true;
      this.state.connectionInProgress = false;

      // Notify client
      this.events.onConnected?.();

      // Start local media if requested in config
      if (this.config.assistant.autoStartLocalMedia) {
        await this.startLocalMediaStream();
      }

      return true;
    } catch (error) {
      this.handleError(error);
      this.cleanup();
      return false;
    } finally {
      this.state.connectionInProgress = false;
    }
  }

  private async establishSignalingConnection(): Promise<void> {
    try {
      await this.webSocketService.connect();
    } catch (error) {
      logger.error("Failed to establish signaling connection:", error);
      throw new Error("Failed to establish signaling connection");
    }
  }

  private async joinOrRegisterSession(options?: ConnectOptions): Promise<void> {
    try {
      this.state.participantId = uuidv4();

      if (options?.sessionId) {
        // Join existing session
        const response = await this.webSocketService.sendRequest(
          "join_session",
          options.sessionId,
          this.state.participantId,
          {
            joinSessionRequest: {
              sessionId: { id: options.sessionId },
              participantId: { id: this.state.participantId },
              participantType: ParticipantType.PARTICIPANT_TYPE_USER,
            },
          },
        );

        if (!response.sessionId || !response.joinSessionResponse) {
          throw new Error("Invalid join session response");
        }

        this.state.sessionId = response.sessionId;
      } else {
        // Create new session
        const response = await this.webSocketService.sendRequest(
          "register_session",
          "",
          this.state.participantId,
          {
            registerSessionRequest: {
              authToken: options?.authToken,
              llmProvider: options?.providers?.llm.provider,
              llmModelId: options?.providers?.llm.modelId,
              ttsProvider: options?.providers?.tts.provider,
              ttsModelId: options?.providers?.tts.modelId,
              sttProvider: options?.providers?.stt.provider,
              sttModelId: options?.providers?.stt.modelId,
            },
          },
        );

        if (!response.sessionId || !response.registerSessionResponse) {
          throw new Error("Invalid register session response");
        }

        this.state.sessionId = response.sessionId;

        const protoIceServers = response.registerSessionResponse.iceServers;
        if (protoIceServers && protoIceServers.length > 0) {
          this.state.iceServers = protoIceServers.map((s) => ({
            urls: s.urls ?? [],
            ...(s.username && { username: s.username }),
            ...(s.credential && { credential: s.credential }),
          }));
        }
      }
    } catch (error) {
      logger.error("Failed to join or register session:", error);
      throw error;
    }
  }

  private async setupRtpCapabilities(): Promise<void> {
    try {
      if (!this.state.sessionId || !this.state.participantId) {
        throw new Error("Missing session or participant ID");
      }

      const response = await this.webSocketService.sendRequest(
        "get_router_rtp_capabilities",
        this.state.sessionId,
        this.state.participantId,
        {
          getRouterRtpCapabilitiesRequest: {
            sessionId: { id: this.state.sessionId },
          },
        },
      );
      if (!response.getRouterRtpCapabilitiesResponse?.rtpCapabilities) {
        throw new Error("Invalid RTP capabilities response");
      }

      const routerRtpCapabilities = protoToMediasoupRtpCapabilities(
        response.getRouterRtpCapabilitiesResponse.rtpCapabilities,
      );
      if (!routerRtpCapabilities) {
        throw new Error("Failed to convert RTP capabilities");
      }

      const success = await this.mediaSoupService.initialize(routerRtpCapabilities);
      if (!success) {
        throw new Error("Failed to initialize MediaSoup");
      }

      const localRtpCapabilities = this.mediaSoupService.getRtpCapabilities();
      if (!localRtpCapabilities) {
        throw new Error("Failed to get RTP capabilities");
      }

      const protoLocalRtpCapabilities = mediasoupToProtoRtpCapabilities(localRtpCapabilities);
      if (!protoLocalRtpCapabilities) {
        throw new Error("Failed to convert local RTP capabilities");
      }

      await this.webSocketService.sendRequest(
        "set_rtp_capabilities",
        this.state.sessionId,
        this.state.participantId,
        {
          setRtpCapabilitiesRequest: {
            sessionId: { id: this.state.sessionId },
            rtpCapabilities: protoLocalRtpCapabilities,
          },
        },
      );
    } catch (error) {
      logger.error("Failed to setup media capabilities:", error);
      throw new Error("Failed to setup media capabilities");
    }
  }

  private async subscribeToSfuEvents(): Promise<void> {
    try {
      if (!this.state.sessionId || !this.state.participantId) {
        throw new Error("Missing session or participant ID");
      }

      await this.webSocketService.sendRequest(
        "subscribe_to_events",
        this.state.sessionId,
        this.state.participantId,
        {
          subscribeToEventsRequest: {
            sessionId: { id: this.state.sessionId },
          },
        },
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("Already subscribed")) {
        logger.log("Already subscribed to events, continuing...");
        // This is OK - don't throw
        return;
      }
      logger.error("Failed to subscribe to events:", error);
      throw new Error("Failed to subscribe to events");
    }
  }

  private cleanup(): void {
    try {
      // Reset critical state first to prevent further operations
      this.state.connected = false;
      this.state.connectionInProgress = false;

      // Clean up resources
      this.mediaSoupService.dispose();
      this.webSocketService.dispose();

      // Reset all state to initial values
      this.state = {
        sessionId: null,
        participantId: null,
        sendTransportId: null,
        recvTransportId: null,
        iceCandidates: [],
        iceParameters: null,
        dtlsParameters: null,
        iceServers: [],
        connected: false,
        connectionInProgress: false,
        localStreamStarted: false,
        sendTransportConnected: false,
        recvTransportConnected: false,
        rtpCapabilities: null,
      };
    } catch (error) {
      logger.error("Error during cleanup:", error);
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.state.connected && this.state.sessionId && this.state.participantId) {
        try {
          await this.webSocketService.sendRequest(
            "close_session",
            this.state.sessionId,
            this.state.participantId,
            {
              closeSessionRequest: {
                sessionId: { id: this.state.sessionId },
              },
            },
          );
        } catch (error) {
          logger.warn("Error leaving session:", error);
        }
      }

      this.cleanup();
    } catch (error) {
      logger.error("Error during disconnect:", error);
    }

    this.events.onDisconnected?.();
  }

  public setMicMuted(muted: boolean): void {
    if (muted) {
      this.mediaSoupService.pauseAudioProducers();
    } else {
      this.mediaSoupService.resumeAudioProducers();
    }
  }

  public async startLocalMediaStream(
    constraints: MediaConstraints = this.config.mediasoup?.mediaConstraints || {},
  ): Promise<MediaStream | null> {
    if (!this.state.connected) {
      logger.warn("Cannot start local media before connecting");
      return null;
    }

    try {
      const stream = await this.mediaSoupService.startLocalMediaStream(constraints);
      if (!stream) {
        throw new Error("Failed to get local media stream");
      }

      this.state.localStreamStarted = true;

      if (this.state.connected && this.mediaSoupService.getProducers().size === 0) {
        await this.startProducingLocalTracks();
      }

      return stream;
    } catch (error) {
      this.handleError(error);
      this.state.localStreamStarted = false;
      return null;
    }
  }

  private async startProducingLocalTracks(): Promise<boolean> {
    if (!this.state.connected || !this.state.localStreamStarted) {
      return false;
    }

    try {
      const localStream = this.mediaSoupService.getLocalMediaStream();
      if (!localStream) {
        throw new Error("No local media stream available");
      }

      const sendTransport = this.mediaSoupService.getSendTransport();
      if (!sendTransport) {
        if (!this.state.sessionId || !this.state.participantId) {
          throw new Error("Missing session or participant ID");
        }

        const transportData = await this.webSocketService.sendRequest(
          "create_transport",
          this.state.sessionId,
          this.state.participantId,
          {
            createTransportRequest: {
              sessionId: { id: this.state.sessionId },
              direction: TransportDirection.TRANSPORT_DIRECTION_SEND,
            },
          },
        );
        if (!transportData.createTransportResponse) {
          throw new Error("Invalid transport creation response");
        }

        const baseTransportOptions = protoToMediasoupTransportOptions(
          transportData.createTransportResponse,
        );
        if (!baseTransportOptions) {
          throw new Error("Failed to convert transport options");
        }

        this.mediaSoupService.createSendTransport({
          ...baseTransportOptions,
          iceServers: this.state.iceServers,
        });
      }

      await this.produceLocalTracks();

      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  }

  private async produceLocalTracks(): Promise<void> {
    if (this.isProducing) {
      return;
    }
    this.isProducing = true;

    const localStream = this.mediaSoupService.getLocalMediaStream();
    if (!localStream) {
      throw new Error("No local media stream available");
    }

    const audioTrack = localStream.getAudioTracks()[0];
    const videoTrack = localStream.getVideoTracks()[0];
    let producedAnyTrack = false;

    if (audioTrack && this.mediaSoupService.canProduce("audio")) {
      try {
        const producerId = await this.mediaSoupService.produce({
          track: audioTrack,
          encodings: [
            {
              maxBitrate: 128000,
              priority: "high",
            },
          ],
          codecOptions: {
            opusStereo: false,
            opusDtx: true,
          },
          appData: { kind: "audio" },
        });

        if (producerId) {
          logger.log("Audio production started with ID:", producerId);
          producedAnyTrack = true;
        }
      } catch (error) {
        this.handleError(error);
        // Continue with video even if audio fails
      } finally {
        this.isProducing = false;
      }
    }

    if (videoTrack && this.mediaSoupService.canProduce("video")) {
      try {
        const producerId = await this.mediaSoupService.produce({
          track: videoTrack,
          encodings: [
            { scaleResolutionDownBy: 4, maxBitrate: 150000 },
            { scaleResolutionDownBy: 2, maxBitrate: 500000 },
            { scaleResolutionDownBy: 1, maxBitrate: 1500000 },
          ],
          codecOptions: {
            videoGoogleStartBitrate: 1000,
          },
          appData: { kind: "video" },
        });

        if (producerId) {
          logger.log("Video production started with ID:", producerId);
          producedAnyTrack = true;
        }
      } catch (error) {
        this.handleError(error);
      }
    }

    if (producedAnyTrack) {
      this.events.onProducingStarted?.();
    }
  }

  private async startConsumingRemoteTrack(producerId: string): Promise<void> {
    if (!this.state.connected) {
      return;
    }

    try {
      let recvTransport = this.mediaSoupService.getRecvTransport();
      if (!recvTransport) {
        if (!this.state.sessionId || !this.state.participantId) {
          throw new Error("Missing session or participant ID");
        }

        const transportData = await this.webSocketService.sendRequest(
          "create_transport",
          this.state.sessionId,
          this.state.participantId,
          {
            createTransportRequest: {
              sessionId: { id: this.state.sessionId },
              direction: TransportDirection.TRANSPORT_DIRECTION_RECV,
            },
          },
        );

        if (!transportData.createTransportResponse) {
          throw new Error("Invalid transport creation response");
        }

        const baseTransportOptions = protoToMediasoupTransportOptions(
          transportData.createTransportResponse,
        );
        if (!baseTransportOptions) {
          throw new Error("Failed to convert transport options");
        }

        this.mediaSoupService.createReceiveTransport({
          ...baseTransportOptions,
          iceServers: this.state.iceServers,
        });

        recvTransport = this.mediaSoupService.getRecvTransport();

        if (!recvTransport) {
          throw new Error("Failed to create receive transport");
        }
      }

      // Store the producer ID to consume after transport connects
      this.pendingConsumerProducerId = producerId;

      // Transport exists - check if connected
      if (recvTransport.connectionState === "connected") {
        await this.consumeRemoteTrack(producerId);
      } else {
        // The first consume attempt will trigger the connection
        // So try to consume - this will cause the 'connect' event
        await this.consumeRemoteTrack(producerId);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  private async consumeRemoteTrack(producerId: string): Promise<void> {
    if (!this.state.sessionId || !this.state.participantId) {
      throw new Error("Missing session or participant ID");
    }

    const localRtpCapabilities = this.mediaSoupService.getRtpCapabilities();
    if (!localRtpCapabilities) {
      logger.error("No RTP capabilities available");
      return;
    }

    try {
      const recvTransport = this.mediaSoupService.getRecvTransport();
      if (!recvTransport) {
        throw new Error("No receive transport available");
      }

      const consumerData = await this.webSocketService.sendRequest(
        "create_consumer",
        this.state.sessionId,
        this.state.participantId,
        {
          createConsumerRequest: {
            sessionId: { id: this.state.sessionId },
            transportId: { id: recvTransport.id },
            producerId: { id: producerId },
            rtpCapabilities: mediasoupToProtoRtpCapabilities(localRtpCapabilities),
          },
        },
      );

      if (!consumerData.createConsumerResponse?.consumerInfo) {
        throw new Error("Invalid consumer creation response: missing consumer info");
      }

      const consumerInfo = consumerData.createConsumerResponse.consumerInfo;

      if (
        !consumerInfo.id ||
        !consumerInfo.producerId ||
        !consumerInfo.kind ||
        !consumerInfo.rtpParameters
      ) {
        throw new Error("Invalid consumer info: missing required fields");
      }

      const mediaKind = protoToMediasoupMediaKind(consumerInfo.kind);
      if (!mediaKind) {
        throw new Error("Invalid media kind");
      }

      const rtpParameters = protoToMediasoupRtpParameters(consumerInfo.rtpParameters);
      if (!rtpParameters) {
        throw new Error("Failed to convert RTP parameters");
      }

      const consumer = await this.mediaSoupService.consume({
        id: consumerInfo.id,
        producerId: consumerInfo.producerId,
        kind: mediaKind,
        rtpParameters: rtpParameters,
        appData: {
          peerId: producerId,
        },
      });

      if (!consumer) {
        throw new Error("Failed to create consumer");
      }

      this.events.onRemoteTrackAdded?.(consumerData.createConsumerResponse.consumerInfo);

      await this.webSocketService.sendRequest(
        "resume_consumer",
        this.state.sessionId,
        this.state.participantId,
        {
          resumeConsumerRequest: {
            sessionId: { id: this.state.sessionId },
            consumerId: { id: consumer.id },
          },
        },
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  public stopLocalMediaStream(): void {
    this.mediaSoupService.stopLocalMediaStream();
    this.state.localStreamStarted = false;

    if (this.mediaSoupService.getProducers().size > 0) {
      this.stopProducingLocalTracks();
    }

    this.events.onLocalStreamStopped?.();
  }

  private stopProducingLocalTracks(): void {
    const producers = this.mediaSoupService.getProducers();
    for (const producer of producers.values()) {
      this.mediaSoupService.closeProducer(producer.id);
    }

    this.events.onProducingStopped?.();
  }

  public toggleLocalMediaStreamTrack(type: "audio" | "video", enabled: boolean): boolean {
    return this.mediaSoupService.toggleLocalMediaStreamTrack(type, enabled);
  }

  public getState(): AssistantServiceState {
    return { ...this.state };
  }

  public isConnected(): boolean {
    return this.state.connected;
  }

  public getLocalMediaStream(): MediaStream | null {
    return this.mediaSoupService.getLocalMediaStream();
  }

  public getRemoteMediaStreams(): MediaStream[] {
    return this.mediaSoupService.getRemoteMediaStreams();
  }

  private handleWebSocketOpen(_: Event): void {
    logger.log("WebSocket connection opened");
  }

  private handleWebSocketClose(event: CloseEvent): void {
    logger.log("WebSocket connection closed", event.code, event.reason);

    if (this.state.connected && event.code !== 1000) {
      this.cleanup();
      this.events.onDisconnected?.();
    }
  }

  private handleWebSocketReconnectFailed(): void {
    logger.error("WebSocket reconnection failed");
    this.cleanup();
    this.events.onDisconnected?.();
    this.events.onConnectionFailed?.();
  }

  private handleWebSocketSfuEvent(event: WebSocketEvent): void {
    try {
      if (event.subscriptionConfirmed) {
        logger.log("SFU event subscription confirmed");
        this.events.onSubscriptionConfirmed?.();
      } else if (event.sessionEnded) {
        const reason = protoToStringSessionEndReason(event.sessionEnded.reason);
        logger.log("Session ended by Signal service, reason:", reason);

        this.events.onSessionEnded?.(reason);
        this.cleanup();
        this.events.onDisconnected?.();
      } else if (event.usageStatus) {
        const remainingSeconds = event.usageStatus.usageRemainingSeconds ?? Number.MAX_SAFE_INTEGER;
        const budgetExhausted = event.usageStatus.budgetExhausted ?? false;
        logger.log(`Usage status: ${remainingSeconds}s remaining, exhausted: ${budgetExhausted}`);
        this.events.onUsageStatus?.(remainingSeconds, budgetExhausted);
      } else if (event.newProducer) {
        const producerId = event.newProducer.producerId;
        if (producerId) {
          const isOwnProducer = Array.from(this.mediaSoupService.getProducers().values()).some(
            (producer) => producer.id === producerId,
          );

          if (!isOwnProducer) {
            logger.log(`New producer from another participant: ${producerId}`);
            this.startConsumingRemoteTrack(producerId);
          } else {
            logger.log(`Ignoring our own producer: ${producerId}`);
          }
        }
      } else if (event.producerClosed) {
        const producerId = event.producerClosed.producerId;
        if (producerId) {
          const consumers = this.mediaSoupService.getConsumers();
          for (const consumer of consumers.values()) {
            if (consumer.producerId === producerId) {
              this.mediaSoupService.closeConsumer(consumer.id);
            }
          }

          this.events.onRemoteTrackRemoved?.(producerId);
        }
      } else if (event.consumerClosed) {
        const consumerId = event.consumerClosed.consumerId;
        if (consumerId) {
          this.mediaSoupService.closeConsumer(consumerId);
        }
      } else if (event.transportClosed) {
        const transportId = event.transportClosed.transportId;
        if (transportId) {
          logger.warn("Transport closed by server:", transportId);
          // Transport closure is handled by MediaSoupService listeners
        }
      } else if (event.producerScore) {
        const producerId = event.producerScore.producerId;
        const score = event.producerScore.score;
        if (producerId && score !== undefined) {
          logger.log(`Producer ${producerId} score:`, score);
          // We could emit an event here if we want to track quality
        }
      } else if (event.consumerScore) {
        const consumerId = event.consumerScore.consumerId;
        const score = event.consumerScore.score;
        if (consumerId && score !== undefined) {
          logger.log(`Consumer ${consumerId} score:`, score);
          // We could emit an event here if we want to track quality
        }
      } else if (event.iceStateChange) {
        const transportId = event.iceStateChange.transportId;
        const state = event.iceStateChange.state;
        if (transportId && state) {
          logger.log(`Transport ${transportId} ICE state:`, state);
          // We could emit an event here if needed
        }
      } else if (event.dtlsStateChange) {
        const transportId = event.dtlsStateChange.transportId;
        const state = event.dtlsStateChange.state;
        if (transportId && state) {
          logger.log(`Transport ${transportId} DTLS state:`, state);
          // We could emit an event here if needed
        }
      } else {
        logger.warn("Unknown or empty SFU event:", event);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleMediaSoupInitialized(): void {
    logger.log("MediaSoup initialized");
  }

  private handleMediaSoupTransportClosed(transportId: string): void {
    if (!this.state.connected) {
      return; // Already disconnecting, ignore
    }

    logger.warn(`Mediasoup transport closed: ${transportId}`);

    const sendTransport = this.mediaSoupService.getSendTransport();

    // Send transport closing unexpectedly is critical
    if (sendTransport && sendTransport.id === transportId) {
      logger.error("Send transport closed - triggering cleanup");
      this.handleLocalMediaFailure();
    }
  }

  private handleMediaSoupProducerClosed(producerId: string): void {
    logger.log("MediaSoup producer closed", producerId);

    if (this.mediaSoupService.getProducers().size === 0) {
      this.events.onProducingStopped?.();
    }
  }

  private handleMediaSoupProducerTrackEnded(producerId: string): void {
    if (!this.state.connected) {
      return; // Already disconnecting, ignore
    }

    logger.warn(`MediaSoup producer track ended: ${producerId}`);

    const producers = this.mediaSoupService.getProducers();
    const producer = producers.get(producerId);

    // Audio track is critical for voice app
    if (producer?.appData?.kind === "audio") {
      logger.error("Audio producer track ended - triggering cleanup");
      this.handleLocalMediaFailure();
    }
  }

  private handleMediaSoupConsumerClosed(consumerId: string): void {
    logger.log("MediaSoup consumer closed", consumerId);
  }

  private handleMediaSoupConsumerTrackEnded(consumerId: string): void {
    logger.warn(`MediaSoup consumer track ended: ${consumerId}`);
    // Consumer track ending means remote peer's track died
    // Not critical for local cleanup - SFU will handle it
  }

  private handleMediaSoupDispose(): void {
    logger.log("MediaSoup disposed");
  }

  private async handleMediaSoupTransportConnect(options: TransportConnectParams): Promise<void> {
    const { transportId, dtlsParameters, callback, errback } = options;

    try {
      if (!this.state.sessionId || !this.state.participantId) {
        throw new Error("Missing session or participant ID");
      }

      const protoDtlsParameters = mediasoupToProtoDtlsParameters(dtlsParameters);
      if (!protoDtlsParameters) {
        throw new Error("Failed to convert DTLS parameters");
      }

      await this.webSocketService.sendRequest(
        "connect_transport",
        this.state.sessionId,
        this.state.participantId,
        {
          connectTransportRequest: {
            sessionId: { id: this.state.sessionId },
            transportId: { id: transportId },
            dtlsParameters: protoDtlsParameters,
          },
        },
      );

      callback();

      const sendTransport = this.mediaSoupService.getSendTransport();
      if (
        sendTransport &&
        sendTransport.id === transportId &&
        this.state.localStreamStarted &&
        this.mediaSoupService.getProducers().size === 0
      ) {
        const localStream = this.mediaSoupService.getLocalMediaStream();
        if (localStream) {
          await this.produceLocalTracks();
        }
      }

      const recvTransport = this.mediaSoupService.getRecvTransport();
      if (recvTransport && recvTransport.id === transportId && this.pendingConsumerProducerId) {
        await this.consumeRemoteTrack(this.pendingConsumerProducerId);
        this.pendingConsumerProducerId = null;
      }
    } catch (error) {
      errback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async handleMediaSoupTransportProduce(options: TransportProduceParams): Promise<void> {
    const { transportId, kind, rtpParameters, callback, errback } = options;

    try {
      if (!this.state.sessionId || !this.state.participantId) {
        throw new Error("Missing session or participant ID");
      }

      const protoKind = mediasoupToProtoMediaKind(kind);
      if (protoKind === null) {
        throw new Error(`Invalid media kind: ${kind}`);
      }

      const protoRtpParameters = mediasoupToProtoRtpParameters(rtpParameters);
      if (protoRtpParameters === null) {
        throw new Error("Failed to convert RTP parameters to proto format");
      }

      const producerData = await this.webSocketService.sendRequest(
        "create_producer",
        this.state.sessionId,
        this.state.participantId,
        {
          createProducerRequest: {
            sessionId: { id: this.state.sessionId },
            transportId: { id: transportId },
            kind: protoKind,
            rtpParameters: protoRtpParameters,
          },
        },
      );

      if (!producerData.createProducerResponse?.producerId?.id) {
        throw new Error("Invalid producer creation response");
      }

      callback({ id: producerData.createProducerResponse.producerId.id });
    } catch (error) {
      errback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleLocalStream(stream: MediaStream): void {
    logger.log("=== LOCAL STREAM STARTED ===");
    logger.log("Stream ID:", stream.id);
    logger.log("Audio tracks:", stream.getAudioTracks().length);

    stream.getAudioTracks().forEach((track, index) => {
      logger.log(`Audio track ${index}:`, {
        id: track.id,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
      });
    });

    this.events.onLocalStream?.(stream);
  }

  private handleRemoteStream(stream: MediaStream): void {
    logger.log("=== REMOTE STREAM RECEIVED ===");
    logger.log("Stream ID:", stream.id);
    logger.log("Audio tracks:", stream.getAudioTracks().length);
    logger.log("Video tracks:", stream.getVideoTracks().length);

    stream.getAudioTracks().forEach((track, index) => {
      logger.log(`Audio track ${index}:`, {
        id: track.id,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        label: track.label,
      });
    });

    this.events.onRemoteStream?.(stream);
  }

  private handleConnectionStateChange(state: RTCPeerConnectionState): void {
    logger.log("Connection state changed:", state);

    if (state === "disconnected" || state === "failed" || state === "closed") {
      if (this.state.connected) {
        this.events.onConnectionStateChanged?.(state);
      }

      if (state === "failed") {
        logger.error("WebRTC connection failed - triggering cleanup");
        this.events.onError?.(
          new Error(
            "Your network may be blocking this connection. Try switching to mobile data or a different network.",
          ),
        );
        this.handleLocalMediaFailure();
      }
    }
  }

  private async handleLocalMediaFailure(): Promise<void> {
    if (!this.state.connected) {
      return;
    }

    logger.error("Local media failure");
    this.events.onLocalMediaFailure?.();
    await this.disconnect();
  }

  private handleError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("Assistant service error:", error);
    this.events.onError?.(error);
  }
}

export default AssistantService;
