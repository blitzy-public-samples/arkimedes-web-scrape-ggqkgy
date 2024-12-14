"""
Encryption utility module implementing AES-256-GCM encryption/decryption for sensitive data protection.
Uses cryptography library version 41.0.0 for secure cryptographic operations.

This module provides enterprise-grade encryption capabilities with:
- AES-256-GCM authenticated encryption
- Secure key generation
- Data integrity verification
- Comprehensive error handling
"""

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes  # v41.0.0
from cryptography.hazmat.backends import default_backend  # v41.0.0
import os  # v3.11
import base64  # v3.11
from datetime import datetime
import typing

# Constants for encryption parameters
KEY_LENGTH = 32  # 256-bit key length for AES-256
NONCE_LENGTH = 12  # 96-bit nonce for GCM mode
TAG_LENGTH = 16  # 128-bit authentication tag length

class EncryptionError(Exception):
    """
    Custom exception class for encryption/decryption operations with detailed error handling.
    Provides context and timestamp for debugging and audit purposes.
    """
    
    def __init__(self, message: str, cause: Exception = None) -> None:
        """
        Initialize encryption error with detailed message and optional cause.
        
        Args:
            message: Detailed error description
            cause: Optional underlying exception
        """
        super().__init__(message)
        self.cause = cause
        self.timestamp = datetime.utcnow().isoformat()
        self.context = {
            'timestamp': self.timestamp,
            'message': message,
            'cause': str(cause) if cause else None
        }

def generate_key() -> bytes:
    """
    Generates a cryptographically secure random 256-bit key for AES encryption.
    
    Returns:
        bytes: 32-byte (256-bit) random encryption key
        
    Raises:
        EncryptionError: If secure random number generation fails
    """
    try:
        # Generate random key using system's secure random number generator
        key = os.urandom(KEY_LENGTH)
        
        # Verify key length
        if len(key) != KEY_LENGTH:
            raise EncryptionError(f"Generated key length {len(key)} does not match required length {KEY_LENGTH}")
            
        return key
    except Exception as e:
        raise EncryptionError("Failed to generate encryption key", e)

def encrypt(key: bytes, data: bytes) -> str:
    """
    Encrypts data using AES-256-GCM with authenticated encryption and integrity verification.
    
    Args:
        key: 256-bit encryption key
        data: Raw data to encrypt
        
    Returns:
        str: Base64 encoded string containing nonce + ciphertext + tag
        
    Raises:
        EncryptionError: If encryption fails or parameters are invalid
    """
    try:
        # Validate inputs
        if len(key) != KEY_LENGTH:
            raise EncryptionError(f"Invalid key length: {len(key)}, expected {KEY_LENGTH}")
        if not data:
            raise EncryptionError("Data to encrypt cannot be empty")
            
        # Generate random nonce
        nonce = os.urandom(NONCE_LENGTH)
        
        # Create cipher instance
        cipher = Cipher(
            algorithms.AES(key),
            modes.GCM(nonce),
            backend=default_backend()
        )
        encryptor = cipher.encryptor()
        
        # Encrypt data
        ciphertext = encryptor.update(data) + encryptor.finalize()
        
        # Get authentication tag
        tag = encryptor.tag
        
        # Combine components and encode
        encrypted = nonce + ciphertext + tag
        encoded = base64.b64encode(encrypted).decode('utf-8')
        
        return encoded
        
    except Exception as e:
        raise EncryptionError("Encryption failed", e)
    finally:
        # Secure cleanup of sensitive data
        if 'encryptor' in locals():
            del encryptor
        if 'cipher' in locals():
            del cipher

def decrypt(key: bytes, encrypted_data: str) -> bytes:
    """
    Decrypts AES-256-GCM encrypted data with authentication tag verification.
    
    Args:
        key: 256-bit encryption key
        encrypted_data: Base64 encoded encrypted data
        
    Returns:
        bytes: Decrypted original data
        
    Raises:
        EncryptionError: If decryption fails, tag verification fails, or parameters are invalid
    """
    try:
        # Validate inputs
        if len(key) != KEY_LENGTH:
            raise EncryptionError(f"Invalid key length: {len(key)}, expected {KEY_LENGTH}")
            
        # Decode base64 data
        try:
            encrypted = base64.b64decode(encrypted_data.encode('utf-8'))
        except Exception as e:
            raise EncryptionError("Invalid base64 encoded data", e)
            
        # Extract components
        if len(encrypted) < NONCE_LENGTH + TAG_LENGTH:
            raise EncryptionError("Encrypted data too short")
            
        nonce = encrypted[:NONCE_LENGTH]
        tag = encrypted[-TAG_LENGTH:]
        ciphertext = encrypted[NONCE_LENGTH:-TAG_LENGTH]
        
        # Create cipher instance
        cipher = Cipher(
            algorithms.AES(key),
            modes.GCM(nonce, tag),
            backend=default_backend()
        )
        decryptor = cipher.decryptor()
        
        # Decrypt data
        decrypted = decryptor.update(ciphertext) + decryptor.finalize()
        
        return decrypted
        
    except Exception as e:
        raise EncryptionError("Decryption failed", e)
    finally:
        # Secure cleanup of sensitive data
        if 'decryptor' in locals():
            del decryptor
        if 'cipher' in locals():
            del cipher

# Export public interface
__all__ = ['generate_key', 'encrypt', 'decrypt', 'EncryptionError']