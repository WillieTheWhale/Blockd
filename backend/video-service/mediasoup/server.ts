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
    preferredPayloadType: 111,
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    preferredPayloadType: 96,
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/VP9',
    preferredPayloadType: 98,
    clockRate: 90000,
    parameters: {
      'profile-id': 2,
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/h264',
    preferredPayloadType: 125,
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

  // Get detailed stats for a session
  app.get('/sessions/:sessionId/stats', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const router = routers.get(sessionId);

      if (!router) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Collect stats from all transports, producers, and consumers for this session
      const stats: any = {
        sessionId,
        timestamp: new Date().toISOString(),
        transports: [],
        producers: [],
        consumers: [],
      };

      // Get transport stats
      for (const [id, transport] of transports.entries()) {
        try {
          const transportStats = await transport.getStats();
          stats.transports.push({
            id,
            stats: transportStats,
          });
        } catch (e) {
          console.error(`Error getting stats for transport ${id}:`, e);
        }
      }

      // Get producer stats
      for (const [id, producer] of producers.entries()) {
        try {
          const producerStats = await producer.getStats();
          stats.producers.push({
            id,
            kind: producer.kind,
            paused: producer.paused,
            stats: producerStats,
          });
        } catch (e) {
          console.error(`Error getting stats for producer ${id}:`, e);
        }
      }

      // Get consumer stats
      for (const [id, consumer] of consumers.entries()) {
        try {
          const consumerStats = await consumer.getStats();
          stats.consumers.push({
            id,
            kind: consumer.kind,
            paused: consumer.paused,
            producerPaused: consumer.producerPaused,
            stats: consumerStats,
          });
        } catch (e) {
          console.error(`Error getting stats for consumer ${id}:`, e);
        }
      }

      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get aggregate stats across all sessions
  app.get('/stats', async (req, res) => {
    try {
      // Aggregate stats
      let totalBytesReceived = 0;
      let totalBytesSent = 0;
      let totalPacketsReceived = 0;
      let totalPacketsSent = 0;
      let totalPacketsLost = 0;
      let activeProducers = 0;
      let activeConsumers = 0;

      // Collect from all producers
      for (const producer of producers.values()) {
        try {
          const stats = await producer.getStats();
          for (const stat of stats) {
            if (stat.type === 'inbound-rtp') {
              totalBytesReceived += stat.bytesReceived || 0;
              totalPacketsReceived += stat.packetsReceived || 0;
              totalPacketsLost += stat.packetsLost || 0;
            }
          }
          if (!producer.paused) {
            activeProducers++;
          }
        } catch (e) {
          // Ignore stats errors
        }
      }

      // Collect from all consumers
      for (const consumer of consumers.values()) {
        try {
          const stats = await consumer.getStats();
          for (const stat of stats) {
            if (stat.type === 'outbound-rtp') {
              totalBytesSent += stat.bytesSent || 0;
              totalPacketsSent += stat.packetsSent || 0;
            }
          }
          if (!consumer.paused) {
            activeConsumers++;
          }
        } catch (e) {
          // Ignore stats errors
        }
      }

      // Calculate packet loss rate
      const totalPackets = totalPacketsReceived + totalPacketsLost;
      const packetLossRate = totalPackets > 0 ? (totalPacketsLost / totalPackets) * 100 : 0;

      res.json({
        timestamp: new Date().toISOString(),
        workers: workers.length,
        activeSessions: routers.size,
        transports: {
          total: transports.size,
        },
        producers: {
          total: producers.size,
          active: activeProducers,
        },
        consumers: {
          total: consumers.size,
          active: activeConsumers,
        },
        bandwidth: {
          bytesReceived: totalBytesReceived,
          bytesSent: totalBytesSent,
          mbpsReceived: (totalBytesReceived * 8) / 1000000,
          mbpsSent: (totalBytesSent * 8) / 1000000,
        },
        packets: {
          received: totalPacketsReceived,
          sent: totalPacketsSent,
          lost: totalPacketsLost,
          lossRate: packetLossRate.toFixed(2) + '%',
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get stats for a specific producer
  app.get('/producers/:producerId/stats', async (req, res) => {
    try {
      const { producerId } = req.params;
      const producer = producers.get(producerId);

      if (!producer) {
        return res.status(404).json({ error: 'Producer not found' });
      }

      const stats = await producer.getStats();

      res.json({
        producerId,
        kind: producer.kind,
        type: producer.type,
        paused: producer.paused,
        score: producer.score,
        stats,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get stats for a specific consumer
  app.get('/consumers/:consumerId/stats', async (req, res) => {
    try {
      const { consumerId } = req.params;
      const consumer = consumers.get(consumerId);

      if (!consumer) {
        return res.status(404).json({ error: 'Consumer not found' });
      }

      const stats = await consumer.getStats();

      res.json({
        consumerId,
        kind: consumer.kind,
        type: consumer.type,
        paused: consumer.paused,
        producerPaused: consumer.producerPaused,
        score: consumer.score,
        preferredLayers: consumer.preferredLayers,
        currentLayers: consumer.currentLayers,
        stats,
      });
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
