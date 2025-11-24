/**
 * Server Entry Point
 * Blockd Auth Service
 */

import { createApp } from './app';
import { config, validateConfig } from './config';

/**
 * Start the server
 */
async function start(): Promise<void> {
  try {
    console.log('🚀 Starting Blockd Authentication Service...\n');

    // Validate configuration
    validateConfig();

    // Create Fastify app
    const app = await createApp();

    // Start server
    await app.listen({
      port: config.port,
      host: config.host
    });

    console.log('\n✅ Server started successfully!\n');
    console.log(`📍 Server running at: http://${config.host}:${config.port}`);
    console.log(`🌍 Environment: ${config.nodeEnv}`);
    console.log(`🔒 CORS Origin: ${config.cors.origin}`);
    console.log(`📊 Rate Limiting: ${config.rateLimiting.enabled ? 'Enabled' : 'Disabled'}`);
    console.log('\n📋 Available endpoints:');
    console.log('   GET  /health');
    console.log('   POST /auth/register');
    console.log('   POST /auth/login');
    console.log('   POST /auth/logout');
    console.log('   POST /auth/verify-email');
    console.log('   POST /auth/password-reset/request');
    console.log('   POST /auth/password-reset/confirm');
    console.log('   POST /auth/mfa/setup');
    console.log('   POST /auth/mfa/verify');
    console.log('   POST /auth/mfa/verify-login');
    console.log('   POST /auth/mfa/disable');
    console.log('   GET  /auth/mfa/status');
    console.log('   GET  /auth/oauth/google');
    console.log('   GET  /auth/oauth/google/callback');
    console.log('   GET  /auth/oauth/microsoft');
    console.log('   GET  /auth/oauth/microsoft/callback');
    console.log('   POST /auth/refresh');
    console.log('   POST /auth/revoke');
    console.log('   POST /auth/revoke-all');
    console.log('   GET  /auth/sessions');
    console.log('   POST /auth/verify-token\n');

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`\n📛 Received ${signal}, closing server...`);

        try {
          await app.close();
          console.log('✅ Server closed gracefully');
          process.exit(0);
        } catch (error) {
          console.error('❌ Error closing server:', error);
          process.exit(1);
        }
      });
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
start();
