"""
ABDM Gateway Client.

Handles session token authentication against ABDM_SANDBOX_BASE_URL using
ABDM_CLIENT_ID and ABDM_CLIENT_SECRET.
Fails gracefully with clear missing credential notifications if variables are not set.
"""

import time
import requests
from typing import Dict, Any, Optional

from module_d.config import ABDMConfig, MissingCredentialError


class ABDMGatewayClient:
    """Session and API request client for ABDM Sandbox Gateway."""

    _access_token: Optional[str] = None
    _token_expiry: float = 0.0

    @classmethod
    def get_token(cls) -> str:
        """
        Retrieves or refreshes the ABDM session bearer token.
        Raises MissingCredentialError if credentials are not configured in .env.
        """
        now = time.time()
        if cls._access_token and now < (cls._token_expiry - 60):
            return cls._access_token

        client_id = ABDMConfig.get_client_id()
        client_secret = ABDMConfig.get_client_secret()
        base_url = ABDMConfig.get_sandbox_base_url().rstrip("/")

        endpoint = f"{base_url}/gateway/v0.5/sessions"
        payload = {
            "clientId": client_id,
            "clientSecret": client_secret,
        }

        try:
            resp = requests.post(endpoint, json=payload, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                cls._access_token = data.get("accessToken")
                expires_in = data.get("expiresIn", 1800)
                cls._token_expiry = now + expires_in
                return cls._access_token
            else:
                raise RuntimeError(
                    f"ABDM Sandbox authentication failed with HTTP {resp.status_code}: {resp.text}"
                )
        except requests.exceptions.ConnectionError as e:
            raise ConnectionError(
                f"Could not connect to ABDM Sandbox at '{endpoint}'. Please check your network and ABDM_SANDBOX_BASE_URL: {e}"
            )
        except requests.exceptions.Timeout:
            raise TimeoutError(f"Connection to ABDM Sandbox at '{endpoint}' timed out.")

    @classmethod
    def call_gateway_api(cls, path: str, method: str = "POST", json_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Authenticated request to ABDM Gateway endpoint."""
        token = cls.get_token()
        base_url = ABDMConfig.get_sandbox_base_url().rstrip("/")
        url = f"{base_url}/{path.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {token}",
            "X-CM-ID": "sbx",
            "Content-Type": "application/json",
        }

        resp = requests.request(method, url, json=json_data, headers=headers, timeout=15)
        return {
            "status_code": resp.status_code,
            "response": resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text,
        }
