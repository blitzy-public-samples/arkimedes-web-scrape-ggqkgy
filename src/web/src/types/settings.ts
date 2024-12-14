/**
 * @fileoverview TypeScript type definitions for application settings including system configuration,
 * proxy settings, and storage management with strict type safety and comprehensive documentation.
 * @version 1.0.0
 */

/**
 * Type-safe interface defining system-wide performance and behavior settings
 * with strict numeric constraints for concurrent task management, timeouts,
 * and retry logic.
 */
export interface SystemSettings {
  /**
   * Maximum number of scraping tasks that can run concurrently.
   * Must be a positive integer.
   */
  readonly maxConcurrentTasks: number;

  /**
   * Global request timeout in milliseconds.
   * Must be a positive integer.
   */
  readonly requestTimeout: number;

  /**
   * Number of retry attempts for failed operations.
   * Must be a non-negative integer.
   */
  readonly retryAttempts: number;
}

/**
 * Type-safe enumeration of supported proxy service providers.
 * Used to configure the proxy rotation strategy.
 */
export enum ProxyProvider {
  /**
   * Bright Data enterprise proxy service
   */
  BRIGHT_DATA = 'BRIGHT_DATA',

  /**
   * Custom proxy list provided by the user
   */
  CUSTOM = 'CUSTOM'
}

/**
 * Type-safe interface for proxy service configuration with provider selection,
 * rotation settings, and custom proxy list management.
 */
export interface ProxySettings {
  /**
   * Selected proxy service provider
   */
  readonly provider: ProxyProvider;

  /**
   * Flag indicating if proxy rotation is enabled
   */
  readonly enabled: boolean;

  /**
   * Interval in seconds between proxy rotations.
   * Must be a positive integer.
   */
  readonly rotationInterval: number;

  /**
   * List of custom proxy URLs when using CUSTOM provider.
   * Each URL must be a valid proxy string.
   */
  readonly customProxies: string[];
}

/**
 * Type-safe interface for data storage and retention configuration
 * with strict validation for retention periods and archival settings.
 */
export interface StorageSettings {
  /**
   * Data retention period in days.
   * Must be a positive integer.
   */
  readonly retentionPeriod: number;

  /**
   * Flag indicating if automatic archival is enabled
   */
  readonly autoArchive: boolean;

  /**
   * Storage location for archived data.
   * Must be a valid path or URL.
   */
  readonly archiveLocation: string;
}

/**
 * Type-safe combined interface aggregating all application settings
 * with immutable properties for system-wide configuration.
 */
export interface Settings {
  /**
   * System-wide performance and behavior settings
   */
  readonly system: SystemSettings;

  /**
   * Proxy service configuration
   */
  readonly proxy: ProxySettings;

  /**
   * Data storage and retention settings
   */
  readonly storage: StorageSettings;
}