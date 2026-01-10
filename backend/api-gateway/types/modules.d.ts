/**
 * Type declarations for missing or untyped modules
 */

// PDFKit module declaration
declare module 'pdfkit' {
  class PDFDocument {
    constructor(options?: {
      size?: string | [number, number];
      margin?: number;
      margins?: { top: number; bottom: number; left: number; right: number };
      bufferPages?: boolean;
      autoFirstPage?: boolean;
      info?: {
        Title?: string;
        Author?: string;
        Subject?: string;
        Keywords?: string;
        CreationDate?: Date;
        ModDate?: Date;
      };
    });

    pipe(destination: NodeJS.WritableStream): this;
    end(): void;

    // Event handling
    on(event: 'data', callback: (chunk: Buffer) => void): this;
    on(event: 'end', callback: () => void): this;
    on(event: 'error', callback: (error: Error) => void): this;
    on(event: string, callback: (...args: any[]) => void): this;

    font(name: string, size?: number): this;
    fontSize(size: number): this;
    fillColor(color: string): this;
    strokeColor(color: string): this;

    // Text methods - various overloads
    text(text: string, options?: {
      width?: number;
      height?: number;
      align?: 'left' | 'center' | 'right' | 'justify';
      lineGap?: number;
      paragraphGap?: number;
      continued?: boolean;
    }): this;
    text(text: string, x: number, y: number, options?: {
      width?: number;
      height?: number;
      align?: 'left' | 'center' | 'right' | 'justify';
      lineGap?: number;
      paragraphGap?: number;
      continued?: boolean;
    }): this;

    moveDown(lines?: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(): this;

    rect(x: number, y: number, width: number, height: number): this;
    fill(color?: string): this;
    fillAndStroke(fillColor?: string, strokeColor?: string): this;

    image(src: string | Buffer, x?: number, y?: number, options?: {
      width?: number;
      height?: number;
      fit?: [number, number];
    }): this;

    addPage(options?: {
      size?: string | [number, number];
      margin?: number;
    }): this;

    // Page buffering
    bufferedPageRange(): { start: number; count: number };
    switchToPage(pageNumber: number): this;

    page: {
      width: number;
      height: number;
    };

    x: number;
    y: number;
  }

  export = PDFDocument;
}

// IORedis module declaration (minimal for shared/cache usage)
declare module 'ioredis' {
  interface RedisOptions {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    maxRetriesPerRequest?: number | null;
    retryStrategy?: (times: number) => number | void | null;
    enableReadyCheck?: boolean;
    enableOfflineQueue?: boolean;
    lazyConnect?: boolean;
    tls?: object;
    family?: 4 | 6;
    connectTimeout?: number;
    commandTimeout?: number;
  }

  interface ClusterOptions {
    clusterRetryStrategy?: (times: number) => number | void | null;
    redisOptions?: RedisOptions;
    scaleReads?: 'master' | 'slave' | 'all';
    maxRedirections?: number;
    retryDelayOnFailover?: number;
    retryDelayOnClusterDown?: number;
    retryDelayOnTryAgain?: number;
    retryDelayOnMoved?: number;
    slotsRefreshTimeout?: number;
    slotsRefreshInterval?: number;
    enableOfflineQueue?: boolean;
    enableReadyCheck?: boolean;
    natMap?: Record<string, { host: string; port: number }>;
    dnsLookup?: (hostname: string, callback: (err: Error | null, address: string, family?: number) => void) => void;
  }

  interface Pipeline {
    exec(): Promise<[Error | null, any][]>;
    set(key: string, value: string, ...args: (string | number)[]): Pipeline;
    setex(key: string, seconds: number, value: string): Pipeline;
    get(key: string): Pipeline;
    del(...keys: string[]): Pipeline;
  }

  class Redis {
    constructor(options?: RedisOptions);
    constructor(port?: number, host?: string, options?: RedisOptions);
    constructor(url: string, options?: RedisOptions);

    // Static Cluster class
    static Cluster: typeof Cluster;

    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: (string | number)[]): Promise<string>;
    setex(key: string, seconds: number, value: string): Promise<string>;
    mget(...keys: string[]): Promise<(string | null)[]>;
    del(...keys: string[]): Promise<number>;
    exists(...keys: string[]): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    ttl(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    incrby(key: string, increment: number): Promise<number>;
    hget(key: string, field: string): Promise<string | null>;
    hset(key: string, field: string, value: string): Promise<number>;
    hgetall(key: string): Promise<Record<string, string>>;
    hdel(key: string, ...fields: string[]): Promise<number>;
    zadd(key: string, ...args: (string | number)[]): Promise<number>;
    zrangebyscore(key: string, min: number | string, max: number | string, ...args: string[]): Promise<string[]>;
    zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
    eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<any>;
    evalsha(sha: string, numkeys: number, ...args: (string | number)[]): Promise<any>;
    script(command: 'load', script: string): Promise<string>;
    ping(): Promise<string>;
    info(section?: string): Promise<string>;
    keys(pattern: string): Promise<string[]>;
    scan(cursor: string | number, ...args: string[]): Promise<[string, string[]]>;
    pipeline(): Pipeline;
    multi(): Pipeline;
    flushall(): Promise<string>;

    on(event: 'connect' | 'ready' | 'error' | 'close' | 'reconnecting' | 'end' | '+node' | '-node' | 'node error', listener: (...args: any[]) => void): this;

    disconnect(): Promise<void>;
    quit(): Promise<string>;

    status: string;
  }

  class Cluster extends Redis {
    constructor(startupNodes: { host: string; port: number }[], options?: ClusterOptions);
    cluster(command: string, ...args: any[]): Promise<any>;
  }

  export { Redis, Cluster, RedisOptions, ClusterOptions };
  export default Redis;
}
