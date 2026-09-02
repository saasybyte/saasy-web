import { detectDeviceAsync, types, Device } from "mediasoup-client";
import { logger } from "@/utils";
import {
  MediaConstraints,
  MediaSoupServiceConfig,
  MediaSoupServiceEvents,
} from "../types/mediasoup";

export class MediaSoupService {
  private events: MediaSoupServiceEvents;
  private config: MediaSoupServiceConfig;
  private device: Device | null = null;
  private sendTransport: types.Transport | null = null;
  private recvTransport: types.Transport | null = null;
  private producers: Map<string, types.Producer> = new Map();
  private consumers: Map<string, types.Consumer> = new Map();
  private initialized: boolean = false;
  private localMediaStream: MediaStream | null = null;
  private remoteMediaStreams: Map<string, MediaStream> = new Map();

  constructor(config: MediaSoupServiceConfig = {}, events: MediaSoupServiceEvents = {}) {
    this.config = config;
    this.events = events;
  }

  public async initialize(routerRtpCapabilities: types.RtpCapabilities): Promise<boolean> {
    try {
      if (this.initialized) {
        return true;
      }

      const handlerName = await detectDeviceAsync();
      if (!handlerName) {
        throw new Error("Unsupported browser for MediaSoup");
      }

      this.device = new Device();
      await this.device.load({ routerRtpCapabilities });

      this.initialized = true;
      this.events.onInitialized?.();

      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  }

  public async startLocalMediaStream(
    constraints: MediaConstraints = {},
  ): Promise<MediaStream | null> {
    try {
      // Stop any existing stream first
      this.stopLocalMediaStream();

      // Build proper constraints object
      const mediaConstraints: MediaStreamConstraints = {
        audio: constraints.audio ??
          this.config.mediaConstraints?.audio ?? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        video: constraints.video ?? this.config.mediaConstraints?.video ?? false,
      };

      // Request media access
      const mediaStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      this.localMediaStream = mediaStream;

      // Fire event
      this.events.onLocalStream?.(mediaStream);

      return mediaStream;
    } catch (err) {
      this.handleError(err);
      return null;
    }
  }

  public stopLocalMediaStream(): void {
    if (this.localMediaStream != null) {
      this.localMediaStream.getTracks().forEach((track) => track.stop());
      this.localMediaStream = null;

      // Also close any producers using this stream
      for (const producer of this.producers.values()) {
        producer.close();
      }
      this.producers.clear();
    }
  }

  public toggleLocalMediaStreamTrack(type: "audio" | "video", enabled: boolean): boolean {
    if (this.localMediaStream == null) return false;

    const tracks =
      type === "audio"
        ? this.localMediaStream.getAudioTracks()
        : this.localMediaStream.getVideoTracks();

    tracks.forEach((track) => {
      track.enabled = enabled;
    });

    return tracks.length > 0;
  }

  public getLocalMediaStream(): MediaStream | null {
    return this.localMediaStream;
  }

  public getRemoteMediaStreams(): MediaStream[] {
    return Array.from(this.remoteMediaStreams.values());
  }

  public canProduce(kind: types.MediaKind): boolean {
    if (!this.device || !this.initialized) {
      return false;
    }

    return this.device.canProduce(kind);
  }

  public getRtpCapabilities(): types.RtpCapabilities | null {
    if (!this.device || !this.initialized) {
      return null;
    }

    return this.device.rtpCapabilities;
  }

  public createSendTransport(options: types.TransportOptions): boolean {
    if (!this.device || !this.initialized) {
      return false;
    }

    try {
      this.sendTransport = this.device.createSendTransport(options);

      this.setupTransportListeners(this.sendTransport);

      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  }

  public createReceiveTransport(options: types.TransportOptions): boolean {
    if (!this.device || !this.initialized) {
      return false;
    }

    try {
      this.recvTransport = this.device.createRecvTransport(options);

      this.setupTransportListeners(this.recvTransport);

      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  }

  public async produce(options: types.ProducerOptions): Promise<string | null> {
    if (!this.sendTransport || !this.initialized) {
      return null;
    }

    try {
      const producer = await this.sendTransport.produce(options);

      this.producers.set(producer.id, producer);

      this.setupProducerListeners(producer);

      return producer.id;
    } catch (error) {
      this.handleError(error);
      return null;
    }
  }

  public async consume(
    options: types.ConsumerOptions<types.AppData>,
  ): Promise<types.Consumer | null> {
    if (!this.recvTransport || !this.initialized) {
      return null;
    }

    try {
      const consumer = await this.recvTransport.consume(options);

      this.consumers.set(consumer.id, consumer);

      this.setupConsumerListeners(consumer);

      const { track } = consumer;
      if (track) {
        // Find or create MediaStream container for tracks from this remote peer
        let stream = this.remoteMediaStreams.get(consumer.appData.peerId as string);
        if (!stream) {
          stream = new MediaStream();
          this.remoteMediaStreams.set(consumer.appData.peerId as string, stream);
        }

        stream.addTrack(track);

        // Fire events
        this.events.onTrack?.(track, stream);
        this.events.onRemoteStream?.(stream);
      }

      return consumer;
    } catch (error) {
      this.handleError(error);
      return null;
    }
  }

  public async restartIce(
    transportType: "send" | "recv",
    iceParameters: types.IceParameters,
  ): Promise<boolean> {
    const transport = transportType === "send" ? this.sendTransport : this.recvTransport;
    if (!transport) return false;

    try {
      await transport.restartIce({ iceParameters });
      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  }

  public async updateIceServers(
    transportType: "send" | "recv",
    iceServers: RTCIceServer[],
  ): Promise<boolean> {
    const transport = transportType === "send" ? this.sendTransport : this.recvTransport;
    if (!transport) return false;

    try {
      await transport.updateIceServers({ iceServers });
      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  }

  public async getTransportStats(transportType: "send" | "recv"): Promise<RTCStatsReport | null> {
    const transport = transportType === "send" ? this.sendTransport : this.recvTransport;
    if (!transport) return null;

    try {
      return await transport.getStats();
    } catch (error) {
      this.handleError(error);
      return null;
    }
  }

  public async getProducerStats(producerId: string): Promise<RTCStatsReport | null> {
    const producer = this.producers.get(producerId);
    if (!producer) return null;

    try {
      return await producer.getStats();
    } catch (error) {
      this.handleError(error);
      return null;
    }
  }

  public async getConsumerStats(consumerId: string): Promise<RTCStatsReport | null> {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) return null;

    try {
      return await consumer.getStats();
    } catch (error) {
      this.handleError(error);
      return null;
    }
  }

  public closeProducer(producerId: string): boolean {
    const producer = this.producers.get(producerId);
    if (!producer) {
      return false;
    }

    producer.close();
    this.producers.delete(producerId);

    this.events.onProducerClosed?.(producerId);

    return true;
  }

  public closeConsumer(consumerId: string): boolean {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      return false;
    }

    // Clean up remote stream if needed
    const peerId = consumer.appData.peerId as string;
    if (peerId) {
      const stream = this.remoteMediaStreams.get(peerId);
      if (stream) {
        const track = consumer.track;
        if (track) {
          stream.removeTrack(track);
        }

        // Remove stream if empty
        if (stream.getTracks().length === 0) {
          this.remoteMediaStreams.delete(peerId);
        }
      }
    }

    consumer.close();
    this.consumers.delete(consumerId);

    this.events.onConsumerClosed?.(consumerId);

    return true;
  }

  public dispose(): void {
    // Stop local media first
    this.stopLocalMediaStream();

    // Close all producers
    for (const producer of this.producers.values()) {
      producer.close();
    }
    this.producers.clear();

    // Close all consumers
    for (const consumer of this.consumers.values()) {
      consumer.close();
    }
    this.consumers.clear();

    // Clear remote streams
    this.remoteMediaStreams.clear();

    // Close transports
    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }

    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = null;
    }

    this.device = null;
    this.initialized = false;

    this.events.onDispose?.();
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public getSendTransport(): types.Transport | null {
    return this.sendTransport;
  }

  public getRecvTransport(): types.Transport | null {
    return this.recvTransport;
  }

  public getProducers(): Map<string, types.Producer> {
    return this.producers;
  }

  public getConsumers(): Map<string, types.Consumer> {
    return this.consumers;
  }

  public pauseAudioProducers(): void {
    for (const producer of this.producers.values()) {
      if (producer.kind === "audio") {
        producer.pause();
      }
    }
  }

  public resumeAudioProducers(): void {
    for (const producer of this.producers.values()) {
      if (producer.kind === "audio") {
        producer.resume();
      }
    }
  }

  private setupTransportListeners(transport: types.Transport): void {
    transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.events.onTransportConnect?.({
          transportId: transport.id,
          dtlsParameters,
          callback,
          errback,
        });
      } catch (err) {
        errback(err instanceof Error ? err : new Error(String(err)));
      }
    });

    if (transport.direction === "send") {
      transport.on("produce", async (parameters, callback, errback) => {
        try {
          await this.events.onTransportProduce?.({
            transportId: transport.id,
            kind: parameters.kind,
            rtpParameters: parameters.rtpParameters,
            appData: parameters.appData,
            callback,
            errback,
          });
        } catch (err) {
          errback(err instanceof Error ? err : new Error(String(err)));
        }
      });
    }

    transport.on("connectionstatechange", (state) => {
      logger.log(`Transport ${transport.id} connection state changed to ${state}`);

      this.events.onConnectionStateChange?.(state);

      if (state === "failed" || state === "closed" || state === "disconnected") {
        this.events.onTransportClosed?.(transport.id);
      }
    });
  }

  private setupProducerListeners(producer: types.Producer): void {
    producer.on("transportclose", () => {
      this.producers.delete(producer.id);

      this.events.onProducerClosed?.(producer.id);
    });

    producer.on("trackended", () => {
      logger.log(`Producer ${producer.id} track ended`);

      this.closeProducer(producer.id);

      this.events.onProducerTrackEnded?.(producer.id);
    });
  }

  private setupConsumerListeners(consumer: types.Consumer): void {
    consumer.on("transportclose", () => {
      this.consumers.delete(consumer.id);

      this.events.onConsumerClosed?.(consumer.id);
    });

    consumer.on("trackended", () => {
      logger.log(`Consumer ${consumer.id} track ended`);

      this.events.onConsumerTrackEnded?.(consumer.id);
    });
  }

  private handleError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("MediaSoup error:", error);
    this.events.onError?.(error);
  }
}

export default MediaSoupService;
