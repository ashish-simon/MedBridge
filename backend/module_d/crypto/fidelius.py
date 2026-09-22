"""
ABDM Fidelius Cryptographic Implementation.

Complies with the official Ayushman Bharat Digital Mission (ABDM) encryption protocol:
- Elliptic Curve Diffie-Hellman (ECDH) on Curve25519 in Short Weierstrass form (BouncyCastle BC25519)
- Key Derivation via HKDF-SHA256
- AES-256-GCM encryption with authenticated tag
- Exchanging 32-byte nonces for salt and IV derivation

Tested and verified against official BouncyCastle and fidelius-cli test vectors.
"""

import os
import base64
import secrets
from dataclasses import dataclass
from typing import Optional, Tuple, Dict, Any

from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


# Curve parameters for BC25519 (Curve25519 in Short Weierstrass form used by ABDM/BouncyCastle)
P = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFED
A = 0x2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA984914A144
B = 0x7B425ED097B425ED097B425ED097B425ED097B425ED097B4260B5E9C7710C864
Q = 0x1000000000000000000000000000000014DEF9DEA2F79CD65812631A5CF5D3ED
GX = 0x2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD245A
GY = 0x20AE19A1B8A086B4E01EDD2C7748D14C923D4D7E6D7C61B229E9C5A27ECED3D9

G = (GX, GY)

# Fixed X509 public key prefix for BouncyCastle format
FIXED_X509_PREFIX_B64 = (
    "MIIBMTCB6gYHKoZIzj0CATCB3gIBATArBgcqhkjOPQEBAiB/////////////////////////////////////////"
    "7TBEBCAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqYSRShRAQge0Je0Je0Je0Je0Je0Je0Je0Je0Je0Je0JgtenHc"
    "QyGQEQQQqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0kWiCuGaG4oIa04B7dLHdI0UySPU1+bXxhsinpxaJ+ztP"
    "ZAiAQAAAAAAAAAAAAAAAAAAAAFN753qL3nNZYEmMaXPXT7QIBCANCAAQ="
)


def _inv(n: int) -> int:
    return pow(n, P - 2, P)


def _point_add(p1: Optional[Tuple[int, int]], p2: Optional[Tuple[int, int]]) -> Optional[Tuple[int, int]]:
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    x1, y1 = p1
    x2, y2 = p2
    if x1 == x2 and (y1 != y2 or y1 == 0):
        return None
    if x1 == x2:
        m = (3 * x1 * x1 + A) * _inv(2 * y1) % P
    else:
        m = (y2 - y1) * _inv(x2 - x1) % P
    x3 = (m * m - x1 - x2) % P
    y3 = (m * (x1 - x3) - y1) % P
    return (x3, y3)


def _scalar_mult(k: int, pt: Tuple[int, int]) -> Optional[Tuple[int, int]]:
    res = None
    curr = pt
    while k > 0:
        if k & 1:
            res = _point_add(res, curr)
        curr = _point_add(curr, curr)
        k >>= 1
    return res


@dataclass(frozen=True)
class KeyMaterial:
    private_key: str
    public_key: str
    x509_public_key: str
    nonce: str

    @classmethod
    def generate(cls) -> "KeyMaterial":
        """Generates a fresh ECDH keypair and 32-byte nonce."""
        priv_int = secrets.randbelow(Q - 2) + 1
        pub_pt = _scalar_mult(priv_int, G)
        assert pub_pt is not None, "Generated invalid point at infinity"
        return cls._encode(priv_int, pub_pt)

    @classmethod
    def generate_for_private_key(cls, private_key: int) -> "KeyMaterial":
        pub_pt = _scalar_mult(private_key, G)
        assert pub_pt is not None, "Invalid private key"
        return cls._encode(private_key, pub_pt)

    @classmethod
    def from_private_key_b64(cls, priv_b64: str) -> "KeyMaterial":
        priv_bytes = base64.b64decode(priv_b64)
        priv_int = int.from_bytes(priv_bytes, "big")
        return cls.generate_for_private_key(priv_int)

    @classmethod
    def _encode(cls, priv_int: int, pub_pt: Tuple[int, int]) -> "KeyMaterial":
        priv_bytes = priv_int.to_bytes(32, "big")
        priv_b64 = base64.b64encode(priv_bytes).decode("utf-8")

        x_bytes = pub_pt[0].to_bytes(32, "big")
        y_bytes = pub_pt[1].to_bytes(32, "big")

        # 0x04 indicates uncompressed format
        pub_bytes = b"\x04" + x_bytes + y_bytes
        pub_b64 = base64.b64encode(pub_bytes).decode("utf-8")

        prefix = base64.b64decode(FIXED_X509_PREFIX_B64)
        x509_b64 = base64.b64encode(prefix + x_bytes + y_bytes).decode("utf-8")

        nonce = os.urandom(32)
        nonce_b64 = base64.b64encode(nonce).decode("utf-8")

        return cls(
            private_key=priv_b64,
            public_key=pub_b64,
            x509_public_key=x509_b64,
            nonce=nonce_b64,
        )


@dataclass
class EncryptionRequest:
    sender_nonce: str
    requester_nonce: str
    sender_private_key: str
    requester_public_key: str
    string_to_encrypt: str
    string_to_encrypt_base64: Optional[str] = None

    def __post_init__(self):
        if self.string_to_encrypt_base64:
            self.string_to_encrypt = base64.b64decode(self.string_to_encrypt_base64).decode("utf-8")


@dataclass
class DecryptionRequest:
    sender_nonce: str
    requester_nonce: str
    requester_private_key: str
    sender_public_key: str
    encrypted_data: str


class CryptoController:
    """Fidelius ECDH + HKDF + AES-GCM Encryptor and Decryptor."""

    @classmethod
    def encrypt(cls, req: EncryptionRequest) -> str:
        sender_nonce = base64.b64decode(req.sender_nonce)
        requester_nonce = base64.b64decode(req.requester_nonce)

        xor_nonces = bytes(a ^ b for a, b in zip(sender_nonce, requester_nonce))
        iv = xor_nonces[-12:]
        salt = xor_nonces[:20]

        shared_secret_bytes = cls.compute_shared_secret(
            req.sender_private_key, req.requester_public_key
        )
        aes_key = cls.derive_key(salt, shared_secret_bytes)

        aesgcm = AESGCM(aes_key)
        plaintext_bytes = req.string_to_encrypt.encode("utf-8")
        ciphertext = aesgcm.encrypt(iv, plaintext_bytes, None)
        return base64.b64encode(ciphertext).decode("utf-8")

    @classmethod
    def decrypt(cls, req: DecryptionRequest) -> str:
        sender_nonce = base64.b64decode(req.sender_nonce)
        requester_nonce = base64.b64decode(req.requester_nonce)

        xor_nonces = bytes(a ^ b for a, b in zip(sender_nonce, requester_nonce))
        iv = xor_nonces[-12:]
        salt = xor_nonces[:20]

        shared_secret_bytes = cls.compute_shared_secret(
            req.requester_private_key, req.sender_public_key
        )
        aes_key = cls.derive_key(salt, shared_secret_bytes)

        raw_enc = base64.b64decode(req.encrypted_data)
        aesgcm = AESGCM(aes_key)
        decrypted_bytes = aesgcm.decrypt(iv, raw_enc, None)
        return decrypted_bytes.decode("utf-8")

    @classmethod
    def decode_public_key_to_point(cls, key_b64: str) -> Tuple[int, int]:
        raw = base64.b64decode(key_b64)
        if len(raw) == 65 and raw[0] == 0x04:
            x_bytes = raw[1:33]
            y_bytes = raw[33:65]
        else:
            # Assume X509 encoded format
            x_bytes = raw[-64:-32]
            y_bytes = raw[-32:]
        x = int.from_bytes(x_bytes, "big")
        y = int.from_bytes(y_bytes, "big")
        return (x, y)

    @classmethod
    def decode_private_key_to_int(cls, key_b64: str) -> int:
        raw = base64.b64decode(key_b64)
        return int.from_bytes(raw, "big")

    @classmethod
    def compute_shared_secret(cls, priv_key_b64: str, pub_key_b64: str) -> bytes:
        priv_int = cls.decode_private_key_to_int(priv_key_b64)
        pub_pt = cls.decode_public_key_to_point(pub_key_b64)
        shared_pt = _scalar_mult(priv_int, pub_pt)
        if shared_pt is None:
            raise ValueError("Invalid ECDH shared secret: point at infinity")
        return shared_pt[0].to_bytes(32, "big")

    @classmethod
    def derive_key(cls, salt: bytes, shared_secret: bytes, key_length: int = 32) -> bytes:
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=key_length,
            salt=salt,
            info=None,
        )
        return hkdf.derive(shared_secret)
