/**
 * Pool Configuration for Session Service
 */

export interface ServicePoolConfig {
  connectionLimit: number;
  connectTimeout: number;
  idleTimeout: number;
}

export const SERVICE_POOL_CONFIGS: Record<string, ServicePoolConfig> = {
  'session-service': {
    connectionLimit: 20,
    connectTimeout: 10000,
    idleTimeout: 30000,
  },
  'auth-service': {
    connectionLimit: 10,
    connectTimeout: 10000,
    idleTimeout: 30000,
  },
  'api-gateway': {
    connectionLimit: 15,
    connectTimeout: 10000,
    idleTimeout: 30000,
  },
};
