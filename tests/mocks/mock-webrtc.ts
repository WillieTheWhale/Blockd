/**
 * Mock WebRTC Signaling Server for Testing
 *
 * Provides mock WebRTC signaling and transport creation
 * for testing video streaming functionality.
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface MockTransport {
  id: string;
  direction: 'send' | 'recv';
  iceParameters: {
    usernameFragment: string;
    password: string;
    iceLite?: boolean;
  };
  iceCandidates: Array<{
    foundation: string;
    priority: number;
    ip: string;
    protocol: 'udp' | 'tcp';
    port: number;
    type: 'host' | 'srflx' | 'relay';
  }>;
  dtlsParameters: {
    role?: 'auto' | 'client' | 'server';
    fingerprints: Array<{
      algorithm: string;
      value: string;
    }>;
  };
  connected: boolean;
}

export interface MockProducer {
  id: string;
  kind: 'video' | 'audio';
  transportId: string;
  rtpParameters: any;
  paused: boolean;
}

export interface MockConsumer {
  id: string;
  kind: 'video' | 'audio';
  transportId: string;
  producerId: string;
  rtpParameters: any;
  paused: boolean;
}

export class MockWebRTCServer extends EventEmitter {
  private transports: Map<string, MockTransport> = new Map();
  private producers: Map<string, MockProducer> = new Map();
  private consumers: Map<string, MockConsumer> = new Map();

  /**
   * Create a WebRTC transport
   */
  createTransport(direction: 'send' | 'recv'): MockTransport {
    const transport: MockTransport = {
      id: this.generateId('transport'),
      direction,
      iceParameters: {
        usernameFragment: crypto.randomBytes(8).toString('hex'),
        password: crypto.randomBytes(16).toString('hex'),
        iceLite: true,
      },
      iceCandidates: [
        {
          foundation: 'udpcandidate',
          priority: 1679819007,
          ip: '192.168.1.100',
          protocol: 'udp',
          port: 10000,
          type: 'host',
        },
      ],
      dtlsParameters: {
        role: 'auto',
        fingerprints: [
          {
            algorithm: 'sha-256',
            value: this.generateFingerprint(),
          },
        ],
      },
      connected: false,
    };

    this.transports.set(transport.id, transport);
    this.emit('transport_created', transport);

    return transport;
  }

  /**
   * Connect a transport
   */
  connectTransport(transportId: string, dtlsParameters: any): boolean {
    const transport = this.transports.get(transportId);

    if (!transport) {
      throw new Error(`Transport ${transportId} not found`);
    }

    transport.connected = true;
    transport.dtlsParameters = {
      ...transport.dtlsParameters,
      ...dtlsParameters,
    };

    this.emit('transport_connected', transport);

    return true;
  }

  /**
   * Create a producer (send media)
   */
  createProducer(transportId: string, kind: 'video' | 'audio', rtpParameters: any): MockProducer {
    const transport = this.transports.get(transportId);

    if (!transport) {
      throw new Error(`Transport ${transportId} not found`);
    }

    if (!transport.connected) {
      throw new Error(`Transport ${transportId} is not connected`);
    }

    const producer: MockProducer = {
      id: this.generateId('producer'),
      kind,
      transportId,
      rtpParameters,
      paused: false,
    };

    this.producers.set(producer.id, producer);
    this.emit('producer_created', producer);

    return producer;
  }

  /**
   * Create a consumer (receive media)
   */
  createConsumer(
    transportId: string,
    producerId: string,
    kind: 'video' | 'audio',
    rtpParameters: any
  ): MockConsumer {
    const transport = this.transports.get(transportId);
    const producer = this.producers.get(producerId);

    if (!transport) {
      throw new Error(`Transport ${transportId} not found`);
    }

    if (!producer) {
      throw new Error(`Producer ${producerId} not found`);
    }

    const consumer: MockConsumer = {
      id: this.generateId('consumer'),
      kind,
      transportId,
      producerId,
      rtpParameters,
      paused: false,
    };

    this.consumers.set(consumer.id, consumer);
    this.emit('consumer_created', consumer);

    return consumer;
  }

  /**
   * Pause a producer
   */
  pauseProducer(producerId: string): void {
    const producer = this.producers.get(producerId);

    if (!producer) {
      throw new Error(`Producer ${producerId} not found`);
    }

    producer.paused = true;
    this.emit('producer_paused', producer);
  }

  /**
   * Resume a producer
   */
  resumeProducer(producerId: string): void {
    const producer = this.producers.get(producerId);

    if (!producer) {
      throw new Error(`Producer ${producerId} not found`);
    }

    producer.paused = false;
    this.emit('producer_resumed', producer);
  }

  /**
   * Close a producer
   */
  closeProducer(producerId: string): void {
    const producer = this.producers.get(producerId);

    if (!producer) {
      throw new Error(`Producer ${producerId} not found`);
    }

    this.producers.delete(producerId);
    this.emit('producer_closed', producer);
  }

  /**
   * Close a transport
   */
  closeTransport(transportId: string): void {
    const transport = this.transports.get(transportId);

    if (!transport) {
      throw new Error(`Transport ${transportId} not found`);
    }

    // Close all producers using this transport
    this.producers.forEach((producer) => {
      if (producer.transportId === transportId) {
        this.producers.delete(producer.id);
      }
    });

    // Close all consumers using this transport
    this.consumers.forEach((consumer) => {
      if (consumer.transportId === transportId) {
        this.consumers.delete(consumer.id);
      }
    });

    this.transports.delete(transportId);
    this.emit('transport_closed', transport);
  }

  /**
   * Get transport by ID
   */
  getTransport(transportId: string): MockTransport | undefined {
    return this.transports.get(transportId);
  }

  /**
   * Get producer by ID
   */
  getProducer(producerId: string): MockProducer | undefined {
    return this.producers.get(producerId);
  }

  /**
   * Get all producers for a transport
   */
  getProducersForTransport(transportId: string): MockProducer[] {
    const producers: MockProducer[] = [];

    this.producers.forEach((producer) => {
      if (producer.transportId === transportId) {
        producers.push(producer);
      }
    });

    return producers;
  }

  /**
   * Simulate connection state changes
   */
  simulateConnectionState(
    transportId: string,
    state: 'connecting' | 'connected' | 'disconnected' | 'failed'
  ): void {
    const transport = this.transports.get(transportId);

    if (transport) {
      this.emit('connection_state_change', { transportId, state });
    }
  }

  /**
   * Simulate stats for testing
   */
  getStats(producerId: string): any {
    const producer = this.producers.get(producerId);

    if (!producer) {
      return null;
    }

    return {
      id: producerId,
      kind: producer.kind,
      bytesSent: Math.floor(Math.random() * 1000000),
      packetsSent: Math.floor(Math.random() * 10000),
      packetsLost: Math.floor(Math.random() * 100),
      bitrate: Math.floor(Math.random() * 2000000), // Random bitrate up to 2Mbps
      framerate: producer.kind === 'video' ? 30 : undefined,
      resolution:
        producer.kind === 'video'
          ? { width: 1280, height: 720 }
          : undefined,
      timestamp: Date.now(),
    };
  }

  /**
   * Reset mock server state
   */
  reset(): void {
    this.transports.clear();
    this.producers.clear();
    this.consumers.clear();
    this.emit('reset');
  }

  /**
   * Generate a unique ID with prefix
   */
  private generateId(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Generate a random DTLS fingerprint
   */
  private generateFingerprint(): string {
    const bytes = crypto.randomBytes(32);
    return bytes
      .toString('hex')
      .match(/.{1,2}/g)!
      .join(':')
      .toUpperCase();
  }
}

// Create singleton instance
let mockWebRTCInstance: MockWebRTCServer | null = null;

/**
 * Get or create mock WebRTC server instance
 */
export function getMockWebRTCServer(): MockWebRTCServer {
  if (!mockWebRTCInstance) {
    mockWebRTCInstance = new MockWebRTCServer();
  }
  return mockWebRTCInstance;
}

/**
 * Reset mock WebRTC server
 */
export function resetMockWebRTCServer(): void {
  if (mockWebRTCInstance) {
    mockWebRTCInstance.reset();
  } else {
    mockWebRTCInstance = new MockWebRTCServer();
  }
}

export default MockWebRTCServer;
