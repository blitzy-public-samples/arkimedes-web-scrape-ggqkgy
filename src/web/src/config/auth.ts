// jwt-decode v4.0.0
import { jwtDecode } from 'jwt-decode';
import { User, UserRole } from '../types/auth';

/**
 * Core authentication configuration settings.
 * Implements enterprise security standards with comprehensive session management.
 */
export const AUTH_CONFIG = {
    // Storage keys for secure token management
    tokenStorageKey: 'wsp_auth_token',
    userStorageKey: 'wsp_user_data',

    // Session management timeouts (in milliseconds)
    sessionTimeout: 3600000, // 1 hour
    refreshThreshold: TOKEN_REFRESH_THRESHOLD,
    mfaTimeout: MFA_TIMEOUT,
    maxLoginAttempts: MAX_LOGIN_ATTEMPTS,

    // Security feature flags
    tokenBlacklistEnabled: true,
    auditLogEnabled: true,

    // Password policy
    passwordMinLength: PASSWORD_MIN_LENGTH,
    passwordRequiresSpecialChar: true,
    passwordRequiresNumber: true,
    passwordHistorySize: 5,

    // Session security
    secureCookies: true,
    sameSiteStrict: true,
    httpOnly: true
} as const;

/**
 * OAuth 2.0 + OIDC configuration settings.
 * Implements Auth0 integration with PKCE support.
 */
export const OAUTH_CONFIG = {
    clientId: process.env.REACT_APP_AUTH0_CLIENT_ID!,
    domain: process.env.REACT_APP_AUTH0_DOMAIN!,
    scope: ['openid', 'profile', 'email', 'offline_access'],
    responseType: 'code',
    grantType: 'authorization_code',
    pkceEnabled: true,
    
    oidcConfig: {
        issuer: process.env.REACT_APP_AUTH0_DOMAIN!,
        authorizationEndpoint: `${process.env.REACT_APP_AUTH0_DOMAIN!}/authorize`,
        tokenEndpoint: `${process.env.REACT_APP_AUTH0_DOMAIN!}/oauth/token`,
        userInfoEndpoint: `${process.env.REACT_APP_AUTH0_DOMAIN!}/userinfo`,
        endSessionEndpoint: `${process.env.REACT_APP_AUTH0_DOMAIN!}/logout`,
        jwksUri: `${process.env.REACT_APP_AUTH0_DOMAIN!}/.well-known/jwks.json`
    }
} as const;

/**
 * Role-based access control (RBAC) configuration.
 * Implements granular permission management with role inheritance.
 */
export const PERMISSION_CONFIG = {
    rolePermissions: {
        [UserRole.ADMIN]: [
            'system.admin',
            'tasks.manage',
            'data.manage',
            'users.manage',
            'settings.manage'
        ],
        [UserRole.OPERATOR]: [
            'tasks.manage',
            'data.manage',
            'settings.view'
        ],
        [UserRole.ANALYST]: [
            'tasks.view',
            'data.view',
            'reports.view'
        ],
        [UserRole.SERVICE_ACCOUNT]: [
            'tasks.execute',
            'data.write'
        ]
    },

    defaultRole: UserRole.ANALYST,

    inheritanceMap: {
        [UserRole.ADMIN]: [],
        [UserRole.OPERATOR]: [UserRole.ANALYST],
        [UserRole.ANALYST]: [],
        [UserRole.SERVICE_ACCOUNT]: []
    },

    serviceAccountScopes: [
        'tasks:execute',
        'data:write',
        'metrics:write'
    ]
} as const;

// Global security constants
export const TOKEN_REFRESH_THRESHOLD = 300000; // 5 minutes
export const MFA_TIMEOUT = 300000; // 5 minutes
export const PASSWORD_MIN_LENGTH = 12;
export const MAX_LOGIN_ATTEMPTS = 5;
export const TOKEN_BLACKLIST_TTL = 86400000; // 24 hours
export const AUDIT_LOG_RETENTION = 2592000000; // 30 days

/**
 * Enhanced token validation with blacklist checking and refresh threshold.
 * @param token - JWT token to validate
 * @param checkBlacklist - Flag to enable blacklist checking
 * @returns Promise resolving to token validity status
 */
export async function isTokenExpired(
    token: string,
    checkBlacklist: boolean = true
): Promise<boolean> {
    try {
        const decoded = jwtDecode(token);
        const currentTime = Date.now() / 1000;

        // Check token expiration with refresh threshold
        if (!decoded.exp || decoded.exp - currentTime <= TOKEN_REFRESH_THRESHOLD / 1000) {
            return true;
        }

        // Validate token claims
        if (!decoded.iss || decoded.iss !== OAUTH_CONFIG.oidcConfig.issuer) {
            return true;
        }

        // Check token blacklist if enabled
        if (checkBlacklist && AUTH_CONFIG.tokenBlacklistEnabled) {
            const isBlacklisted = await checkTokenBlacklist(token);
            if (isBlacklisted) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('Token validation error:', error);
        return true;
    }
}

/**
 * Advanced permission checking with role inheritance support.
 * @param role - User role to check
 * @param permission - Required permission
 * @param checkInherited - Flag to check inherited permissions
 * @returns Boolean indicating permission status
 */
export function hasPermission(
    role: UserRole,
    permission: string,
    checkInherited: boolean = true
): boolean {
    // Check direct permissions
    const directPermissions = PERMISSION_CONFIG.rolePermissions[role] || [];
    if (directPermissions.includes(permission)) {
        return true;
    }

    // Check inherited permissions if enabled
    if (checkInherited) {
        const inheritedRoles = PERMISSION_CONFIG.inheritanceMap[role] || [];
        return inheritedRoles.some(inheritedRole => 
            PERMISSION_CONFIG.rolePermissions[inheritedRole]?.includes(permission)
        );
    }

    return false;
}

/**
 * Internal helper to check token blacklist status.
 * @param token - JWT token to check
 * @returns Promise resolving to blacklist status
 */
async function checkTokenBlacklist(token: string): Promise<boolean> {
    try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/blacklist/check`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token })
        });
        return response.ok && await response.json();
    } catch (error) {
        console.error('Blacklist check error:', error);
        return false;
    }
}