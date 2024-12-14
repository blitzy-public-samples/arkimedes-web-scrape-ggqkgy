/**
 * @fileoverview Custom React hook for managing WebSocket connections with automatic reconnection,
 * event handling, and real-time updates for task status, system metrics, and alerts.
 * Implements enterprise-grade connection management with comprehensive error handling.
 * @version 1.0.0
 */

import { useEffect, useCallback, useRef } from 'react'; // v18.2.0
import { useLatest } from 'react-use'; // v17.4.0
import { WebSocketClient, WEBSOCKET_EVENTS } from '../services/websocket';

// Constants for WebSocket configuration
const DEFAULT_RECONNECT_ATTEMPTS = 5;
const DEFAULT_PING_INTERVAL = 30000; // 30 seconds
const DEFAULT_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

/**
 * Interface for WebSocket connection options
 */
export interface WebSocketOptions {
  reconnectAttempts?: number;
  pingInterval?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: WebSocketError) => void;
  onReconnect?: (attempt: number) => void;
}

/**
 * Generic interface for typed WebSocket messages
 */
export interface WebSocketMessage<T> {
  type: string;
  payload: T;
  timestamp: string;
  id: string;
  metadata?: Record<string, unknown>;
}

/**
 * Interface for WebSocket error handling
 */
export interface WebSocketError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Type for WebSocket connection state
 */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

/**
 * Custom hook for managing WebSocket connections with automatic reconnection and event handling
 * @param endpoint - WebSocket endpoint URL
 * @param options - WebSocket connection options
 */
export function useWebSocket(endpoint: string, options: WebSocketOptions = {}) {
  // Create mutable ref for WebSocket client instance
  const wsRef = useRef<WebSocketClient | null>(null);
  const optionsRef = useLatest(options);

  // Connection state management
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastError, setLastError] = useState<WebSocketError | null>(null);

  /**
   * Initialize WebSocket client with configuration
   */
  const initializeWebSocket = useCallback(() => {
    if (wsRef.current) {
      return;
    }

    const wsOptions = {
      reconnectAttempts: options.reconnectAttempts ?? DEFAULT_RECONNECT_ATTEMPTS,
      pingInterval: options.pingInterval ?? DEFAULT_PING_INTERVAL,
      ssl: endpoint.startsWith('wss://'),
      messageQueueSize: 1000,
      circuitBreakerThreshold: 5,
      monitoring: {
        enabled: true,
        metricsInterval: 60000
      }
    };

    wsRef.current = new WebSocketClient(endpoint, wsOptions);
  }, [endpoint, options]);

  /**
   * Handle WebSocket connection state changes
   */
  const handleConnectionStateChange = useCallback((state: ConnectionState) => {
    setConnectionState(state);
    
    switch (state) {
      case 'connected':
        optionsRef.current.onConnect?.();
        break;
      case 'disconnected':
        optionsRef.current.onDisconnect?.();
        break;
      case 'reconnecting':
        optionsRef.current.onReconnect?.(wsRef.current?.getMetrics().reconnectAttempts ?? 0);
        break;
    }
  }, [optionsRef]);

  /**
   * Handle WebSocket errors
   */
  const handleError = useCallback((error: Error | Event) => {
    const wsError: WebSocketError = {
      code: 'WS_ERROR',
      message: error instanceof Error ? error.message : 'WebSocket error occurred',
      details: { timestamp: new Date().toISOString() }
    };
    
    setLastError(wsError);
    optionsRef.current.onError?.(wsError);
  }, [optionsRef]);

  /**
   * Send message through WebSocket connection
   */
  const sendMessage = useCallback(async <T>(message: WebSocketMessage<T>): Promise<void> => {
    if (!wsRef.current) {
      throw new Error('WebSocket connection not initialized');
    }

    try {
      await wsRef.current.send(message);
    } catch (error) {
      handleError(error as Error);
      throw error;
    }
  }, [handleError]);

  /**
   * Add event listener for WebSocket messages
   */
  const addEventListener = useCallback((event: string, handler: (data: any) => void) => {
    wsRef.current?.on(event, handler);
  }, []);

  /**
   * Remove event listener for WebSocket messages
   */
  const removeEventListener = useCallback((event: string, handler: (data: any) => void) => {
    wsRef.current?.off(event, handler);
  }, []);

  /**
   * Reconnect WebSocket connection
   */
  const reconnect = useCallback(async (): Promise<void> => {
    if (!wsRef.current) {
      return;
    }

    try {
      await wsRef.current.connect();
    } catch (error) {
      handleError(error as Error);
      throw error;
    }
  }, [handleError]);

  /**
   * Disconnect WebSocket connection
   */
  const disconnect = useCallback((): void => {
    wsRef.current?.disconnect();
  }, []);

  // Initialize WebSocket connection on mount
  useEffect(() => {
    initializeWebSocket();

    // Setup connection state and error handlers
    wsRef.current?.on(WEBSOCKET_EVENTS.CONNECT, () => handleConnectionStateChange('connected'));
    wsRef.current?.on(WEBSOCKET_EVENTS.DISCONNECT, () => handleConnectionStateChange('disconnected'));
    wsRef.current?.on(WEBSOCKET_EVENTS.RECONNECTING, () => handleConnectionStateChange('reconnecting'));
    wsRef.current?.on(WEBSOCKET_EVENTS.ERROR, handleError);

    // Establish initial connection
    wsRef.current?.connect().catch(handleError);

    // Cleanup on unmount
    return () => {
      wsRef.current?.disconnect();
      wsRef.current = null;
    };
  }, [initializeWebSocket, handleConnectionStateChange, handleError]);

  return {
    isConnected: connectionState === 'connected',
    sendMessage,
    addEventListener,
    removeEventListener,
    reconnect,
    disconnect,
    connectionState,
    lastError
  };
}