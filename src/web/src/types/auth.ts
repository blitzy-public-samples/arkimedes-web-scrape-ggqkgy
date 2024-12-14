// jwt-decode v4.0.0 - Type definitions for JWT token handling
import { JwtPayload } from 'jwt-decode';

/**
 * Enumeration of user roles in the system.
 * Supports granular role-based access control (RBAC).
 */
export enum UserRole {
    ADMIN = 'ADMIN',
    OPERATOR = 'OPERATOR',
    ANALYST = 'ANALYST',
    SERVICE_ACCOUNT = 'SERVICE_ACCOUNT'
}

/**
 * Comprehensive user interface with role-based access control and MFA support.
 * Implements the authorization matrix requirements for different user types.
 */
export interface User {
    /** Unique identifier for the user */
    id: string;
    
    /** Username for authentication */
    username: string;
    
    /** Email address for notifications and recovery */
    email: string;
    
    /** User's role determining access level */
    role: UserRole;
    
    /** Granular permissions array for fine-grained access control */
    permissions: string[];
    
    /** Flag indicating if MFA is enabled for the account */
    mfaEnabled: boolean;
    
    /** ISO timestamp of the last successful login */
    lastLogin: string;
    
    /** Flag indicating if this is a service account */
    isServiceAccount: boolean;
}

/**
 * Login credentials interface supporting both user and service account authentication.
 * Includes optional MFA code for two-factor authentication.
 */
export interface LoginCredentials {
    /** Username or service account identifier */
    username: string;
    
    /** Password or API key for service accounts */
    password: string;
    
    /** Optional MFA code for two-factor authentication */
    mfaCode?: string;
    
    /** Flag to indicate service account login flow */
    isServiceAccount?: boolean;
}

/**
 * OAuth 2.0 authentication token interface.
 * Implements standard OAuth 2.0 token response structure.
 */
export interface AuthToken {
    /** JWT access token */
    accessToken: string;
    
    /** Refresh token for obtaining new access tokens */
    refreshToken: string;
    
    /** Token expiration time in seconds */
    expiresIn: number;
    
    /** Token type (usually 'Bearer') */
    tokenType: string;
    
    /** OAuth scopes granted to the token */
    scope: string;
}

/**
 * MFA setup response interface containing necessary setup information.
 * Provides QR code for TOTP apps and recovery keys for backup access.
 */
export interface MFASetupResponse {
    /** Base64 encoded QR code image for TOTP setup */
    qrCode: string;
    
    /** TOTP secret key for manual entry */
    secret: string;
    
    /** One-time use recovery keys for account recovery */
    recoveryKeys: string[];
}

/**
 * Authentication state interface for Redux store.
 * Manages global authentication state including MFA flow and error handling.
 */
export interface AuthState {
    /** Flag indicating if user is currently authenticated */
    isAuthenticated: boolean;
    
    /** Currently authenticated user information */
    user: User | null;
    
    /** Current authentication tokens */
    token: AuthToken | null;
    
    /** Flag indicating authentication operation in progress */
    loading: boolean;
    
    /** Authentication error message if any */
    error: string | null;
    
    /** Flag indicating MFA verification required */
    mfaRequired: boolean;
}

/**
 * Extended JWT payload interface including custom claims.
 * Extends the base JwtPayload type from jwt-decode.
 */
export interface CustomJwtPayload extends JwtPayload {
    /** User's role from the UserRole enum */
    role: UserRole;
    
    /** Array of granted permissions */
    permissions: string[];
    
    /** Flag indicating if MFA is required */
    mfaRequired: boolean;
}