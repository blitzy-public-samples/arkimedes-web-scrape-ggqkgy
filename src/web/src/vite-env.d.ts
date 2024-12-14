/// <reference types="vite/client" /> // vite v4.4.9

/**
 * Type definitions for Vite environment variables used throughout the application
 * These environment variables should be defined in the .env files and accessed via import.meta.env
 */
interface ImportMetaEnv {
  /** Base URL for API endpoints */
  readonly VITE_API_URL: string;
  /** Authentication service URL */
  readonly VITE_AUTH_URL: string;
  /** WebSocket connection URL for real-time updates */
  readonly VITE_WEBSOCKET_URL: string;
  /** Application version from package.json */
  readonly VITE_APP_VERSION: string;
}

/**
 * Type augmentation for Vite's ImportMeta interface
 * Ensures type safety when accessing environment variables via import.meta.env
 */
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Type declarations for static asset imports
 * Enables TypeScript to properly resolve and type-check static asset imports
 * Supports modern browser compatibility (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
 */

/**
 * SVG file imports
 * Returns the processed asset URL or component based on Vite's configuration
 */
declare module '*.svg' {
  const content: any;
  export default content;
}

/**
 * PNG image imports
 * Returns the processed asset URL
 */
declare module '*.png' {
  const content: any;
  export default content;
}

/**
 * JPG/JPEG image imports
 * Returns the processed asset URL
 */
declare module '*.jpg' {
  const content: any;
  export default content;
}

declare module '*.jpeg' {
  const content: any;
  export default content;
}

/**
 * GIF image imports
 * Returns the processed asset URL
 */
declare module '*.gif' {
  const content: any;
  export default content;
}

/**
 * WebP image imports
 * Returns the processed asset URL
 */
declare module '*.webp' {
  const content: any;
  export default content;
}

/**
 * ICO file imports
 * Returns the processed asset URL
 */
declare module '*.ico' {
  const content: any;
  export default content;
}

/**
 * CSS module imports
 * Returns the processed styles object
 */
declare module '*.css' {
  const content: any;
  export default content;
}

/**
 * SCSS module imports
 * Returns the processed styles object
 */
declare module '*.scss' {
  const content: any;
  export default content;
}