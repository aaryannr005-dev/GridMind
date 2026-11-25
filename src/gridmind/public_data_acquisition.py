"""Explicit, bounded acquisition for registered OpenDOSM CSV datasets.

This module is never called by the simulation engine. Downloads occur only
when a caller explicitly invokes download_open_dosm_csv().
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from http.client import IncompleteRead
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .public_data import OPEN_DOSM_DATASETS, OpenDosmDataset


_ALLOWED_HOST = "storage.data.gov.my"
_ALLOWED_CONTENT_TYPES = {"text/csv", "application/csv", "application/octet-stream", "text/plain"}
_DEFAULT_TIMEOUT_SECONDS = 10.0
_DEFAULT_MAX_BYTES = 25 * 1024 * 1024


class PublicDataDownloadError(RuntimeError):
    """A registered public dataset could not be downloaded safely."""


@dataclass(frozen=True, slots=True)
class DownloadedPublicData:
    """Raw downloaded bytes and retrieval provenance, before CSV parsing."""

    dataset_id: str
    source_url: str
    content: bytes
    sha256_hex: str
    content_type: str | None
    retrieved_at_utc: datetime

    @property
    def size_bytes(self) -> int:
        return len(self.content)


class _SameHostHttpsRedirectHandler(HTTPRedirectHandler):
    """Permit redirects only to HTTPS URLs on the registered storage host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        resolved_url = urljoin(req.full_url, newurl)
        parsed = urlparse(resolved_url)
        if parsed.scheme != "https" or parsed.hostname != _ALLOWED_HOST:
            raise PublicDataDownloadError("dataset redirect left the approved HTTPS source host")
        if parsed.username or parsed.password or parsed.port not in (None, 443):
            raise PublicDataDownloadError("dataset redirect used an unsupported URL authority")
        return super().redirect_request(req, fp, code, msg, headers, resolved_url)


def download_open_dosm_csv(
    dataset: OpenDosmDataset,
    *,
    timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS,
    max_bytes: int = _DEFAULT_MAX_BYTES,
) -> DownloadedPublicData:
    """Download a registered CSV with strict URL, timeout, and size limits.

    This function performs no parsing, caching, persistence, or simulation
    updates. The caller must explicitly pass a registered dataset. Raw bytes
    are returned with a SHA-256 digest so the exact imported file can be
    identified and archived separately if desired.
    """

    if not isinstance(dataset, OpenDosmDataset):
        raise ValueError("dataset must be a registered OpenDosmDataset")
    registered = OPEN_DOSM_DATASETS.get(dataset.metadata.dataset_id)
    if registered != dataset:
        raise ValueError("dataset is not present in the approved OpenDOSM registry")
    if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, (int, float)) or not 0 < timeout_seconds <= 60:
        raise ValueError("timeout_seconds must be greater than 0 and at most 60")
    if isinstance(max_bytes, bool) or not isinstance(max_bytes, int) or not 1 <= max_bytes <= 100 * 1024 * 1024:
        raise ValueError("max_bytes must be between 1 byte and 100 MiB")

    source_url = dataset.metadata.csv_url
    parsed = urlparse(source_url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != _ALLOWED_HOST
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("dataset URL is not an approved HTTPS CSV source")

    request = Request(
        source_url,
        headers={
            "Accept": "text/csv, application/csv, application/octet-stream",
            "User-Agent": "GridMind-public-data-import/1.0",
        },
        method="GET",
    )
    opener = build_opener(_SameHostHttpsRedirectHandler())
    try:
        with opener.open(request, timeout=float(timeout_seconds)) as response:
            status = response.getcode()
            if status != 200:
                raise PublicDataDownloadError(f"source returned HTTP status {status}")
            content_type = response.headers.get_content_type() if response.headers else None
            if content_type and content_type.lower() not in _ALLOWED_CONTENT_TYPES:
                raise PublicDataDownloadError("source did not return a supported CSV content type")
            length_header = response.headers.get("Content-Length") if response.headers else None
            declared_length = None
            if length_header is not None:
                try:
                    declared_length = int(length_header)
                except (TypeError, ValueError) as exc:
                    raise PublicDataDownloadError("source returned an invalid Content-Length") from exc
                if declared_length < 0 or declared_length > max_bytes:
                    raise PublicDataDownloadError("source file exceeds the configured download size limit")
            content = response.read(max_bytes + 1)
            if len(content) > max_bytes:
                raise PublicDataDownloadError("source file exceeds the configured download size limit")
            if declared_length is not None and len(content) != declared_length:
                raise PublicDataDownloadError(
                    "source response length did not match Content-Length (incomplete or malformed download)"
                )
    except PublicDataDownloadError:
        raise
    except IncompleteRead as exc:
        raise PublicDataDownloadError("source response ended before the declared Content-Length") from exc
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise PublicDataDownloadError("public dataset download failed") from exc

    if len(content) > max_bytes:
        raise PublicDataDownloadError("source file exceeds the configured download size limit")
    if not content:
        raise PublicDataDownloadError("source returned an empty file")

    return DownloadedPublicData(
        dataset_id=dataset.metadata.dataset_id,
        source_url=source_url,
        content=content,
        sha256_hex=sha256(content).hexdigest(),
        content_type=content_type,
        retrieved_at_utc=datetime.now(timezone.utc),
    )
