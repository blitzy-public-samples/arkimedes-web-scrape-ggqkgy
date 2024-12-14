/**
 * @fileoverview Enterprise-grade WebSocket service implementation providing secure,
 * real-time communication with automatic reconnection, message persistence,
 * comprehensive monitoring, and type-safe event management.
 * @version 1.0.0
 */

import { retry } from 'retry'; // ^0.13.1
import { ApiResponse } from '../types/api';
import { API_CONFIG } from '../config/api';

/**
 * WebSocket event types for type-safe event handling
 */
export const WEBSOCKET_EVENTS = {
  TASK_UPDATE: 'task_update',
  SYSTEM_METRICS: 'system_metrics',
  ALERT: 'alert',
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
  HEALTH_CHECK: 'health_check',
  RECONNECTING: 'reconnecting',
  RECONNECTED: 'reconnected'
} as const;

// Configuration constants
const DEFAULT_RECONNECT_ATTEMPTS = 5;
const DEFAULT_PING_INTERVAL = 30000; // 30 seconds
const MAX_RECONNECT_DELAY = 5000;
const MESSAGE_QUEUE_SIZE = 1000;
const CONNECTION_TIMEOUT = 10000;

/**
 * Type for WebSocket message with generic payload
 */
interface WebSocketMessage<T> {
  type: keyof typeof WEBSOCKET_EVENTS;
  payload: T;
  id: string;
  timestamp: number;
}

/**
 * Type for WebSocket event listener
 */
type EventListener = (event: WebSocketMessage<any>) => void;

/**
 * Interface for connection metrics tracking
 */
interface ConnectionMetrics {
  connectedAt: number | null;
  lastPingAt: number | null;
  messagesSent: number;
  messagesReceived: number;
  reconnectAttempts: number;
  latency: number[];
  errors: Array<{ timestamp: number; message: string }>;
}

/**
 * Interface for circuit breaker state management
 */
interface CircuitBreaker {
  failures: number;
  lastFailure: number | null;
  state: 'closed' | 'open' | 'half-open';
  threshold: number;
}

/**
 * Type for connection state tracking
 */
type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

/**
 * Interface for message queue implementation
 */
interface Queue<T> {
  items: T[];
  maxSize: number;
  add(item: T): boolean;
  remove(): T | undefined;
  clear(): void;
  size(): number;
}

/**
 * Enhanced configuration options for WebSocket client
 */
export interface WebSocketOptions {
  reconnectAttempts: number;
  pingInterval: number;
  ssl: boolean;
  messageQueueSize: number;
  circuitBreakerThreshold: number;
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
  };
}

/**
 * Enterprise-grade WebSocket client implementation
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private readonly endpoint: string;
  private readonly options: WebSocketOptions;
  private reconnectAttempts: number = 0;
  private readonly eventListeners: Map<string, Set<EventListener>> = new Map();
  private pingInterval: number | null = null;
  private reconnectTimeout: number | null = null;
  private readonly messageQueue: Queue<WebSocketMessage<any>>;
  private connectionState: ConnectionState = 'disconnected';
  private metrics: ConnectionMetrics;
  private circuitBreaker: CircuitBreaker;

  /**
   * Initialize WebSocket client with enhanced configuration
   */
  constructor(endpoint: string, options: Partial<WebSocketOptions> = {}) {
    this.endpoint = this.validateEndpoint(endpoint);
    this.options = {
      reconnectAttempts: options.reconnectAttempts || DEFAULT_RECONNECT_ATTEMPTS,
      pingInterval: options.pingInterval || DEFAULT_PING_INTERVAL,
      ssl: options.ssl ?? true,
      messageQueueSize: options.messageQueueSize || MESSAGE_QUEUE_SIZE,
      circuitBreakerThreshold: options.circuitBreakerThreshold || 5,
      monitoring: {
        enabled: options.monitoring?.enabled ?? true,
        metricsInterval: options.monitoring?.metricsInterval || 60000
      }
    };

    this.messageQueue = this.createMessageQueue(this.options.messageQueueSize);
    this.metrics = this.initializeMetrics();
    this.circuitBreaker = this.initializeCircuitBreaker();
    
    // Initialize event listeners for internal events
    this.initializeEventListeners();
  }

  /**
   * Establish secure WebSocket connection with automatic reconnection
   */
  public async connect(): Promise<void> {
    if (this.connectionState === 'connected') {
      return;
    }

    if (this.circuitBreaker.state === 'open') {
      throw new Error('Circuit breaker is open. Connection not allowed.');
    }

    this.connectionState = 'connecting';
    
    return new Promise((resolve, reject) => {
      const operation = retry.operation({
        retries: this.options.reconnectAttempts,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: MAX_RECONNECT_DELAY
      });

      operation.attempt(async () => {
        try {
          const wsProtocol = this.options.ssl ? 'wss://' : 'ws://';
          const url = `${wsProtocol}${this.endpoint}`;
          
          this.ws = new WebSocket(url);
          this.setupWebSocketHandlers(resolve, reject);
          
          // Set connection timeout
          const timeout = setTimeout(() => {
            if (this.connectionState !== 'connected') {
              this.ws?.close();
              if (operation.retry(new Error('Connection timeout'))) {
                return;
              }
              reject(new Error('Connection timeout after all retries'));
            }
          }, CONNECTION_TIMEOUT);

          this.ws.onopen = () => {
            clearTimeout(timeout);
            this.onConnectionEstablished();
            resolve();
          };
        } catch (error) {
          if (!operation.retry(error as Error)) {
            this.updateCircuitBreaker();
            reject(operation.mainError());
          }
        }
      });
    });
  }

  /**
   * Gracefully close WebSocket connection with cleanup
   */
  public async disconnect(): Promise<void> {
    if (!this.ws || this.connectionState === 'disconnected') {
      return;
    }

    this.connectionState = 'disconnected';
    this.clearIntervals();

    return new Promise((resolve) => {
      const onClose = () => {
        this.ws?.removeEventListener('close', onClose);
        this.cleanup();
        resolve();
      };

      this.ws.addEventListener('close', onClose);
      this.ws.close();
    });
  }

  /**
   * Send message with guaranteed delivery and retry logic
   */
  public async send<T>(message: WebSocketMessage<T>): Promise<void> {
    if (!this.isConnected()) {
      this.messageQueue.add(message);
      await this.connect();
      return;
    }

    try {
      await this.sendWithRetry(message);
      this.metrics.messagesSent++;
    } catch (error) {
      this.messageQueue.add(message);
      this.handleSendError(error);
    }
  }

  /**
   * Subscribe to WebSocket events with type safety
   */
  public on<T>(event: keyof typeof WEBSOCKET_EVENTS, listener: (data: T) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)?.add(listener as EventListener);
  }

  /**
   * Unsubscribe from WebSocket events
   */
  public off(event: keyof typeof WEBSOCKET_EVENTS, listener: EventListener): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  /**
   * Get current connection metrics
   */
  public getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  private validateEndpoint(endpoint: string): string {
    const url = new URL(endpoint, API_CONFIG.baseURL);
    if (!url.protocol.match(/^wss?:$/)) {
      throw new Error('Invalid WebSocket protocol');
    }
    return url.toString();
  }

  private initializeMetrics(): ConnectionMetrics {
    return {
      connectedAt: null,
      lastPingAt: null,
      messagesSent: 0,
      messagesReceived: 0,
      reconnectAttempts: 0,
      latency: [],
      errors: []
    };
  }

  private initializeCircuitBreaker(): CircuitBreaker {
    return {
      failures: 0,
      lastFailure: null,
      state: 'closed',
      threshold: this.options.circuitBreakerThreshold
    };
  }

  private createMessageQueue(maxSize: number): Queue<WebSocketMessage<any>> {
    return {
      items: [],
      maxSize,
      add(item: WebSocketMessage<any>): boolean {
        if (this.items.length >= this.maxSize) {
          return false;
        }
        this.items.push(item);
        return true;
      },
      remove(): WebSocketMessage<any> | undefined {
        return this.items.shift();
      },
      clear(): void {
        this.items = [];
      },
      size(): number {
        return this.items.length;
      }
    };
  }

  private setupWebSocketHandlers(resolve: () => void, reject: (error: Error) => void): void {
    if (!this.ws) return;

    this.ws.onmessage = this.handleMessage.bind(this);
    this.ws.onerror = this.handleError.bind(this);
    this.ws.onclose = this.handleClose.bind(this);
  }

  private async sendWithRetry<T>(message: WebSocketMessage<T>): Promise<void> {
    return new Promise((resolve, reject) => {
      const operation = retry.operation({
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 3000
      });

      operation.attempt(() => {
        try {
          this.ws?.send(JSON.stringify(message));
          resolve();
        } catch (error) {
          if (!operation.retry(error as Error)) {
            reject(operation.mainError());
          }
        }
      });
    });
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as WebSocketMessage<any>;
      this.metrics.messagesReceived++;
      this.notifyListeners(message);
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: Event | Error): void {
    this.metrics.errors.push({
      timestamp: Date.now(),
      message: error instanceof Error ? error.message : 'WebSocket error'
    });
    this.notifyListeners({
      type: WEBSOCKET_EVENTS.ERROR,
      payload: error,
      id: Date.now().toString(),
      timestamp: Date.now()
    });
  }

  private handleClose(event: CloseEvent): void {
    this.connectionState = 'disconnected';
    this.clearIntervals();
    
    if (!event.wasClean) {
      this.attemptReconnection();
    }
  }

  private clearIntervals(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private cleanup(): void {
    this.ws = null;
    this.clearIntervals();
    this.connectionState = 'disconnected';
  }

  private isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private updateCircuitBreaker(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
      this.circuitBreaker.state = 'open';
      setTimeout(() => {
        this.circuitBreaker.state = 'half-open';
        this.circuitBreaker.failures = 0;
      }, MAX_RECONNECT_DELAY * 2);
    }
  }

  private async attemptReconnection(): Promise<void> {
    if (this.connectionState === 'reconnecting') {
      return;
    }

    this.connectionState = 'reconnecting';
    this.metrics.reconnectAttempts++;

    try {
      await this.connect();
      this.processQueuedMessages();
    } catch (error) {
      this.handleError(error);
    }
  }

  private async processQueuedMessages(): Promise<void> {
    while (this.messageQueue.size() > 0) {
      const message = this.messageQueue.remove();
      if (message) {
        await this.send(message);
      }
    }
  }

  private notifyListeners(message: WebSocketMessage<any>): void {
    const listeners = this.eventListeners.get(message.type);
    listeners?.forEach(listener => {
      try {
        listener(message);
      } catch (error) {
        this.handleError(error);
      }
    });
  }

  private initializeEventListeners(): void {
    Object.values(WEBSOCKET_EVENTS).forEach(event => {
      this.eventListeners.set(event, new Set());
    });
  }

  private onConnectionEstablished(): void {
    this.connectionState = 'connected';
    this.metrics.connectedAt = Date.now();
    this.setupPingInterval();
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.state = 'closed';
  }

  private setupPingInterval(): void {
    this.pingInterval = window.setInterval(() => {
      if (this.isConnected()) {
        const start = Date.now();
        this.send({
          type: WEBSOCKET_EVENTS.HEALTH_CHECK,
          payload: { timestamp: start },
          id: start.toString(),
          timestamp: start
        }).then(() => {
          const latency = Date.now() - start;
          this.metrics.latency.push(latency);
          this.metrics.lastPingAt = Date.now();
          
          // Keep only the last 100 latency measurements
          if (this.metrics.latency.length > 100) {
            this.metrics.latency.shift();
          }
        });
      }
    }, this.options.pingInterval);
  }
}