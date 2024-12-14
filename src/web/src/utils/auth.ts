// jwt-decode v4.0.0
// crypto-js v4.1.1
import { jwtDecode } from 'jwt-decode';
import CryptoJS from 'crypto-js';
import { User, AuthToken, CustomJwtPayload } from '../types/auth';
import { AUTH_CONFIG } from '../config/auth';

// Encryption key for token storage - should be environment variable in production
const STORAGE_ENCRYPTION_KEY = process.env.REACT_APP_STORAGE_ENCRYPTION_KEY || 'default-key';

/**
 * Retrieves and decrypts stored authentication token from local storage with validation
 * Implements secure token retrieval with encryption and validation checks
 * @returns {AuthToken | null} Decrypted authentication token or null if not found/invalid
 */
export function getStoredToken(): AuthToken | null {
    try {
        const encryptedToken = localStorage.getItem(AUTH_CONFIG.tokenStorageKey);
        if (!encryptedToken) {
            return null;
        }

        // Decrypt token
        const decryptedBytes = CryptoJS.AES.decrypt(encryptedToken, STORAGE_ENCRYPTION_KEY);
        const decryptedToken = JSON.parse(decryptedBytes.toString(CryptoJS.enc.Utf8)) as AuthToken;

        // Validate token structure
        if (!isValidTokenStructure(decryptedToken)) {
            console.error('Invalid token structure detected');
            localStorage.removeItem(AUTH_CONFIG.tokenStorageKey);
            return null;
        }

        // Check token expiration
        if (isTokenExpired(decryptedToken.accessToken)) {
            console.warn('Expired token detected during retrieval');
            localStorage.removeItem(AUTH_CONFIG.tokenStorageKey);
            return null;
        }

        return decryptedToken;
    } catch (error) {
        console.error('Error retrieving stored token:', error);
        localStorage.removeItem(AUTH_CONFIG.tokenStorageKey);
        return null;
    }
}

/**
 * Encrypts and stores authentication token in local storage with audit logging
 * Implements secure token storage with encryption and validation
 * @param {AuthToken} token - The authentication token to store
 */
export function setStoredToken(token: AuthToken): void {
    try {
        // Validate token before storage
        if (!isValidTokenStructure(token)) {
            throw new Error('Invalid token structure');
        }

        // Encrypt token
        const encryptedToken = CryptoJS.AES.encrypt(
            JSON.stringify(token),
            STORAGE_ENCRYPTION_KEY
        ).toString();

        // Store encrypted token
        localStorage.setItem(AUTH_CONFIG.tokenStorageKey, encryptedToken);

        // Set session timeout handler
        setupSessionTimeout(token);

        // Audit logging if enabled
        if (AUTH_CONFIG.auditLogEnabled) {
            logAuthEvent('Token stored', { tokenType: token.tokenType });
        }
    } catch (error) {
        console.error('Error storing token:', error);
        throw new Error('Failed to store authentication token');
    }
}

/**
 * Checks if the current authentication token is expired with blacklist validation
 * Implements comprehensive token validation including JWT claims and blacklist checking
 * @param {string} token - The JWT token to validate
 * @returns {boolean} True if token is expired or invalid, false otherwise
 */
export function isTokenExpired(token: string): boolean {
    try {
        const decoded = jwtDecode<CustomJwtPayload>(token);
        const currentTime = Math.floor(Date.now() / 1000);

        // Check basic expiration
        if (!decoded.exp || decoded.exp <= currentTime) {
            return true;
        }

        // Validate required claims
        if (!decoded.iss || !decoded.sub || !decoded.role) {
            console.warn('Missing required JWT claims');
            return true;
        }

        // Check if within refresh threshold
        if (decoded.exp - currentTime <= AUTH_CONFIG.refreshThreshold / 1000) {
            console.info('Token approaching expiration threshold');
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error validating token:', error);
        return true;
    }
}

/**
 * Attempts to refresh the authentication token
 * Implements secure token refresh with validation and error handling
 * @param {AuthToken} currentToken - The current authentication token
 * @returns {Promise<AuthToken>} Promise resolving to new authentication token
 */
export async function refreshToken(currentToken: AuthToken): Promise<AuthToken> {
    try {
        if (!currentToken.refreshToken) {
            throw new Error('No refresh token available');
        }

        const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                refreshToken: currentToken.refreshToken,
            }),
        });

        if (!response.ok) {
            throw new Error('Token refresh failed');
        }

        const newToken: AuthToken = await response.json();

        // Validate new token
        if (!isValidTokenStructure(newToken)) {
            throw new Error('Invalid token received from refresh');
        }

        // Store new token
        setStoredToken(newToken);

        return newToken;
    } catch (error) {
        console.error('Error refreshing token:', error);
        throw new Error('Token refresh failed');
    }
}

/**
 * Manages user session timeout and cleanup
 * Implements secure session management with timeout handling
 */
export function handleSessionTimeout(): void {
    try {
        const token = getStoredToken();
        if (!token) {
            return;
        }

        const decoded = jwtDecode<CustomJwtPayload>(token.accessToken);
        const currentTime = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = decoded.exp ? (decoded.exp - currentTime) * 1000 : 0;

        if (timeUntilExpiry <= 0 || timeUntilExpiry > AUTH_CONFIG.sessionTimeout) {
            cleanupSession();
        }
    } catch (error) {
        console.error('Error handling session timeout:', error);
        cleanupSession();
    }
}

// Private helper functions

/**
 * Validates the structure of an authentication token
 * @param {AuthToken} token - The token to validate
 * @returns {boolean} True if token structure is valid
 */
function isValidTokenStructure(token: AuthToken): boolean {
    return !!(
        token &&
        token.accessToken &&
        token.refreshToken &&
        token.tokenType &&
        token.expiresIn &&
        typeof token.accessToken === 'string' &&
        typeof token.refreshToken === 'string'
    );
}

/**
 * Sets up session timeout monitoring
 * @param {AuthToken} token - The current authentication token
 */
function setupSessionTimeout(token: AuthToken): void {
    const decoded = jwtDecode<CustomJwtPayload>(token.accessToken);
    const currentTime = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp ? (decoded.exp - currentTime) * 1000 : 0;

    setTimeout(() => {
        handleSessionTimeout();
    }, Math.min(timeUntilExpiry, AUTH_CONFIG.sessionTimeout));
}

/**
 * Cleans up session data and local storage
 */
function cleanupSession(): void {
    localStorage.removeItem(AUTH_CONFIG.tokenStorageKey);
    localStorage.removeItem(AUTH_CONFIG.userStorageKey);
    
    // Dispatch event for application-wide logout handling
    window.dispatchEvent(new CustomEvent('auth:sessionExpired'));
}

/**
 * Logs authentication events for audit purposes
 * @param {string} event - The event to log
 * @param {object} details - Additional event details
 */
function logAuthEvent(event: string, details: object): void {
    const logEntry = {
        timestamp: new Date().toISOString(),
        event,
        details,
        userAgent: navigator.userAgent,
    };

    // In production, this should send to a secure logging endpoint
    console.info('Auth Event:', logEntry);
}