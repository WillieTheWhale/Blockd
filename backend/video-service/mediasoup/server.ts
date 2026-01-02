/**
 * mediasoup Server - WebRTC SFU Implementation
 * Manages Workers, Routers, and WebRTC connections
 */

import * as mediasoup from 'mediasoup';
import * as os from 'os';
import express from 'express';
import { Server } from 'http';
import cors from 'cors';

// Types
import {
  Worker,
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  RtpCodecCapability,
} from 'mediasoup/node/lib/types';

// Configuration
const config = {
  listenIp: process.env.MEDIASOUP_HOST || 'localhost',
  listenPort: parseInt(process.env.MEDIASOUP_PORT || '3000'),
  announcedIp: process.env.ANNOUNCED_IP || '127.0.0.1',
  rtcMinPort: parseInt(process.env.RTC_MIN_PORT || '10000'),
  rtcMaxPort: parseInt(process.env.RTC_MAX_PORT || '10100'),
};

// Media codecs configuration
const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/VP9',
    clockRate: 90000,
    parameters: {
      'profile-id': 2,
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/h264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '4d0032',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1000,
    },
  },
];

// Global state
const workers: Worker[] = [];
const routers = new Map<string, Router>();
const transports = new Map<string, WebRtcTransport>();
const producers = new Map<string, Producer>();
const consumers = new Map<string, Consumer>();

// Session to router mapping
const sessionRouters = new Map<string, string>();

let nextWorkerIdx = 0;

/**
 * Get next worker in round-robin fashion
 */
function getNextWorker(): Worker {
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}

/**
 * Create mediasoup workers (one per CPU core)
 */
async function createWorkers(): Promise<void> {
  const numWorkers = os.cpus().length;
  console.log(`Creating ${numWorkers} mediasoup workers...`);

  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: 'warn',
      logTags: [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp',
      ],
      rtcMinPort: config.rtcMinPort,
      rtcMaxPort: config.rtcMaxPort,
    });

    worker.on('died', () => {
      console.error(`Worker ${worker.pid} died, exiting in 2 seconds...`);
      setTimeout(() => process.exit(1), 2000);
    });

    workers.push(worker);
    console.log(`Worker ${i + 1}/${numWorkers} created (PID: ${worker.pid})`);
  }

  console.log('All workers created successfully');
}

/**
 * Create router for a session
 */
async function createRouter(sessionId: string): Promise<Router> {
  const worker = getNextWorker();

  const router = await worker.createRouter({
    mediaCodecs,
  });

  routers.set(sessionId, router);
  sessionRouters.set(sessionId, sessionId);

  console.log(`Router created for session ${sessionId}`);
  return router;
}

/**
 * Get or create router for session
 */
async function getOrCreateRouter(sessionId: string): Promise<Router> {
  let router = routers.get(sessionId);

  if (!router) {
    router = await createRouter(sessionId);
  }

  return router;
}

/**
 * Create WebRTC transport
 */
async function createWebRtcTransport(
  sessionId: string,
  direction: 'send' | 'recv'
): Promise<any> {
  const router = await getOrCreateRouter(sessionId);

  const transport = await router.createWebRtcTransport({
    listenIps: [
      {
        ip: '0.0.0.0',
        announcedIp: config.announcedIp,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  transports.set(transport.id, transport);

  console.log(
    `WebRTC ${direction} transport created for session ${sessionId}: ${transport.id}`
  );

  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}

/**
 * Connect transport
 */
async function connectTransport(
  transportId: string,
  dtlsParameters: any
): Promise<void> {
  const transport = transports.get(transportId);

  if (!transport) {
    throw new Error(`Transport ${transportId} not found`);
  }

  await transport.connect({ dtlsParameters });
  console.log(`Transport ${transportId} connected`);
}

/**
 * Create producer
 */
async function createProducer(
  transportId: string,
  kind: 'audio' | 'video',
  rtpParameters: any
): Promise<string> {
  const transport = transports.get(transportId);

  if (!transport) {
    throw new Error(`Transport ${transportId} not found`);
  }

  const producer = await transport.produce({
    kind,
    rtpParameters,
  });

  producers.set(producer.id, producer);

  producer.on('transportclose', () => {
    console.log(`Producer ${producer.id} transport closed`);
    producers.delete(producer.id);
  });

  console.log(`Producer created: ${producer.id} (${kind})`);
  return producer.id;
}

/**
 * Create consumer
 */
async function createConsumer(
  transportId: string,
  producerId: string,
  rtpCapabilities: any
): Promise<any> {
  const transport = transports.get(transportId);
  const producer = producers.get(producerId);

  if (!transport) {
    throw new Error(`Transport ${transportId} not found`);
  }

  if (!producer) {
    throw new Error(`Producer ${producerId} not found`);
  }

  const router = routers.get(
    Array.from(sessionRouters.entries()).find(([_, routerId]) =>
      routers.get(routerId)?.canConsume({ producerId, rtpCapabilities })
    )?.[0] || ''
  );

  if (!router) {
    throw new Error('No router can consume this producer');
  }

  if (!router.canConsume({ producerId, rtpCapabilities })) {
    throw new Error('Cannot consume producer with given RTP capabilities');
  }

  const consumer = await transport.consume({
    producerId,
    rtpCapabilities,
    paused: true,
  });

  consumers.set(consumer.id, consumer);

  consumer.on('transportclose', () => {
    console.log(`Consumer ${consumer.id} transport closed`);
    consumers.delete(consumer.id);
  });

  consumer.on('producerclose', () => {
    console.log(`Consumer ${consumer.id} producer closed`);
    consumers.delete(consumer.id);
  });

  console.log(`Consumer created: ${consumer.id}`);

  return {
    id: consumer.id,
    producerId: producer.id,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
  };
}

/**
 * Resume consumer
 */
async function resumeConsumer(consumerId: string): Promise<void> {
  const consumer = consumers.get(consumerId);

  if (!consumer) {
    throw new Error(`Consumer ${consumerId} not found`);
  }

  await consumer.resume();
  console.log(`Consumer ${consumerId} resumed`);
}

/**
 * Close session and cleanup resources
 */
async function closeSession(sessionId: string): Promise<void> {
  const router = routers.get(sessionId);

  if (router) {
    router.close();
    routers.delete(sessionId);
  }

  sessionRouters.delete(sessionId);

  // Clean up transports, producers, consumers for this session
  for (const [id, transport] of transports.entries()) {
    if (transport.appData.sessionId === sessionId) {
      transport.close();
      transports.delete(id);
    }
  }

  console.log(`Session ${sessionId} closed and cleaned up`);
}

/**
 * Initialize Express server
 */
async function createExpressApp(): Promise<Server> {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      workers: workers.length,
      routers: routers.size,
      transports: transports.size,
      producers: producers.size,
      consumers: consumers.size,
    });
  });

  // Get router RTP capabilities
  app.get('/routers/:sessionId/capabilities', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const router = await getOrCreateRouter(sessionId);
      res.json({ rtpCapabilities: router.rtpCapabilities });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create transport
  app.post('/transports', async (req, res) => {
    try {
      const { sessionId, direction } = req.body;
      const transportParams = await createWebRtcTransport(sessionId, direction);
      res.json(transportParams);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Connect transport
  app.post('/transports/:transportId/connect', async (req, res) => {
    try {
      const { transportId } = req.params;
      const { dtlsParameters } = req.body;
      await connectTransport(transportId, dtlsParameters);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create producer
  app.post('/transports/:transportId/produce', async (req, res) => {
    try {
      const { transportId } = req.params;
      const { kind, rtpParameters } = req.body;
      const producerId = await createProducer(transportId, kind, rtpParameters);
      res.json({ producerId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create consumer
  app.post('/transports/:transportId/consume', async (req, res) => {
    try {
      const { transportId } = req.params;
      const { producerId, rtpCapabilities } = req.body;
      const consumerParams = await createConsumer(
        transportId,
        producerId,
        rtpCapabilities
      );
      res.json(consumerParams);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Resume consumer
  app.post('/consumers/:consumerId/resume', async (req, res) => {
    try {
      const { consumerId } = req.params;
      await resumeConsumer(consumerId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Close session
  app.delete('/sessions/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      await closeSession(sessionId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const server = app.listen(config.listenPort, config.listenIp, () => {
    console.log(
      `mediasoup server listening on ${config.listenIp}:${config.listenPort}`
    );
  });

  return server;
}

/**
 * Main entry point
 */
async function main() {
  console.log('Starting mediasoup server...');

  try {
    await createWorkers();
    await createExpressApp();

    console.log('mediasoup server started successfully');
  } catch (error) {
    console.error('Failed to start mediasoup server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');

  // Close all routers
  for (const router of routers.values()) {
    router.close();
  }

  // Close all workers
  for (const worker of workers) {
    worker.close();
  }

  process.exit(0);
});

// Start server
main();
