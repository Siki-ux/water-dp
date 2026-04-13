"""
Security module for JWT verification against Keycloak.
"""

import asyncio
import json
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx
import jwt
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

# JWKS cache with TTL
_jwks_cache: Optional[Tuple[Dict[str, Any], float]] = None
JWKS_CACHE_TTL = 3600  # 1 hour
_jwks_lock = asyncio.Lock()


async def get_jwks() -> Dict[str, Any]:
    """Fetch JWKS from Keycloak with a 1-hour cache TTL."""
    global _jwks_cache

    # Fast path: return cached keys if still valid without acquiring the lock.
    if _jwks_cache:
        cached_keys, cached_at = _jwks_cache
        if time.time() - cached_at < JWKS_CACHE_TTL:
            return cached_keys

    # Slow path: coordinate refresh so only one coroutine fetches JWKS.
    try:
        async with _jwks_lock:
            # Double-check inside the lock in case another coroutine refreshed already.
            if _jwks_cache:
                cached_keys, cached_at = _jwks_cache
                if time.time() - cached_at < JWKS_CACHE_TTL:
                    return cached_keys

            url = f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/certs"
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=10.0)
                response.raise_for_status()
                keys = response.json()
                _jwks_cache = (keys, time.time())
                logger.info("Fetched JWKS from Keycloak")
                return keys
    except Exception as error:
        logger.error(f"Failed to fetch JWKS: {error}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable",
        )


def _build_valid_issuers() -> List[str]:
    """Build the list of valid token issuers from configuration."""
    realm = settings.keycloak_realm
    issuers = [
        f"{settings.keycloak_url}/realms/{realm}",
        f"http://keycloak:8080/realms/{realm}",
    ]
    if settings.keycloak_external_url:
        issuers.append(f"{settings.keycloak_external_url}/realms/{realm}")
    return issuers


def _find_rsa_key(jwks: Dict[str, Any], kid: str) -> Optional[Dict[str, Any]]:
    """Find the RSA key matching the given key ID."""
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


async def verify_token(token: str) -> Dict[str, Any]:
    """Verify JWT token signature, audience, and issuer."""
    try:
        jwks = await get_jwks()

        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        rsa_key_data = _find_rsa_key(jwks, kid)
        if not rsa_key_data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token header",
                headers={"WWW-Authenticate": "Bearer"},
            )

        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(rsa_key_data))

        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience="account",
            options={
                "verify_aud": True,
                "verify_iss": False,  # manual check for multi-URL support
            },
        )

        valid_issuers = _build_valid_issuers()
        issuer = payload.get("iss")
        if issuer not in valid_issuers:
            logger.warning(f"Invalid issuer: {issuer}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token issuer",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as error:
        logger.warning(f"JWT verification failed: {error}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"Authentication error: {error}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )
