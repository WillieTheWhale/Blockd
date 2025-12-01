/**
 * Media Streaming Service
 * Handles WebRTC streaming of video/audio to backend
 */

import { EventEmitter } from 'events';
import { Device, types as mediasoupTypes } from 'mediasoup-client';

// Configuration
const VIDEO_SERVICE_URL = process.env.BLOCKD_VIDEO_URL || 'http://localhost:8003';

interface StreamConfig {
  sessionId: string;
  accessToken: string;
  videoSourceId?: string;
}

interface TransportParams {
  id: string;
  iceParameters: mediasoupTypes.IceParameters;
  iceCandidates: mediasoupTypes.IceCandidate[];
  dtlsParameters: mediasoupTypes.DtlsParameters;
}

interface ProducerOptions {
  id: string;
  kind: 'audio' | 'video';
  rtpParameters: mediasoupTypes.RtpParameters;
}

export class MediaStreamingService extends EventEmitter {
  private device: Device | null = null;
  private sendTransport: mediasoupTypes.Transport | null = null;
  private videoProducer: mediasoupTypes.Producer | null = null;
  private audioProducer: mediasoupTypes.Producer | null = null;
  private accessToken: string | null = null;
  private sessionId: string | null = null;
  private isStreaming = false;

  constructor() {
    super();
  }

  /**
   * Initialize the mediasoup device
   */
  async initialize(config: StreamConfig): Promise<void> {
    this.sessionId = config.sessionId;
    this.accessToken = config.accessToken;

    // Get router RTP capabilities from server
    const routerRtpCapabilities = await this.fetchRouterCapabilities();

    // Create and load the device
    this.device = new Device();
    await this.device.load({ routerRtpCapabilities });

    console.log('[MediaStreaming] Device initialized');
  }

  /**
   * Start streaming video and audio
   */
  async startStreaming(videoStream: MediaStream, audioStream?: MediaStream): Promise<void> {
    if (!this.device) {
      throw new Error('Device not initialized');
    }

    // Create send transport
    await this.createSendTransport();

    if (!this.sendTransport) {
      throw new Error('Failed to create send transport');
    }

    // Produce video
    const videoTrack = videoStream.getVideoTracks()[0];
    if (videoTrack) {
      this.videoProducer = await this.sendTransport.produce({
        track: videoTrack,
        encodings: [
          { maxBitrate: 500000, scaleResolutionDownBy: 4 },
          { maxBitrate: 1000000, scaleResolutionDownBy: 2 },
          { maxBitrate: 2500000, scaleResolutionDownBy: 1 },
        ],
        codecOptions: {
          videoGoogleStartBitrate: 1000,
        },
      });

      console.log('[MediaStreaming] Video producer created');
    }

    // Produce audio
    const audioTrack = audioStream?.getAudioTracks()[0] || videoStream.getAudioTracks()[0];
    if (audioTrack) {
      this.audioProducer = await this.sendTransport.produce({
        track: audioTrack,
        codecOptions: {
          opusStereo: false,
          opusDtx: true,
        },
      });

      console.log('[MediaStreaming] Audio producer created');
    }

    this.isStreaming = true;
    this.emit('streaming:started');
  }

  /**
   * Stop streaming
   */
  async stopStreaming(): Promise<void> {
    if (this.videoProducer) {
      this.videoProducer.close();
      this.videoProducer = null;
    }

    if (this.audioProducer) {
      this.audioProducer.close();
      this.audioProducer = null;
    }

    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }

    this.isStreaming = false;
    this.emit('streaming:stopped');
    console.log('[MediaStreaming] Streaming stopped');
  }

  /**
   * Check if currently streaming
   */
  getIsStreaming(): boolean {
    return this.isStreaming;
  }

  /**
   * Create send transport for producing media
   */
  private async createSendTransport(): Promise<void> {
    if (!this.device) {
      throw new Error('Device not initialized');
    }

    // Request transport from server
    const transportParams = await this.createTransportOnServer('send');

    this.sendTransport = this.device.createSendTransport({
      id: transportParams.id,
      iceParameters: transportParams.iceParameters,
      iceCandidates: transportParams.iceCandidates,
      dtlsParameters: transportParams.dtlsParameters,
    });

    // Handle transport connection
    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.connectTransport(transportParams.id, dtlsParameters);
        callback();
      } catch (error) {
        errback(error as Error);
      }
    });

    // Handle produce event
    this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      try {
        const { id } = await this.produceOnServer(transportParams.id, kind, rtpParameters);
        callback({ id });
      } catch (error) {
        errback(error as Error);
      }
    });

    // Handle transport state changes
    this.sendTransport.on('connectionstatechange', (state) => {
      console.log('[MediaStreaming] Transport connection state:', state);
      this.emit('transport:state', state);

      if (state === 'failed') {
        this.emit('streaming:error', new Error('Transport connection failed'));
      }
    });

    console.log('[MediaStreaming] Send transport created');
  }

  /**
   * Fetch router RTP capabilities from server
   */
  private async fetchRouterCapabilities(): Promise<mediasoupTypes.RtpCapabilities> {
    const response = await fetch(`${VIDEO_SERVICE_URL}/api/v1/webrtc/capabilities`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch router capabilities: ${response.status}`);
    }

    const data = await response.json();
    return data.routerRtpCapabilities;
  }

  /**
   * Create transport on server
   */
  private async createTransportOnServer(direction: 'send' | 'recv'): Promise<TransportParams> {
    const response = await fetch(`${VIDEO_SERVICE_URL}/api/v1/webrtc/transport`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: this.sessionId,
        direction,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create transport: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Connect transport on server
   */
  private async connectTransport(
    transportId: string,
    dtlsParameters: mediasoupTypes.DtlsParameters
  ): Promise<void> {
    const response = await fetch(`${VIDEO_SERVICE_URL}/api/v1/webrtc/transport/connect`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transport_id: transportId,
        dtls_parameters: dtlsParameters,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to connect transport: ${response.status}`);
    }
  }

  /**
   * Produce media on server
   */
  private async produceOnServer(
    transportId: string,
    kind: 'audio' | 'video',
    rtpParameters: mediasoupTypes.RtpParameters
  ): Promise<{ id: string }> {
    const response = await fetch(`${VIDEO_SERVICE_URL}/api/v1/webrtc/produce`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: this.sessionId,
        transport_id: transportId,
        kind,
        rtp_parameters: rtpParameters,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to produce: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopStreaming();
    this.device = null;
    this.sessionId = null;
    this.accessToken = null;
  }
}

/**
 * Simple fallback streaming using HTTP chunked upload
 * Used when WebRTC is not available
 */
export class FallbackStreamingService extends EventEmitter {
  private mediaRecorder: MediaRecorder | null = null;
  private uploadEndpoint: string;
  private sessionId: string | null = null;
  private accessToken: string | null = null;
  private isStreaming = false;
  private chunkQueue: Blob[] = [];
  private uploadInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.uploadEndpoint = `${VIDEO_SERVICE_URL}/api/v1/stream/upload`;
  }

  /**
   * Initialize the fallback service
   */
  initialize(config: StreamConfig): void {
    this.sessionId = config.sessionId;
    this.accessToken = config.accessToken;
    console.log('[FallbackStreaming] Initialized');
  }

  /**
   * Start recording and uploading
   */
  async startStreaming(stream: MediaStream): Promise<void> {
    // Create MediaRecorder with appropriate codec
    const mimeType = this.getSupportedMimeType();
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2500000,
    });

    // Collect chunks
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunkQueue.push(event.data);
      }
    };

    // Start recording with 5-second chunks
    this.mediaRecorder.start(5000);

    // Start upload interval
    this.uploadInterval = setInterval(() => this.uploadChunks(), 5000);

    this.isStreaming = true;
    this.emit('streaming:started');
    console.log('[FallbackStreaming] Started');
  }

  /**
   * Stop recording and upload remaining chunks
   */
  async stopStreaming(): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.uploadInterval) {
      clearInterval(this.uploadInterval);
      this.uploadInterval = null;
    }

    // Upload any remaining chunks
    await this.uploadChunks();

    this.mediaRecorder = null;
    this.isStreaming = false;
    this.emit('streaming:stopped');
    console.log('[FallbackStreaming] Stopped');
  }

  /**
   * Check if currently streaming
   */
  getIsStreaming(): boolean {
    return this.isStreaming;
  }

  /**
   * Upload queued chunks to server
   */
  private async uploadChunks(): Promise<void> {
    if (this.chunkQueue.length === 0) return;

    const chunks = [...this.chunkQueue];
    this.chunkQueue = [];

    const blob = new Blob(chunks, { type: this.getSupportedMimeType() });

    try {
      const formData = new FormData();
      formData.append('session_id', this.sessionId || '');
      formData.append('timestamp', new Date().toISOString());
      formData.append('chunk', blob, `chunk_${Date.now()}.webm`);

      const response = await fetch(this.uploadEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        console.error('[FallbackStreaming] Upload failed:', response.status);
        this.emit('streaming:error', new Error(`Upload failed: ${response.status}`));
      }
    } catch (error) {
      console.error('[FallbackStreaming] Upload error:', error);
      this.emit('streaming:error', error);
    }
  }

  /**
   * Get supported MIME type for recording
   */
  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'video/webm';
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopStreaming();
    this.sessionId = null;
    this.accessToken = null;
  }
}
