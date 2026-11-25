from hashlib import sha256
from unittest import TestCase
from unittest.mock import MagicMock, patch
from urllib.request import Request

from gridmind.public_data import ELECTRICITY_CONSUMPTION
from gridmind.public_data_acquisition import (
    DownloadedPublicData,
    PublicDataDownloadError,
    _SameHostHttpsRedirectHandler,
    download_open_dosm_csv,
)


class PublicDataAcquisitionTests(TestCase):
    def make_response(self, content=b"date,sector,consumption\n", content_type="text/csv", length=None):
        response = MagicMock()
        response.__enter__.return_value = response
        response.__exit__.return_value = None
        response.getcode.return_value = 200
        response.read.return_value = content
        response.headers.get_content_type.return_value = content_type
        response.headers.get.return_value = str(length if length is not None else len(content))
        return response

    @patch("gridmind.public_data_acquisition.build_opener")
    def test_download_returns_raw_bytes_hash_and_retrieval_provenance(self, build_opener_mock):
        content = b"date,sector,consumption\n2026-01-01,total,1.0\n"
        response = self.make_response(content)
        opener = MagicMock()
        opener.open.return_value = response
        build_opener_mock.return_value = opener

        result = download_open_dosm_csv(ELECTRICITY_CONSUMPTION)

        self.assertIsInstance(result, DownloadedPublicData)
        self.assertEqual(result.content, content)
        self.assertEqual(result.sha256_hex, sha256(content).hexdigest())
        self.assertEqual(result.dataset_id, "electricity_consumption")
        self.assertEqual(result.source_url, ELECTRICITY_CONSUMPTION.metadata.csv_url)
        self.assertEqual(result.size_bytes, len(content))
        self.assertIsNotNone(result.retrieved_at_utc.tzinfo)
        opener.open.assert_called_once()

    @patch("gridmind.public_data_acquisition.build_opener")
    def test_rejects_html_response(self, build_opener_mock):
        response = self.make_response(b"<html>blocked</html>", "text/html")
        opener = MagicMock()
        opener.open.return_value = response
        build_opener_mock.return_value = opener
        with self.assertRaisesRegex(PublicDataDownloadError, "CSV content type"):
            download_open_dosm_csv(ELECTRICITY_CONSUMPTION)

    @patch("gridmind.public_data_acquisition.build_opener")
    def test_rejects_declared_oversize_before_reading(self, build_opener_mock):
        response = self.make_response(b"x", length=100)
        opener = MagicMock()
        opener.open.return_value = response
        build_opener_mock.return_value = opener
        with self.assertRaisesRegex(PublicDataDownloadError, "size limit"):
            download_open_dosm_csv(ELECTRICITY_CONSUMPTION, max_bytes=10)
        response.read.assert_not_called()

    @patch("gridmind.public_data_acquisition.build_opener")
    def test_rejects_actual_oversize_after_bounded_read(self, build_opener_mock):
        response = self.make_response(b"x" * 11, length=5)
        opener = MagicMock()
        opener.open.return_value = response
        build_opener_mock.return_value = opener
        with self.assertRaisesRegex(PublicDataDownloadError, "size limit"):
            download_open_dosm_csv(ELECTRICITY_CONSUMPTION, max_bytes=10)
        response.read.assert_called_once_with(11)

    @patch("gridmind.public_data_acquisition.build_opener")
    def test_rejects_empty_response(self, build_opener_mock):
        response = self.make_response(b"", length=0)
        opener = MagicMock()
        opener.open.return_value = response
        build_opener_mock.return_value = opener
        with self.assertRaisesRegex(PublicDataDownloadError, "empty file"):
            download_open_dosm_csv(ELECTRICITY_CONSUMPTION)

    def test_redirect_handler_allows_same_host_relative_redirects(self):
        request = Request("https://storage.data.gov.my/energy/source.csv")
        redirected = _SameHostHttpsRedirectHandler().redirect_request(
            request, None, 302, "Found", {}, "/energy/new.csv"
        )
        self.assertEqual(redirected.full_url, "https://storage.data.gov.my/energy/new.csv")

    def test_redirect_handler_rejects_foreign_hosts(self):
        request = Request("https://storage.data.gov.my/energy/source.csv")
        with self.assertRaisesRegex(PublicDataDownloadError, "approved HTTPS source host"):
            _SameHostHttpsRedirectHandler().redirect_request(
                request, None, 302, "Found", {}, "https://example.com/steal.csv"
            )

    def test_redirect_handler_rejects_http_downgrade(self):
        request = Request("https://storage.data.gov.my/energy/source.csv")
        with self.assertRaisesRegex(PublicDataDownloadError, "approved HTTPS source host"):
            _SameHostHttpsRedirectHandler().redirect_request(
                request, None, 302, "Found", {}, "http://storage.data.gov.my/energy/new.csv"
            )

    @patch("gridmind.public_data_acquisition.build_opener")
    def test_wraps_network_timeout(self, build_opener_mock):
        opener = MagicMock()
        opener.open.side_effect = TimeoutError("timed out")
        build_opener_mock.return_value = opener
        with self.assertRaisesRegex(PublicDataDownloadError, "download failed"):
            download_open_dosm_csv(ELECTRICITY_CONSUMPTION)

    def test_rejects_unregistered_dataset_and_invalid_limits(self):
        with self.assertRaisesRegex(ValueError, "registered"):
            download_open_dosm_csv(object())
        with self.assertRaisesRegex(ValueError, "timeout_seconds"):
            download_open_dosm_csv(ELECTRICITY_CONSUMPTION, timeout_seconds=0)
        with self.assertRaisesRegex(ValueError, "max_bytes"):
            download_open_dosm_csv(ELECTRICITY_CONSUMPTION, max_bytes=0)

    @patch("gridmind.public_data_acquisition.build_opener")
    def test_rejects_truncated_response_when_content_length_is_larger(self, build_opener_mock):
        response = self.make_response(b"x" * 5, length=10)
        opener = MagicMock()
        opener.open.return_value = response
        build_opener_mock.return_value = opener

        with self.assertRaisesRegex(PublicDataDownloadError, "incomplete or malformed download"):
            download_open_dosm_csv(ELECTRICITY_CONSUMPTION, max_bytes=20)

        response.read.assert_called_once_with(21)
