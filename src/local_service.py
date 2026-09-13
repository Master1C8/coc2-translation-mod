#!/usr/bin/env python3
"""Authenticated loopback services for the VN Revival realtime translator."""

from __future__ import annotations

import argparse
import base64
import contextvars
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import hashlib
import http.client
import ipaddress
import json
import math
import os
import re
import socket
import struct
import subprocess
import sys
import threading
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


OPENAI_COMPATIBLE_CONFIG = json.loads(
    Path(__file__).with_name("openai-compatible.json").read_text(encoding="utf-8")
)
OPENAI_COMPATIBLE_PROMPT_VERSION = OPENAI_COMPATIBLE_CONFIG["promptVersion"]
OPENAI_COMPATIBLE_MAX_REQUEST_SYSTEM_PROMPT_CHARS = OPENAI_COMPATIBLE_CONFIG[
    "maxRequestSystemPromptChars"
]
OPENAI_COMPATIBLE_MAX_GLOSSARY_CHARS = OPENAI_COMPATIBLE_CONFIG["maxGlossaryChars"]
OPENAI_COMPATIBLE_REASONING_EFFORTS = set(OPENAI_COMPATIBLE_CONFIG["reasoningEfforts"]) - {""}
OPENAI_COMPATIBLE_VERBOSITIES = set(OPENAI_COMPATIBLE_CONFIG["verbosities"])
OPENCODE_CHAT_MODELS = {
    preset: set(models)
    for preset, models in OPENAI_COMPATIBLE_CONFIG["openCodeChatModels"].items()
}
OPENCODE_RESPONSE_MODELS = {
    preset: set(models)
    for preset, models in OPENAI_COMPATIBLE_CONFIG["openCodeResponseModels"].items()
}
OPENCODE_MESSAGE_MODELS = {
    preset: set(models)
    for preset, models in OPENAI_COMPATIBLE_CONFIG["openCodeMessageModels"].items()
}
OPENCODE_SUPPORTED_MODELS = {
    preset: (
        OPENCODE_CHAT_MODELS.get(preset, set())
        | OPENCODE_RESPONSE_MODELS.get(preset, set())
        | OPENCODE_MESSAGE_MODELS.get(preset, set())
    )
    for preset in (
        OPENCODE_CHAT_MODELS.keys()
        | OPENCODE_RESPONSE_MODELS.keys()
        | OPENCODE_MESSAGE_MODELS.keys()
    )
}
OPENAI_COMPATIBLE_DEFAULT_SYSTEM_PROMPT = OPENAI_COMPATIBLE_CONFIG["defaultSystemPrompt"]
OPENAI_COMPATIBLE_PRESETS = OPENAI_COMPATIBLE_CONFIG["presets"]
VNREVIVAL_SITE_ORIGIN = "https://vnrevival.fun"
VNREVIVAL_SITE_CONFIG_MAX_GLOSSARY_CHARS = 64_000
MAX_REQUEST_BYTES = 1_048_576
MAX_TEXT_CHARS = 12_000
MAX_LOG_COPY_BYTES = 2 * 1024 * 1024
MAX_CAPTURE_BYTES = 8 * 1024 * 1024
MAX_SCREENSHOT_BYTES = 32 * 1024 * 1024
_LOG_LOCK = threading.Lock()
_CAPTURE_LOCK = threading.Lock()
_SCREENSHOT_LOCK = threading.Lock()
_TRACE_ID = contextvars.ContextVar("translation_request_id", default=None)
_LOG_ROUTES = {
    "/v1/health", "/v1/openai-compatible/status", "/v1/openai-compatible/key",
    "/v1/openai-compatible/key/remove", "/v1/openai-compatible/translate",
    "/v1/vnrevival/translation-config",
    "/v1/vnrevival/open-game-page",
    "/v1/screenshots/capture", "/v1/screenshots/finish", "/v1/screenshots/open",
    "/v1/launcher/reselect-executable", "/v1/capture/status", "/v1/capture/start",
    "/v1/capture/append", "/v1/capture/stop", "/v1/capture/read", "/v1/capture/clear",
}


def translation_diagnostics(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if (not isinstance(value, dict) or set(value) != {"screen_id", "batch_size", "kind"}
            or not isinstance(value["screen_id"], str) or not re.fullmatch(r"[0-9a-f]{32}", value["screen_id"])
            or type(value["batch_size"]) is not int or not 1 <= value["batch_size"] <= 12
            or value["kind"] not in ("story", "control", "tooltip", "ui")):
        raise BridgeError("invalid_metrics", "Invalid translation metrics", 400)
    return dict(value)


def screen_metrics(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise BridgeError("invalid_metrics", "Invalid screen metrics", 400)
    counters = {
        "jobs", "requests_planned", "helper_requests", "batch_requests", "batch_fallbacks",
        "cache_hits", "max_queue_wait_ms", "usage_requests", "costed_requests",
        "input_tokens", "output_tokens", "total_tokens", "cached_input_tokens", "reasoning_tokens",
    }
    nullable = {"first_apply_ms", "first_story_ms"}
    fields = {"phase", "screen_id", "mode", "reported_cost_usd"} | counters | nullable
    if value.get("phase") == "result":
        fields |= {"outcome", "duration_ms", "failed_jobs"}
        counters |= {"duration_ms", "failed_jobs"}
    valid = (set(value) == fields and value.get("phase") in ("start", "result")
             and isinstance(value.get("screen_id"), str) and re.fullmatch(r"[0-9a-f]{32}", value["screen_id"])
             and value.get("mode") in ("manual", "auto")
             and ("outcome" not in value or value["outcome"] in ("complete", "failed", "cancelled", "superseded")))
    if not valid or any(type(value[key]) is not int or not 0 <= value[key] <= 1_000_000_000 for key in counters) \
            or any(value[key] is not None and (type(value[key]) is not int or not 0 <= value[key] <= 1_000_000_000) for key in nullable) \
            or (value["reported_cost_usd"] is not None and (
                type(value["reported_cost_usd"]) not in (int, float)
                or not math.isfinite(value["reported_cost_usd"])
                or not 0 <= value["reported_cost_usd"] <= 1_000_000_000
            )):
        raise BridgeError("invalid_metrics", "Invalid screen metrics", 400)
    return {key: item for key, item in value.items() if key != "phase"}


def safe_exception_kind(error: BaseException) -> str:
    allowed = (KeyError, ValueError, TypeError, AttributeError, OSError, RuntimeError)
    return type(error).__name__ if type(error) in allowed else "Exception"


def token_usage(payload: dict[str, Any]) -> dict[str, Any]:
    usage = payload.get("usage")
    result: dict[str, Any] = {"usage_available": False, "cost_available": False}
    if not isinstance(usage, dict):
        usage = {}
    for source, target in (("prompt_tokens", "input_tokens"), ("completion_tokens", "output_tokens"), ("total_tokens", "total_tokens")):
        value = usage.get(source, usage.get(target))
        if type(value) is int and 0 <= value <= 10**12:
            result[target] = value
            result["usage_available"] = True
    for sources, field, target in (
        (("prompt_tokens_details", "input_tokens_details"), "cached_tokens", "cached_input_tokens"),
        (("completion_tokens_details", "output_tokens_details"), "reasoning_tokens", "reasoning_tokens"),
    ):
        details = next((usage[key] for key in sources if isinstance(usage.get(key), dict)), {})
        value = details.get(field)
        if type(value) is int and 0 <= value <= 10**12:
            result[target] = value
            result["usage_available"] = True
    cost = usage.get("cost", payload.get("cost"))
    if isinstance(cost, str) and re.fullmatch(r"\d+(?:\.\d+)?(?:[eE][+-]?\d+)?", cost.strip()):
        cost = float(cost)
    if type(cost) in (int, float) and math.isfinite(cost) and 0 <= cost <= 10**9:
        result["cost_usd"] = round(float(cost), 12)
        result["cost_available"] = True
    return result


def _capture_text(value: Any, limit: int) -> bool:
    return isinstance(value, str) and 1 <= len(value) <= limit \
        and not any(ord(character) < 32 and character not in "\r\n\t" or ord(character) == 127 for character in value)


def capture_request_set(value: Any) -> dict[str, Any]:
    fields = {
        "screen_id", "game_id", "game_version", "translator_version", "language",
        "preset", "model", "reasoning_effort", "mode", "requests",
    }
    if not isinstance(value, dict) or set(value) != fields:
        raise BridgeError("capture_invalid", "Invalid translation capture", 400)
    valid = (
        isinstance(value["screen_id"], str) and re.fullmatch(r"[0-9a-f]{32}", value["screen_id"])
        and isinstance(value["game_id"], str) and re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", value["game_id"])
        and _capture_text(value["game_version"], 100)
        and _capture_text(value["translator_version"], 100)
        and isinstance(value["language"], str) and re.fullmatch(r"[A-Za-z0-9-]{2,24}", value["language"])
        and value["preset"] in OPENAI_COMPATIBLE_PRESETS
        and isinstance(value["model"], str) and len(value["model"]) <= 512
        and value["reasoning_effort"] in ({""} | OPENAI_COMPATIBLE_REASONING_EFFORTS)
        and value["mode"] in ("manual", "auto")
        and isinstance(value["requests"], list) and 1 <= len(value["requests"]) <= 500
    )
    if not valid:
        raise BridgeError("capture_invalid", "Invalid translation capture", 400)
    for request in value["requests"]:
        if not isinstance(request, dict) \
                or set(request) != {"kind", "batch_size", "system_prompt", "glossary", "text"} \
                or request["kind"] not in ("story", "control", "tooltip", "ui") \
                or type(request["batch_size"]) is not int or not 1 <= request["batch_size"] <= 12 \
                or not _capture_text(request["system_prompt"], OPENAI_COMPATIBLE_MAX_REQUEST_SYSTEM_PROMPT_CHARS) \
                or not isinstance(request["glossary"], str) \
                or len(request["glossary"]) > OPENAI_COMPATIBLE_MAX_GLOSSARY_CHARS \
                or (request["glossary"] and not _capture_text(request["glossary"], OPENAI_COMPATIBLE_MAX_GLOSSARY_CHARS)) \
                or not _capture_text(request["text"], MAX_TEXT_CHARS):
            raise BridgeError("capture_invalid", "Invalid translation capture", 400)
    return value


class BridgeError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status: int = 400,
        *,
        provider_status: int | None = None,
        retry_after_ms: int | None = None,
        usage: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.status = status
        self.provider_status = provider_status
        self.retry_after_ms = retry_after_ms
        self.usage = usage


class SameOriginRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Validate every redirect before urllib can forward request credentials."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        def origin(url):
            parsed = urllib.parse.urlsplit(url)
            if parsed.username is not None or parsed.password is not None:
                raise ValueError("Credentials in redirect URL")
            port = parsed.port if parsed.port is not None else (443 if parsed.scheme == "https" else 80)
            return parsed.scheme, parsed.hostname, port

        try:
            allowed = origin(req.full_url) == origin(newurl)
        except ValueError:
            allowed = False
        if not allowed:
            fp.close()
            raise BridgeError("unsafe_redirect", "The endpoint returned an unsafe redirect", 502)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def open_url(request, timeout):
    return urllib.request.build_opener(SameOriginRedirectHandler()).open(request, timeout=timeout)


def _recv_exact(connection: socket.socket, length: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < length:
        chunk = connection.recv(length - len(chunks))
        if not chunk:
            raise BridgeError("screenshot_connection_failed", "The game screenshot connection closed", 502)
        chunks.extend(chunk)
    return bytes(chunks)


def _send_websocket_frame(connection: socket.socket, opcode: int, payload: bytes) -> None:
    mask = os.urandom(4)
    length = len(payload)
    if length < 126:
        header = bytes((0x80 | opcode, 0x80 | length))
    elif length <= 0xFFFF:
        header = bytes((0x80 | opcode, 0x80 | 126)) + struct.pack("!H", length)
    else:
        header = bytes((0x80 | opcode, 0x80 | 127)) + struct.pack("!Q", length)
    masked = bytes(value ^ mask[index % 4] for index, value in enumerate(payload))
    connection.sendall(header + mask + masked)


def _receive_websocket_message(connection: socket.socket) -> bytes:
    message = bytearray()
    started = False
    while True:
        first, second = _recv_exact(connection, 2)
        final = bool(first & 0x80)
        opcode = first & 0x0F
        masked = bool(second & 0x80)
        length = second & 0x7F
        if length == 126:
            length = struct.unpack("!H", _recv_exact(connection, 2))[0]
        elif length == 127:
            length = struct.unpack("!Q", _recv_exact(connection, 8))[0]
        if length > MAX_SCREENSHOT_BYTES * 2:
            raise BridgeError("screenshot_too_large", "The game screenshot response is too large", 502)
        mask = _recv_exact(connection, 4) if masked else b""
        payload = _recv_exact(connection, length)
        if masked:
            payload = bytes(value ^ mask[index % 4] for index, value in enumerate(payload))
        if opcode == 0x8:
            raise BridgeError("screenshot_connection_failed", "The game screenshot connection closed", 502)
        if opcode == 0x9:
            _send_websocket_frame(connection, 0xA, payload)
            continue
        if opcode in (0x1, 0x2):
            if started:
                raise BridgeError("screenshot_protocol_failed", "The game returned an invalid screenshot response", 502)
            started = True
            message.extend(payload)
        elif opcode == 0x0 and started:
            message.extend(payload)
        else:
            continue
        if len(message) > MAX_SCREENSHOT_BYTES * 2:
            raise BridgeError("screenshot_too_large", "The game screenshot response is too large", 502)
        if final:
            return bytes(message)


def _capture_cdp_png(websocket_url: str) -> bytes:
    parsed = urllib.parse.urlsplit(websocket_url)
    if parsed.scheme != "ws" or parsed.hostname != "127.0.0.1" or not parsed.port \
            or parsed.username is not None or parsed.password is not None:
        raise BridgeError("screenshot_target_invalid", "The game screenshot target is invalid", 502)
    path = urllib.parse.urlunsplit(("", "", parsed.path or "/", parsed.query, ""))
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    expected_accept = base64.b64encode(hashlib.sha1(
        (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")
    ).digest()).decode("ascii")
    try:
        with socket.create_connection(("127.0.0.1", parsed.port), timeout=5) as connection:
            connection.settimeout(15)
            request = (
                f"GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{parsed.port}\r\n"
                f"Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
                "Sec-WebSocket-Version: 13\r\n\r\n"
            ).encode("ascii")
            connection.sendall(request)
            response = bytearray()
            while b"\r\n\r\n" not in response and len(response) <= 16_384:
                chunk = connection.recv(4096)
                if not chunk:
                    break
                response.extend(chunk)
            header, separator, remainder = bytes(response).partition(b"\r\n\r\n")
            if not separator or not header.startswith(b"HTTP/1.1 101"):
                raise BridgeError("screenshot_connection_failed", "Could not connect to the game screenshot target", 502)
            headers = {}
            for line in header.split(b"\r\n")[1:]:
                name, delimiter, value = line.partition(b":")
                if delimiter:
                    headers[name.strip().lower()] = value.strip()
            if headers.get(b"sec-websocket-accept", b"").decode("ascii", errors="ignore") != expected_accept:
                raise BridgeError("screenshot_connection_failed", "The game screenshot handshake was rejected", 502)
            if remainder:
                raise BridgeError("screenshot_protocol_failed", "The game returned an invalid screenshot handshake", 502)
            command = json.dumps({
                "id": 1,
                "method": "Page.captureScreenshot",
                "params": {"format": "png", "fromSurface": True, "captureBeyondViewport": False},
            }, separators=(",", ":")).encode("utf-8")
            _send_websocket_frame(connection, 0x1, command)
            response_payload = json.loads(_receive_websocket_message(connection).decode("utf-8"))
    except BridgeError:
        raise
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise BridgeError("screenshot_connection_failed", "Could not capture the game screenshot", 502) from error
    if response_payload.get("id") != 1 or "error" in response_payload:
        raise BridgeError("screenshot_capture_failed", "The game rejected the screenshot request", 502)
    encoded = response_payload.get("result", {}).get("data")
    try:
        image = base64.b64decode(encoded, validate=True) if isinstance(encoded, str) else b""
    except ValueError as error:
        raise BridgeError("screenshot_capture_failed", "The game returned an invalid screenshot", 502) from error
    if len(image) < 24 or not image.startswith(b"\x89PNG\r\n\x1a\n") \
            or image[12:16] != b"IHDR" or len(image) > MAX_SCREENSHOT_BYTES:
        raise BridgeError("screenshot_capture_failed", "The game returned an invalid screenshot", 502)
    return image


class OpenAICompatibleCredentialStore:
    """Store one endpoint-scoped key in the operating system credential vault."""

    MACOS_SERVICE = "fun.vnrevival.translator.openai-compatible"
    MACOS_ITEM_NOT_FOUND = -25300

    def __init__(self, credential_id: str, base_url: str):
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", credential_id or ""):
            raise ValueError("credential id must use lowercase ASCII letters, digits, and hyphens")
        scope = hashlib.sha256(base_url.encode("utf-8")).hexdigest()[:16]
        self.credential_id = f"{credential_id}-{scope}"

    @property
    def backend(self) -> str:
        if sys.platform == "darwin":
            return "macOS Keychain"
        if os.name == "nt":
            return "Windows Credential Manager"
        return "unavailable"

    @property
    def _windows_target(self) -> str:
        return f"VN Revival/OpenAI Compatible API/{self.credential_id}"

    @staticmethod
    def _macos_frameworks():
        import ctypes

        security = ctypes.CDLL(
            "/System/Library/Frameworks/Security.framework/Security"
        )
        core_foundation = ctypes.CDLL(
            "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
        )
        security.SecKeychainFindGenericPassword.argtypes = [
            ctypes.c_void_p, ctypes.c_uint32, ctypes.c_char_p,
            ctypes.c_uint32, ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_uint32), ctypes.POINTER(ctypes.c_void_p),
            ctypes.POINTER(ctypes.c_void_p),
        ]
        security.SecKeychainFindGenericPassword.restype = ctypes.c_int32
        security.SecKeychainAddGenericPassword.argtypes = [
            ctypes.c_void_p, ctypes.c_uint32, ctypes.c_char_p,
            ctypes.c_uint32, ctypes.c_char_p, ctypes.c_uint32,
            ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p),
        ]
        security.SecKeychainAddGenericPassword.restype = ctypes.c_int32
        security.SecKeychainItemModifyAttributesAndData.argtypes = [
            ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p,
        ]
        security.SecKeychainItemModifyAttributesAndData.restype = ctypes.c_int32
        security.SecKeychainItemDelete.argtypes = [ctypes.c_void_p]
        security.SecKeychainItemDelete.restype = ctypes.c_int32
        security.SecKeychainItemFreeContent.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        security.SecKeychainItemFreeContent.restype = ctypes.c_int32
        core_foundation.CFRelease.argtypes = [ctypes.c_void_p]
        core_foundation.CFRelease.restype = None
        return ctypes, security, core_foundation

    def _macos_find(self, include_password: bool):
        ctypes, security, core_foundation = self._macos_frameworks()
        service = self.MACOS_SERVICE.encode("utf-8")
        account = self.credential_id.encode("utf-8")
        password_length = ctypes.c_uint32()
        password_data = ctypes.c_void_p()
        item = ctypes.c_void_p()
        status = security.SecKeychainFindGenericPassword(
            None, len(service), service, len(account), account,
            ctypes.byref(password_length) if include_password else None,
            ctypes.byref(password_data) if include_password else None,
            ctypes.byref(item),
        )
        if status == self.MACOS_ITEM_NOT_FOUND:
            return ctypes, security, core_foundation, None, None, None
        if status != 0:
            raise BridgeError(
                "credential_store_failed", "Could not access the API key in macOS Keychain", 500
            )
        return (
            ctypes, security, core_foundation, item,
            password_length.value if include_password else None,
            password_data if include_password else None,
        )

    def get(self) -> str | None:
        if sys.platform == "darwin":
            ctypes, security, core_foundation, item, length, data = self._macos_find(True)
            if item is None:
                return None
            try:
                return ctypes.string_at(data, length).decode("utf-8") or None
            except UnicodeDecodeError as error:
                raise BridgeError(
                    "credential_store_failed", "Could not read the API key from macOS Keychain", 500
                ) from error
            finally:
                if data:
                    security.SecKeychainItemFreeContent(None, data)
                core_foundation.CFRelease(item)
        if os.name == "nt":
            return self._windows_get()
        return None

    def set(self, api_key: str) -> None:
        if sys.platform == "darwin":
            ctypes, security, core_foundation, item, _, _ = self._macos_find(False)
            service = self.MACOS_SERVICE.encode("utf-8")
            account = self.credential_id.encode("utf-8")
            encoded = api_key.encode("utf-8")
            secret = ctypes.create_string_buffer(encoded)
            try:
                if item is None:
                    status = security.SecKeychainAddGenericPassword(
                        None, len(service), service, len(account), account,
                        len(encoded), ctypes.cast(secret, ctypes.c_void_p), None,
                    )
                else:
                    status = security.SecKeychainItemModifyAttributesAndData(
                        item, None, len(encoded), ctypes.cast(secret, ctypes.c_void_p)
                    )
                if status != 0:
                    raise BridgeError(
                        "credential_store_failed", "Could not save the API key in macOS Keychain", 500
                    )
            finally:
                ctypes.memset(secret, 0, len(secret))
                if item is not None:
                    core_foundation.CFRelease(item)
            return
        if os.name == "nt":
            self._windows_set(api_key)
            return
        raise BridgeError("credential_store_unavailable", "Secure credential storage is unavailable", 501)

    def delete(self) -> None:
        if sys.platform == "darwin":
            _, security, core_foundation, item, _, _ = self._macos_find(False)
            if item is None:
                return
            try:
                if security.SecKeychainItemDelete(item) != 0:
                    raise BridgeError(
                        "credential_delete_failed", "Could not remove the API key", 500
                    )
            finally:
                core_foundation.CFRelease(item)
            return
        if os.name == "nt":
            self._windows_delete()
            return
        raise BridgeError("credential_store_unavailable", "Secure credential storage is unavailable", 501)

    @staticmethod
    def _windows_types():
        import ctypes
        from ctypes import wintypes

        class Credential(ctypes.Structure):
            _fields_ = [
                ("Flags", wintypes.DWORD), ("Type", wintypes.DWORD),
                ("TargetName", wintypes.LPWSTR), ("Comment", wintypes.LPWSTR),
                ("LastWritten", wintypes.FILETIME), ("CredentialBlobSize", wintypes.DWORD),
                ("CredentialBlob", ctypes.POINTER(ctypes.c_ubyte)),
                ("Persist", wintypes.DWORD), ("AttributeCount", wintypes.DWORD),
                ("Attributes", ctypes.c_void_p), ("TargetAlias", wintypes.LPWSTR),
                ("UserName", wintypes.LPWSTR),
            ]

        return ctypes, wintypes, Credential

    def _windows_get(self) -> str | None:
        ctypes, wintypes, credential_type = self._windows_types()
        pointer = ctypes.POINTER(credential_type)()
        read = ctypes.windll.advapi32.CredReadW
        read.argtypes = [
            wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
            ctypes.POINTER(ctypes.POINTER(credential_type)),
        ]
        read.restype = wintypes.BOOL
        if not read(self._windows_target, 1, 0, ctypes.byref(pointer)):
            return None
        try:
            credential = pointer.contents
            raw = ctypes.string_at(credential.CredentialBlob, credential.CredentialBlobSize)
            return raw.decode("utf-16-le").rstrip("\x00") or None
        finally:
            ctypes.windll.advapi32.CredFree(pointer)

    def _windows_set(self, api_key: str) -> None:
        ctypes, wintypes, credential_type = self._windows_types()
        encoded = api_key.encode("utf-16-le")
        blob = ctypes.create_string_buffer(encoded)
        credential = credential_type()
        credential.Type = 1
        credential.TargetName = self._windows_target
        credential.CredentialBlobSize = len(encoded)
        credential.CredentialBlob = ctypes.cast(blob, ctypes.POINTER(ctypes.c_ubyte))
        credential.Persist = 2
        credential.UserName = "VN Revival"
        write = ctypes.windll.advapi32.CredWriteW
        write.argtypes = [ctypes.POINTER(credential_type), wintypes.DWORD]
        write.restype = wintypes.BOOL
        if not write(ctypes.byref(credential), 0):
            raise BridgeError(
                "credential_store_failed", "Could not save the API key in Windows Credential Manager", 500
            )

    def _windows_delete(self) -> None:
        ctypes, wintypes, _ = self._windows_types()
        delete = ctypes.windll.advapi32.CredDeleteW
        delete.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD]
        delete.restype = wintypes.BOOL
        if not delete(self._windows_target, 1, 0):
            error_code = ctypes.windll.kernel32.GetLastError()
            if error_code not in (0, 1168):
                raise BridgeError("credential_delete_failed", "Could not remove the API key", 500)


class LocalServiceBridge:
    def __init__(
        self,
        data_dir: Path,
        credential_id: str = "default",
        credential_store: Any | None = None,
        cdp_port: int | None = None,
        target_title_hint: str = "",
        target_url_hint: str = "",
    ):
        self.data_dir = data_dir.expanduser().resolve()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.credential_id = credential_id
        self._injected_credential_store = credential_store
        # One routing session per launcher lifetime, shared by concurrent requests
        # and format fallbacks. This is not an auth token or a user identifier.
        self._opencode_session = uuid.uuid4().hex
        self._capture_active = False
        self._capture_id: str | None = None
        self.cdp_port = cdp_port
        self.target_title_hint = target_title_hint
        self.target_url_hint = target_url_hint
        self._screenshot_batches: dict[str, Path] = {}
        self._screenshot_batch_numbers: dict[str, int] = {}

    def log_event(self, event: str, **fields: Any) -> None:
        # Callers supply only fixed categories, numeric metrics and fingerprints.
        # Never pass exception messages, provider bodies, headers or user text.
        record = {"time": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                  "event": event, "pid": os.getpid(), **fields}
        if _TRACE_ID.get() and "request_id" not in record:
            record["request_id"] = _TRACE_ID.get()
        try:
            line = json.dumps(record, ensure_ascii=True, separators=(",", ":")) + "\n"
            with _LOG_LOCK, self.log_path.open("a", encoding="utf-8") as handle:
                handle.write(line)
        except OSError:
            pass  # A logging failure must not fail an otherwise valid translation.

    @property
    def log_path(self) -> Path:
        return self.data_dir / "local-service.log"

    def log_status(self) -> dict[str, Any]:
        try:
            size = self.log_path.stat().st_size
        except FileNotFoundError:
            size = 0
        except OSError as error:
            raise BridgeError("log_status_failed", "Could not read the log size", 500) from error
        return {"ok": True, "bytes": size}

    def read_log(self) -> dict[str, Any]:
        try:
            size = self.log_path.stat().st_size
            with self.log_path.open("rb") as handle:
                truncated = size > MAX_LOG_COPY_BYTES
                if truncated:
                    handle.seek(-MAX_LOG_COPY_BYTES, os.SEEK_END)
                content = handle.read().decode("utf-8", errors="replace")
        except FileNotFoundError:
            size, truncated, content = 0, False, ""
        except OSError as error:
            raise BridgeError("log_read_failed", "Could not read the log", 500) from error
        return {"ok": True, "bytes": size, "content": content, "truncated": truncated}

    def clear_log(self) -> dict[str, Any]:
        try:
            with _LOG_LOCK:
                self.log_path.write_bytes(b"")
        except OSError as error:
            raise BridgeError("log_clear_failed", "Could not delete the log", 500) from error
        return {"ok": True, "bytes": 0}

    @property
    def capture_path(self) -> Path:
        return self.data_dir / "translation-capture.json"

    def _read_capture_document(self) -> dict[str, Any] | None:
        try:
            value = json.loads(self.capture_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise BridgeError("capture_read_failed", "Could not read the translation capture", 500) from error
        if not isinstance(value, dict) or value.get("schema_version") != 2 \
                or not isinstance(value.get("capture_id"), str) \
                or not isinstance(value.get("request_sets"), list):
            raise BridgeError("capture_read_failed", "The translation capture is invalid", 500)
        return value

    def _write_capture_document(self, value: dict[str, Any]) -> int:
        content = json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8")
        if len(content) > MAX_CAPTURE_BYTES:
            raise BridgeError("capture_too_large", "The translation capture is full", 413)
        temporary = self.capture_path.with_suffix(".json.tmp")
        try:
            temporary.write_bytes(content)
            os.replace(temporary, self.capture_path)
        except OSError as error:
            try:
                temporary.unlink()
            except OSError:
                pass
            raise BridgeError("capture_write_failed", "Could not save the translation capture", 500) from error
        return len(content)

    def capture_status(self) -> dict[str, Any]:
        with _CAPTURE_LOCK:
            document = self._read_capture_document()
            count = len(document["request_sets"]) if document else 0
            try:
                size = self.capture_path.stat().st_size if document else 0
            except OSError:
                size = 0
            return {"ok": True, "active": self._capture_active, "sets": count, "bytes": size}

    def start_capture(self, accepted: Any) -> dict[str, Any]:
        if accepted is not True:
            raise BridgeError("confirmation_required", "Explicit confirmation is required", 400)
        with _CAPTURE_LOCK:
            self._capture_id = uuid.uuid4().hex
            document = {
                "schema_version": 2,
                "capture_id": self._capture_id,
                "started_at": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                "request_sets": [],
            }
            size = self._write_capture_document(document)
            self._capture_active = True
            return {"ok": True, "active": True, "sets": 0, "bytes": size}

    def append_capture(self, value: Any) -> dict[str, Any]:
        measured = capture_request_set(value)
        with _CAPTURE_LOCK:
            if not self._capture_active or not self._capture_id:
                raise BridgeError("capture_inactive", "Translation capture is not active", 409)
            document = self._read_capture_document()
            if not document or document.get("capture_id") != self._capture_id:
                self._capture_active = False
                self._capture_id = None
                raise BridgeError("capture_inactive", "Translation capture is not active", 409)
            comparable_fields = (
                "game_id", "game_version", "translator_version", "language", "preset",
                "model", "reasoning_effort", "requests",
            )
            if any(all(existing.get(key) == measured[key] for key in comparable_fields)
                   for existing in document["request_sets"]):
                return {"ok": True, "active": True, "sets": len(document["request_sets"]),
                        "bytes": self.capture_path.stat().st_size, "duplicate": True}
            document["request_sets"].append({
                "number": len(document["request_sets"]) + 1,
                "captured_at": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                **measured,
            })
            size = self._write_capture_document(document)
            return {"ok": True, "active": True, "sets": len(document["request_sets"]),
                    "bytes": size, "duplicate": False}

    def clear_capture(self, accepted: Any) -> dict[str, Any]:
        if accepted is not True:
            raise BridgeError("confirmation_required", "Explicit confirmation is required", 400)
        with _CAPTURE_LOCK:
            if self._capture_active:
                self._capture_id = uuid.uuid4().hex
                document = {
                    "schema_version": 2,
                    "capture_id": self._capture_id,
                    "started_at": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                    "request_sets": [],
                }
                size = self._write_capture_document(document)
                return {"ok": True, "active": True, "sets": 0, "bytes": size}
            self._capture_id = None
            try:
                self.capture_path.unlink()
            except FileNotFoundError:
                pass
            except OSError as error:
                raise BridgeError("capture_clear_failed", "Could not clear the translation capture", 500) from error
            return {"ok": True, "active": False, "sets": 0, "bytes": 0}

    def stop_capture(self) -> dict[str, Any]:
        with _CAPTURE_LOCK:
            self._capture_active = False
            self._capture_id = None
        return self.capture_status()

    def read_capture(self) -> dict[str, Any]:
        with _CAPTURE_LOCK:
            document = self._read_capture_document()
            if not document:
                return {"ok": True, "sets": 0, "bytes": 0, "content": ""}
            content = json.dumps(document, ensure_ascii=False, indent=2)
            return {"ok": True, "sets": len(document["request_sets"]),
                    "bytes": len(content.encode("utf-8")), "content": content}

    @staticmethod
    def _connection(preset: Any, base_url: Any) -> dict[str, Any]:
        preset_id = preset if isinstance(preset, str) else ""
        if preset_id not in OPENAI_COMPATIBLE_PRESETS:
            raise BridgeError("openai_preset_invalid", "Choose a valid OpenAI-compatible preset", 400)
        preset_config = OPENAI_COMPATIBLE_PRESETS[preset_id]
        value = preset_config["baseURL"] if preset_id != "custom" else base_url
        if not isinstance(value, str) or not 1 <= len(value.strip()) <= 2048:
            raise BridgeError("openai_url_invalid", "Enter an OpenAI-compatible Base URL", 400)
        value = value.strip().rstrip("/")
        if any(ord(character) < 32 or ord(character) == 127 for character in value):
            raise BridgeError("openai_url_invalid", "The Base URL is invalid", 400)
        try:
            parsed = urllib.parse.urlsplit(value)
        except ValueError as error:
            raise BridgeError("openai_url_invalid", "The Base URL is invalid", 400) from error
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise BridgeError("openai_url_invalid", "The Base URL must use HTTP or HTTPS", 400)
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise BridgeError(
                "openai_url_invalid", "The Base URL must not contain credentials, a query, or a fragment", 400
            )
        host = parsed.hostname.lower().rstrip(".")
        loopback = host == "localhost"
        try:
            loopback = loopback or ipaddress.ip_address(host).is_loopback
        except ValueError:
            pass
        if parsed.scheme == "http" and not loopback:
            raise BridgeError("openai_url_insecure", "Remote OpenAI-compatible URLs must use HTTPS", 400)
        decoded_path = urllib.parse.unquote(parsed.path)
        if ".." in [part for part in decoded_path.split("/") if part]:
            raise BridgeError("openai_url_invalid", "The Base URL path is invalid", 400)
        return {
            "preset": preset_id,
            "name": preset_config["name"],
            "baseURL": value,
            "requiresKey": bool(preset_config["requiresKey"]),
            "loopback": loopback,
        }

    def _credential_store(self, base_url: str) -> Any:
        if self._injected_credential_store is not None:
            return self._injected_credential_store
        return OpenAICompatibleCredentialStore(self.credential_id, base_url)

    def site_translation_config(self, game_slug: Any, locale: Any) -> dict[str, Any]:
        if not isinstance(game_slug, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,99}", game_slug):
            raise BridgeError("site_config_invalid", "The VN Revival game identifier is invalid", 400)
        if not isinstance(locale, str) or not re.fullmatch(r"[A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?", locale):
            raise BridgeError("site_config_invalid", "The VN Revival locale is invalid", 400)

        query = urllib.parse.urlencode({"locale": locale, "offset": 0, "limit": 1000})
        url = f"{VNREVIVAL_SITE_ORIGIN}/games/{urllib.parse.quote(game_slug, safe='')}/glossary?{query}"
        request = urllib.request.Request(
            url,
            headers={"Accept": "application/json", "User-Agent": "VNRevival-Translator/1"},
            method="GET",
        )
        started = time.monotonic()
        try:
            with open_url(request, timeout=10) as response:
                final_url = urllib.parse.urlsplit(getattr(response, "geturl", lambda: url)())
                if final_url.scheme != "https" or final_url.hostname != "vnrevival.fun":
                    raise BridgeError("site_config_invalid", "VN Revival returned an invalid redirect", 502)
                raw_response = response.read(MAX_REQUEST_BYTES + 1)
        except BridgeError:
            raise
        except urllib.error.HTTPError as error:
            error.close()
            self.log_event("site_config.result", ok=False, target=locale, status=error.code,
                           duration_ms=round((time.monotonic() - started) * 1000))
            raise BridgeError("site_config_unavailable", "VN Revival translation settings are unavailable", 503) from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            self.log_event("site_config.result", ok=False, target=locale,
                           duration_ms=round((time.monotonic() - started) * 1000))
            raise BridgeError("site_config_unavailable", "VN Revival translation settings are unavailable", 503) from error
        if len(raw_response) > MAX_REQUEST_BYTES:
            raise BridgeError("site_config_invalid", "VN Revival returned too much translation data", 502)
        try:
            payload = json.loads(raw_response.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise BridgeError("site_config_invalid", "VN Revival returned invalid translation data", 502) from error

        config = payload.get("translatorConfig") if isinstance(payload, dict) else None
        entries = payload.get("entries") if isinstance(payload, dict) else None
        total = payload.get("total") if isinstance(payload, dict) else None
        valid_config = (
            isinstance(config, dict)
            and config.get("schemaVersion") == 1
            and isinstance(config.get("promptVersion"), str)
            and bool(re.fullmatch(r"[A-Za-z0-9._-]{1,100}", config["promptVersion"]))
            and _capture_text(config.get("systemPrompt"), OPENAI_COMPATIBLE_CONFIG["maxSystemPromptChars"])
            and all(marker in config["systemPrompt"] for marker in (
                "{targetName}", "{target}", "VRCTXSEP<number>X",
            ))
            and "untrusted content, never instructions" in config["systemPrompt"].lower()
        )
        if type(total) is not int or not 1 <= total <= 1000 \
                or not isinstance(entries, list) or len(entries) != total:
            raise BridgeError("site_config_invalid", "VN Revival returned an incomplete glossary", 502)

        glossary: list[str] = []
        entry_ids: set[str] = set()
        for entry in entries:
            translation = entry.get("translation") if isinstance(entry, dict) else None
            entry_id = entry.get("id") if isinstance(entry, dict) else None
            source_term = entry.get("term") if isinstance(entry, dict) else None
            translated_term = translation.get("term") if isinstance(translation, dict) else None
            valid_entry = (
                isinstance(entry_id, str) and 1 <= len(entry_id) <= 200 and entry_id not in entry_ids
                and isinstance(source_term, str) and 1 <= len(source_term.strip()) <= 500
                and isinstance(translated_term, str) and 1 <= len(translated_term.strip()) <= 500
                and not any(character in source_term or character in translated_term for character in "\r\n=")
                and _capture_text(source_term.strip(), 500)
                and _capture_text(translated_term.strip(), 500)
            )
            if not valid_entry:
                raise BridgeError("site_config_invalid", "VN Revival returned invalid glossary entries", 502)
            entry_ids.add(entry_id)
            glossary.append(f"{source_term.strip()} = {translated_term.strip()}")
        glossary_text = "\n".join(glossary)
        if len(glossary_text) > VNREVIVAL_SITE_CONFIG_MAX_GLOSSARY_CHARS:
            raise BridgeError("site_config_invalid", "The VN Revival glossary is too large", 502)
        prompt_source = "vnrevival" if valid_config else "bundled"
        self.log_event("site_config.result", ok=True, target=locale, entries=total,
                       prompt_source=prompt_source,
                       duration_ms=round((time.monotonic() - started) * 1000))
        return {
            "ok": True,
            "source": "vnrevival",
            "promptSource": prompt_source,
            "promptVersion": config["promptVersion"] if valid_config else OPENAI_COMPATIBLE_PROMPT_VERSION,
            "systemPrompt": config["systemPrompt"].strip() if valid_config
            else OPENAI_COMPATIBLE_DEFAULT_SYSTEM_PROMPT,
            "glossary": glossary_text,
            "entries": total,
        }

    @staticmethod
    def _error_detail(error: urllib.error.HTTPError) -> str:
        try:
            raw = error.read(64_000)
        except OSError:
            raw = b""
        finally:
            error.close()
        try:
            payload = json.loads(raw.decode("utf-8"))
            detail = payload.get("error", payload)
            if isinstance(detail, dict):
                return str(detail.get("message") or detail.get("type") or "").strip()
            return str(detail).strip()
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
            return ""

    @staticmethod
    def _response_format_rejected(status: int, detail: str) -> bool:
        return status == 400 and bool(re.search(
            r"response.?format|text.?format|json.?schema|json.?object|grammar|structured", detail, re.I
        ))

    @staticmethod
    def _unsupported_model_parameter(
        status: int, detail: str, request_body: dict[str, Any]
    ) -> str | None:
        if status != 400:
            return None
        normalized = detail.lower().replace("-", "_").replace(" ", "_")
        for parameter in ("reasoning_effort", "verbosity"):
            nested = (
                parameter == "reasoning_effort"
                and isinstance(request_body.get("reasoning"), dict)
                and "effort" in request_body["reasoning"]
            ) or (
                parameter == "verbosity"
                and isinstance(request_body.get("text"), dict)
                and "verbosity" in request_body["text"]
            )
            mentioned = parameter in normalized or (
                parameter == "reasoning_effort"
                and "reasoning" in normalized and "effort" in normalized
            )
            if (parameter in request_body or nested) and mentioned:
                return parameter
        return None

    @staticmethod
    def _classified_provider_error(status: int, detail: str) -> BridgeError | None:
        """Turn provider text into a useful message without returning that text verbatim."""
        normalized = " ".join(detail.casefold().split())
        if status in (400, 401, 403, 404, 409):
            if re.search(
                r"(?:model.{0,80}(?:unavailable|not available|not found|does not exist|unknown|not supported))"
                r"|(?:no (?:available )?endpoints?.{0,40}model)",
                normalized,
            ):
                return BridgeError(
                    "openai_model_unavailable",
                    "The selected model is unavailable at the provider",
                    409,
                    provider_status=status,
                )
            if re.search(r"(?:region|country).{0,80}(?:unavailable|not available|unsupported)", normalized):
                return BridgeError(
                    "openai_model_unavailable",
                    "The selected model is unavailable in this region",
                    409,
                    provider_status=status,
                )
        if status in (400, 402, 403):
            if re.search(r"(?:insufficient|not enough).{0,40}(?:credit|balance)|billing", normalized):
                return BridgeError(
                    "openai_billing_required",
                    "The provider account has insufficient credit",
                    402,
                    provider_status=status,
                )
        if status == 400:
            if re.search(r"thinking.{0,80}cannot be disabled|reasoning.{0,80}(?:unsupported|not supported)", normalized):
                return BridgeError(
                    "openai_reasoning_unsupported",
                    "The model does not support this reasoning effort; select a supported level",
                    409, provider_status=status,
                )
            if re.search(r"(?:use|requires?|only supports?).{0,40}/?responses\b", normalized):
                return BridgeError(
                    "openai_endpoint_mismatch",
                    "The selected model requires the Responses API",
                    409,
                    provider_status=status,
                )
            if re.search(r"(?:use|requires?|only supports?).{0,40}/?messages\b", normalized):
                return BridgeError(
                    "openai_endpoint_mismatch",
                    "The selected model requires the Messages API",
                    409,
                    provider_status=status,
                )
            if re.search(r"stream.{0,40}(?:required|must be true|only)", normalized):
                return BridgeError(
                    "openai_stream_required",
                    "The selected model requires a streaming request",
                    409,
                    provider_status=status,
                )
            if re.search(r"(?:system role|system message|messages?).{0,80}(?:unsupported|invalid)", normalized):
                return BridgeError(
                    "openai_message_format_rejected",
                    "The selected model rejected the chat message format",
                    409,
                    provider_status=status,
                )
            if re.search(r"endpoint.{0,40}unavailable|upstream.{0,40}temporarily unavailable", normalized):
                return BridgeError(
                    "openai_unavailable",
                    "The provider model endpoint is temporarily unavailable",
                    503,
                    provider_status=status,
                )
        return None

    @staticmethod
    def _model_parameters(value: Any) -> dict[str, Any]:
        if value is None:
            value = {}
        if not isinstance(value, dict) or any(key not in {
            "reasoningEffort", "verbosity"
        } for key in value):
            raise BridgeError("openai_model_parameters_invalid", "The model parameters are invalid", 400)

        reasoning_effort = value.get("reasoningEffort")
        if reasoning_effort in (None, ""):
            reasoning_effort = None
        elif not isinstance(reasoning_effort, str) or reasoning_effort not in OPENAI_COMPATIBLE_REASONING_EFFORTS:
            raise BridgeError("openai_model_parameters_invalid", "The reasoning effort is invalid", 400)

        verbosity = value.get("verbosity")
        if verbosity in (None, ""):
            verbosity = None
        elif not isinstance(verbosity, str) or verbosity not in OPENAI_COMPATIBLE_VERBOSITIES:
            raise BridgeError("openai_model_parameters_invalid", "The output verbosity is invalid", 400)

        result: dict[str, Any] = {}
        if reasoning_effort is not None:
            result["reasoning_effort"] = reasoning_effort
        if verbosity is not None:
            result["verbosity"] = verbosity
        return result

    def _request_json(
        self,
        connection: dict[str, Any],
        path: str,
        body: dict[str, Any] | None = None,
        timeout: int = 15,
    ) -> dict[str, Any]:
        key = self._credential_store(connection["baseURL"]).get()
        headers = {"Accept": "application/json", "User-Agent": "VNRevival-Translator/1"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if key and path == "/messages":
            headers["x-api-key"] = key
            headers["anthropic-version"] = "2023-06-01"
        elif key:
            headers["Authorization"] = "Bearer " + key
        if connection["preset"] == "openrouter":
            headers["HTTP-Referer"] = "https://vnrevival.fun/"
            headers["X-OpenRouter-Title"] = "VN Revival Translator"
        if connection["preset"] == "opencode-go":
            headers["x-opencode-session"] = self._opencode_session
        request = urllib.request.Request(
            connection["baseURL"] + path,
            data=None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="GET" if body is None else "POST",
        )
        started = time.monotonic()
        try:
            with open_url(request, timeout=timeout) as response:
                raw_response = response.read(MAX_REQUEST_BYTES + 1)
                provider_status = getattr(response, "status", 200)
            self.log_event("provider.http", operation="completion" if body is not None else "models",
                           provider_status=provider_status, duration_ms=round((time.monotonic() - started) * 1000),
                           response_bytes=len(raw_response))
        except urllib.error.HTTPError as error:
            self.log_event("provider.http", operation="completion" if body is not None else "models",
                           provider_status=error.code, duration_ms=round((time.monotonic() - started) * 1000))
            raise
        except (urllib.error.URLError, TimeoutError, OSError):
            self.log_event("provider.transport_error", operation="completion" if body is not None else "models",
                           duration_ms=round((time.monotonic() - started) * 1000))
            raise
        if len(raw_response) > MAX_REQUEST_BYTES:
            raise BridgeError("openai_response_too_large", "The provider returned too much data", 502)
        try:
            payload = json.loads(raw_response.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise BridgeError("openai_invalid_response", "The provider returned invalid JSON", 502) from error
        if not isinstance(payload, dict):
            raise BridgeError("openai_invalid_response", "The provider returned an invalid response", 502)
        return payload

    @staticmethod
    def _models(payload: dict[str, Any], preset: str = "") -> list[str]:
        models: list[str] = []
        compatible_models = None if preset == "opencode-go" else OPENCODE_SUPPORTED_MODELS.get(preset)
        if isinstance(payload.get("data"), list):
            for item in payload["data"]:
                model_id = item.get("id") if isinstance(item, dict) else None
                compatible_model = compatible_models is None or (
                    isinstance(model_id, str) and model_id.casefold() in compatible_models
                )
                if compatible_model and isinstance(model_id, str) \
                        and 1 <= len(model_id) <= 512 and model_id not in models:
                    models.append(model_id)
        return sorted(models, key=LocalServiceBridge._model_sort_key)

    @staticmethod
    def _model_sort_key(model_id: str) -> tuple[int, str, str]:
        normalized = model_id.casefold()
        is_free = LocalServiceBridge._is_free_model(model_id)
        return (0 if is_free else 1, normalized, model_id)

    @staticmethod
    def _is_free_model(model_id: str) -> bool:
        normalized = model_id.casefold()
        return normalized == "big-pickle" or bool(re.search(
            r"(?:^|[-._/:])free(?:$|[-._/:])", normalized
        ))

    @staticmethod
    def _retry_after_ms(error: urllib.error.HTTPError) -> int | None:
        headers = getattr(error, "headers", None)
        raw_value = headers.get("Retry-After") if headers is not None else None
        if not raw_value:
            return None
        value = str(raw_value).strip()
        try:
            seconds = float(value)
        except ValueError:
            try:
                retry_at = parsedate_to_datetime(value)
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=timezone.utc)
                seconds = (retry_at - datetime.now(timezone.utc)).total_seconds()
            except (TypeError, ValueError, OverflowError):
                return None
        if seconds <= 0:
            return None
        return max(250, min(300_000, round(seconds * 1000)))

    def openai_status(self, preset: Any, base_url: Any) -> dict[str, Any]:
        connection = self._connection(preset, base_url)
        store = self._credential_store(connection["baseURL"])
        configured = bool(store.get())
        base = {
            "ok": True,
            **connection,
            "configured": configured,
            "credentialStorage": store.backend,
            "models": [],
            "available": False,
            "promptVersion": OPENAI_COMPATIBLE_PROMPT_VERSION,
        }
        if connection["requiresKey"] and not configured:
            return {**base, "message": f"Add the {connection['name']} API key first"}
        try:
            models = self._models(
                self._request_json(connection, "/models", timeout=10), connection["preset"]
            )
            return {
                **base,
                "available": True,
                "models": models,
                "message": "" if models else "Connected, but no models were listed; enter a model ID manually",
            }
        except urllib.error.HTTPError as error:
            self._error_detail(error)
            return {**base, "message": f"Provider returned HTTP {error.code}", "httpStatus": error.code}
        except (urllib.error.URLError, TimeoutError, OSError):
            return {**base, "message": "Could not connect; you may still enter a model ID manually"}

    def set_openai_key(self, preset: Any, base_url: Any, api_key: Any) -> dict[str, Any]:
        connection = self._connection(preset, base_url)
        if not isinstance(api_key, str) or not 8 <= len(api_key.strip()) <= 8192 \
                or any(ord(character) < 32 or ord(character) == 127 for character in api_key.strip()):
            raise BridgeError("invalid_api_key", "Enter a valid API key", 400)
        self._credential_store(connection["baseURL"]).set(api_key.strip())
        return self.openai_status(connection["preset"], connection["baseURL"])

    def remove_openai_key(self, preset: Any, base_url: Any) -> dict[str, Any]:
        connection = self._connection(preset, base_url)
        self._credential_store(connection["baseURL"]).delete()
        return self.openai_status(connection["preset"], connection["baseURL"])

    @staticmethod
    def _completion_content(payload: dict[str, Any]) -> str:
        try:
            content = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise BridgeError("openai_invalid_response", "The provider returned an invalid completion", 502) from error
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts = [
                item["text"] for item in content
                if isinstance(item, dict) and item.get("type") in ("text", "output_text")
                and isinstance(item.get("text"), str)
            ]
            return "".join(parts).strip()
        return ""

    @staticmethod
    def _response_content(payload: dict[str, Any]) -> str:
        direct = payload.get("output_text")
        if isinstance(direct, str):
            return direct.strip()
        output = payload.get("output")
        if not isinstance(output, list):
            raise BridgeError("openai_invalid_response", "The provider returned an invalid response", 502)
        parts: list[str] = []
        for item in output:
            if not isinstance(item, dict) or item.get("type") != "message":
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            parts.extend(
                part["text"] for part in content
                if isinstance(part, dict) and part.get("type") == "output_text"
                and isinstance(part.get("text"), str)
            )
        return "".join(parts).strip()

    @staticmethod
    def _message_content(payload: dict[str, Any]) -> str:
        content = payload.get("content")
        if not isinstance(content, list):
            raise BridgeError("openai_invalid_response", "The provider returned an invalid message", 502)
        return "".join(
            item["text"] for item in content
            if isinstance(item, dict) and item.get("type") == "text"
            and isinstance(item.get("text"), str)
        ).strip()

    @staticmethod
    def _translation_content(content: str) -> str:
        candidate = content.strip()
        fence = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", candidate, re.I | re.S)
        if fence:
            candidate = fence.group(1).strip()
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError as error:
            if candidate.startswith(("{", "[")):
                raise BridgeError("openai_invalid_response", "The provider returned invalid structured output", 502) from error
            return candidate
        translation = parsed.get("translation") if isinstance(parsed, dict) else parsed if isinstance(parsed, str) else None
        if not isinstance(translation, str):
            raise BridgeError("openai_invalid_response", "The provider returned invalid structured output", 502)
        return translation

    @staticmethod
    def _context_markers(value: str) -> list[str]:
        return re.findall(r"VRCTXSEP\d+X", value)

    def openai_translate(
        self, target: Any, target_name: Any, text: Any, model: Any, preset: Any,
        base_url: Any, system_prompt: Any = None, model_parameters: Any = None,
        *, request_id: str | None = None, diagnostics: Any = None,
    ) -> dict[str, Any]:
        diagnostics = translation_diagnostics(diagnostics)
        token = _TRACE_ID.set(request_id or uuid.uuid4().hex)
        started = time.monotonic()
        def fingerprint(value: Any) -> str:
            return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=True).encode()).hexdigest()[:24]
        try:
            known_models = set().union(*OPENCODE_CHAT_MODELS.values())
            self.log_event("translation.start", **diagnostics,
                           source_id=fingerprint(text), config_id=fingerprint([target, model, preset, base_url, system_prompt, model_parameters]),
                           model=model if isinstance(model, str) and model in known_models else "custom",
                           model_id=fingerprint(model), preset=preset if isinstance(preset, str) and preset in OPENAI_COMPATIBLE_PRESETS else "invalid",
                           target=target if isinstance(target, str) and re.fullmatch(r"[a-z]{2,3}(?:-[A-Za-z]{2,4})?", target) else "other",
                           source_chars=len(text) if isinstance(text, str) else 0,
                           prompt_chars=len(system_prompt) if isinstance(system_prompt, str) else len(OPENAI_COMPATIBLE_DEFAULT_SYSTEM_PROMPT))
            result = self._translate(target, target_name, text, model, preset, base_url, system_prompt, model_parameters)
            self.log_event("translation.result", ok=True, output_chars=len(result["translatedText"]),
                           duration_ms=round((time.monotonic() - started) * 1000))
            return result
        except BridgeError as error:
            self.log_event("translation.result", ok=False, error=error.code, helper_status=error.status,
                           provider_status=error.provider_status, retry_after_ms=error.retry_after_ms,
                           duration_ms=round((time.monotonic() - started) * 1000))
            raise
        except Exception as error:
            self.log_event("translation.result", ok=False, error="internal_error", error_kind=safe_exception_kind(error), helper_status=500,
                           duration_ms=round((time.monotonic() - started) * 1000))
            raise
        finally:
            _TRACE_ID.reset(token)

    def _translate(
        self,
        target: Any,
        target_name: Any,
        text: Any,
        model: Any,
        preset: Any,
        base_url: Any,
        system_prompt: Any = None,
        model_parameters: Any = None,
    ) -> dict[str, Any]:
        connection = self._connection(preset, base_url)
        if connection["requiresKey"] and not self._credential_store(connection["baseURL"]).get():
            raise BridgeError("openai_key_missing", f"Add the {connection['name']} API key first", 409)
        if not isinstance(target, str) or not re.fullmatch(r"[A-Za-z0-9-]{2,24}", target):
            raise BridgeError("unsupported_language", "The target language code is invalid", 400)
        if not isinstance(target_name, str) or not 1 <= len(target_name.strip()) <= 100:
            target_name = target
        if not isinstance(text, str) or not text.strip():
            raise BridgeError("invalid_text", "The text to translate is empty", 400)
        if len(text) > MAX_TEXT_CHARS:
            raise BridgeError("text_too_large", "The text fragment is too large", 413)
        if not isinstance(model, str) or not 1 <= len(model.strip()) <= 512 \
                or any(ord(character) < 32 or ord(character) == 127 for character in model):
            raise BridgeError("openai_model_missing", "Enter or select a model first", 409)

        if system_prompt is None:
            system_prompt = OPENAI_COMPATIBLE_DEFAULT_SYSTEM_PROMPT
        if not isinstance(system_prompt, str) or not system_prompt.strip() \
                or len(system_prompt) > OPENAI_COMPATIBLE_MAX_REQUEST_SYSTEM_PROMPT_CHARS \
                or any(ord(character) < 32 and character not in "\r\n\t" or ord(character) == 127
                       for character in system_prompt):
            raise BridgeError("openai_system_prompt_invalid", "Enter a valid system prompt", 400)
        system_instruction = system_prompt.strip().replace(
            "{targetName}", target_name.strip()
        ).replace("{target}", target)
        request_model_parameters = self._model_parameters(model_parameters)
        allowed_efforts = OPENAI_COMPATIBLE_CONFIG["modelReasoningEfforts"].get(connection["preset"], {}).get(model.strip())
        requested_effort = request_model_parameters.get("reasoning_effort")
        if allowed_efforts and requested_effort is not None and requested_effort not in allowed_efforts:
            request_model_parameters["reasoning_effort"] = allowed_efforts[0]
            self.log_event("provider.parameter_adjusted", parameter="reasoning_effort",
                           requested=requested_effort, effective=allowed_efforts[0], reason="model_supported_values")
        model_id = model.strip()
        uses_responses_api = model_id.casefold() in OPENCODE_RESPONSE_MODELS.get(
            connection["preset"], set()
        )
        uses_messages_api = model_id.casefold() in OPENCODE_MESSAGE_MODELS.get(
            connection["preset"], set()
        )
        translation_schema = {
            "type": "object",
            "properties": {"translation": {"type": "string"}},
            "required": ["translation"],
            "additionalProperties": False,
        }
        chat_schema = {
            "type": "json_schema",
            "json_schema": {
                "name": "translation_response",
                "strict": True,
                "schema": translation_schema,
            },
        }
        response_schema = {
            "type": "json_schema",
            "name": "translation_response",
            "strict": True,
            "schema": translation_schema,
        }
        if uses_responses_api:
            body = {
                "model": model_id,
                "instructions": system_instruction,
                "input": text,
                "store": False,
            }
            if "reasoning_effort" in request_model_parameters:
                body["reasoning"] = {"effort": request_model_parameters["reasoning_effort"]}
            if "verbosity" in request_model_parameters:
                body["text"] = {"verbosity": request_model_parameters["verbosity"]}
        elif uses_messages_api:
            body = {
                "model": model_id,
                "system": system_instruction,
                "messages": [{"role": "user", "content": text}],
                "max_tokens": 16_384,
                "stream": False,
            }
        else:
            body = {
                "model": model_id,
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": text},
                ],
                "stream": False,
                **request_model_parameters,
            }
        try:
            payload = None
            measured_usage: dict[str, Any] = {"usage_available": False, "cost_available": False}
            ignored_model_parameters: list[str] = []
            if uses_messages_api:
                ignored_model_parameters.extend(request_model_parameters)
                request_model_parameters.clear()
            response_formats = [None] if uses_messages_api or (
                connection["preset"] == "opencode-zen" and self._is_free_model(model.strip())
            ) else [response_schema if uses_responses_api else chat_schema, {"type": "json_object"}, None]
            response_format_index = 0
            attempt = 0
            while response_format_index < len(response_formats):
                response_format = response_formats[response_format_index]
                if response_format is None:
                    request_body = body
                elif uses_responses_api:
                    request_body = {
                        **body,
                        "text": {**body.get("text", {}), "format": response_format},
                    }
                else:
                    request_body = {**body, "response_format": response_format}
                attempt += 1
                self.log_event("provider.attempt", attempt=attempt,
                               response_format=response_format["type"] if response_format else "none",
                               reasoning_effort=request_model_parameters.get("reasoning_effort", "default"),
                               verbosity=request_model_parameters.get("verbosity", "default"),
                               api="responses" if uses_responses_api else "messages" if uses_messages_api
                               else "chat_completions")
                try:
                    path = "/responses" if uses_responses_api else "/messages" if uses_messages_api \
                        else "/chat/completions"
                    payload = self._request_json(connection, path, request_body, timeout=300)
                    if uses_responses_api:
                        finish = payload.get("status")
                    elif uses_messages_api:
                        finish = payload.get("stop_reason")
                    else:
                        choices = payload.get("choices")
                        choice = choices[0] if isinstance(choices, list) and choices else None
                        finish = choice.get("finish_reason") if isinstance(choice, dict) else None
                    measured_usage = token_usage(payload)
                    self.log_event("provider.usage", attempt=attempt, **measured_usage,
                                   finish_reason=finish if finish in (
                                       "stop", "length", "content_filter", "tool_calls", "completed", "incomplete",
                                       "end_turn", "max_tokens", "stop_sequence",
                                   ) else "unknown")
                    break
                except urllib.error.HTTPError as error:
                    retry_after_ms = self._retry_after_ms(error)
                    detail = self._error_detail(error)
                    classified = self._classified_provider_error(error.code, detail)
                    reason = classified.code if classified else "unclassified"
                    if error.code == 400 and ("x-opencode-session" in detail.lower() or "missingsessionid" in detail.lower()):
                        reason = "missing_session_id"
                    self.log_event("provider.rejected", attempt=attempt, provider_status=error.code,
                                   reason=reason, retry_after_ms=retry_after_ms)
                    unsupported_parameter = self._unsupported_model_parameter(
                        error.code, detail, request_body
                    )
                    if unsupported_parameter:
                        self.log_event("provider.fallback", attempt=attempt, provider_status=error.code,
                                       reason="unsupported_parameter", parameter=unsupported_parameter)
                        if uses_responses_api and unsupported_parameter == "reasoning_effort":
                            body.pop("reasoning", None)
                        elif uses_responses_api and unsupported_parameter == "verbosity":
                            text_options = body.get("text")
                            if isinstance(text_options, dict):
                                text_options.pop("verbosity", None)
                                if not text_options:
                                    body.pop("text", None)
                        else:
                            body.pop(unsupported_parameter, None)
                        request_model_parameters.pop(unsupported_parameter, None)
                        ignored_model_parameters.append(unsupported_parameter)
                        continue
                    if response_format_index < len(response_formats) - 1 \
                            and self._response_format_rejected(error.code, detail):
                        self.log_event("provider.fallback", attempt=attempt, provider_status=error.code,
                                       reason="unsupported_response_format")
                        response_format_index += 1
                        continue
                    classified_error = self._classified_provider_error(error.code, detail)
                    if classified_error is not None:
                        raise classified_error from error
                    if error.code in (401, 403):
                        raise BridgeError(
                            "openai_key_invalid", "The API key was rejected", 401,
                            provider_status=error.code,
                        ) from error
                    if error.code in (404, 409):
                        raise BridgeError(
                            "openai_model_unavailable", "The selected model is unavailable", 409,
                            provider_status=error.code,
                        ) from error
                    if error.code == 429:
                        raise BridgeError(
                            "openai_rate_limited", "The provider rate limit was reached", 429,
                            provider_status=error.code, retry_after_ms=retry_after_ms,
                        ) from error
                    raise BridgeError(
                        "openai_request_failed", f"Provider returned HTTP {error.code}", 502,
                        provider_status=error.code,
                    ) from error
            if payload is None:
                raise BridgeError("openai_request_failed", "The provider returned no response", 502)
        except BridgeError:
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise BridgeError(
                "openai_unavailable", "Could not connect to the OpenAI-compatible provider", 503
            ) from error

        try:
            if finish in ("length", "incomplete", "max_tokens", "content_filter", "tool_calls"):
                raise BridgeError("openai_incomplete_translation", "The provider did not complete the translation", 422)
            content = self._response_content(payload) if uses_responses_api \
                else self._message_content(payload) if uses_messages_api \
                else self._completion_content(payload)
            if not content:
                raise BridgeError("openai_empty_translation", "The provider returned an empty translation", 502)
            translation = self._translation_content(content).strip()
            if not translation:
                raise BridgeError("openai_empty_translation", "The provider returned an empty translation", 502)
            if self._context_markers(text) != self._context_markers(translation):
                raise BridgeError("openai_format_invalid", "The provider changed a context marker", 422)
        except BridgeError as error:
            error.usage = measured_usage
            raise
        return {
            "ok": True,
            "translatedText": translation,
            "model": model.strip(),
            "preset": connection["preset"],
            "baseURL": connection["baseURL"],
            "loopback": connection["loopback"],
            "promptVersion": OPENAI_COMPATIBLE_PROMPT_VERSION,
            "ignoredModelParameters": ignored_model_parameters,
            "usage": measured_usage,
            "reviewed": False,
        }

    def request_game_executable_change(self) -> dict[str, Any]:
        marker = self.data_dir / ".reselect-game-executable"
        marker.write_text("requested\n", encoding="utf-8")
        return {"ok": True, "reselectOnNextLaunch": True}

    def _screenshot_target_url(self) -> str:
        if not self.cdp_port or not (self.target_title_hint or self.target_url_hint):
            raise BridgeError("screenshots_unavailable", "Game screenshots are unavailable in this launch", 503)
        connection = http.client.HTTPConnection("127.0.0.1", self.cdp_port, timeout=3)
        try:
            connection.request("GET", "/json/list", headers={"Connection": "close"})
            response = connection.getresponse()
            content = response.read(MAX_REQUEST_BYTES + 1)
        except OSError as error:
            raise BridgeError("screenshot_connection_failed", "Could not connect to the running game", 502) from error
        finally:
            connection.close()
        if response.status != 200 or len(content) > MAX_REQUEST_BYTES:
            raise BridgeError("screenshot_connection_failed", "Could not read the running game target", 502)
        try:
            targets = json.loads(content.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise BridgeError("screenshot_target_invalid", "The running game target is invalid", 502) from error
        for target in targets if isinstance(targets, list) else []:
            if not isinstance(target, dict) or target.get("type") != "page":
                continue
            title = str(target.get("title") or "")
            url = str(target.get("url") or "")
            title_matches = bool(self.target_title_hint) \
                and self.target_title_hint.casefold() in title.casefold()
            url_matches = bool(self.target_url_hint) \
                and self.target_url_hint.casefold() in url.casefold()
            websocket_url = target.get("webSocketDebuggerUrl")
            if (title_matches or url_matches) and isinstance(websocket_url, str):
                parsed = urllib.parse.urlsplit(websocket_url)
                if parsed.scheme == "ws" and parsed.hostname == "127.0.0.1" \
                        and parsed.port == self.cdp_port:
                    return websocket_url
        raise BridgeError("screenshot_target_missing", "The game page is not available", 502)

    @property
    def screenshots_path(self) -> Path:
        return self.data_dir / "screenshots"

    @staticmethod
    def _write_screenshot_manifest(directory: Path, document: dict[str, Any]) -> None:
        destination = directory / "screenshots-evidence.json"
        temporary = destination.with_suffix(".json.tmp")
        try:
            temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            os.replace(temporary, destination)
        except OSError as error:
            try:
                temporary.unlink()
            except OSError:
                pass
            raise BridgeError("screenshot_write_failed", "Could not save screenshot evidence", 500) from error

    def capture_screenshot(
        self, batch_id: Any, locale: Any, screenshot_number: Any, sequence: Any, total: Any,
        translator_version: Any, game_version: Any,
    ) -> dict[str, Any]:
        if not isinstance(batch_id, str) or not re.fullmatch(r"[0-9a-f]{32}", batch_id):
            raise BridgeError("screenshot_request_invalid", "Invalid screenshot batch", 400)
        if not isinstance(locale, str) or not re.fullmatch(r"[a-z]{2,3}(?:-[A-Z]{2})?", locale):
            raise BridgeError("screenshot_request_invalid", "Invalid screenshot locale", 400)
        if type(screenshot_number) is not int or not 1 <= screenshot_number <= 999:
            raise BridgeError("screenshot_request_invalid", "Invalid screenshot number", 400)
        if type(sequence) is not int or not 1 <= sequence <= 99:
            raise BridgeError("screenshot_request_invalid", "Invalid screenshot sequence", 400)
        if type(total) is not int or not 1 <= total <= 99 or sequence > total:
            raise BridgeError("screenshot_request_invalid", "Invalid screenshot total", 400)
        if not isinstance(translator_version, str) or not 1 <= len(translator_version) <= 64 \
                or any(ord(character) < 32 for character in translator_version):
            raise BridgeError("screenshot_request_invalid", "Invalid translator version", 400)
        if not isinstance(game_version, str) or len(game_version) > 64 \
                or any(ord(character) < 32 for character in game_version):
            raise BridgeError("screenshot_request_invalid", "Invalid game version", 400)
        with _SCREENSHOT_LOCK:
            directory = self._screenshot_batches.get(batch_id)
            if directory is not None:
                if self._screenshot_batch_numbers.get(batch_id) != screenshot_number:
                    raise BridgeError("screenshot_request_invalid", "Screenshot number changed during the batch", 409)
                destination = directory / f"{locale}-{screenshot_number}-Gameplay.png"
                if destination.exists():
                    raise BridgeError("screenshot_exists", "This locale screenshot already exists", 409)
            image = _capture_cdp_png(self._screenshot_target_url())
            if directory is None:
                stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                directory = self.screenshots_path / f"{stamp}-{batch_id[:8]}"
                try:
                    directory.mkdir(parents=True, exist_ok=False)
                except FileExistsError as error:
                    raise BridgeError("screenshot_batch_exists", "The screenshot batch already exists", 409) from error
                except OSError as error:
                    raise BridgeError("screenshot_write_failed", "Could not create the screenshot folder", 500) from error
                self._screenshot_batches[batch_id] = directory
                self._screenshot_batch_numbers[batch_id] = screenshot_number
                self._write_screenshot_manifest(directory, {
                    "schemaVersion": 1,
                    "batchId": batch_id,
                    "createdAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                    "captureMethod": "Chromium CDP Page.captureScreenshot",
                    "translatorVersion": translator_version,
                    "gameVersion": game_version or None,
                    "screenshotNumber": screenshot_number,
                    "content": "Gameplay",
                    "expectedScreenshots": total,
                    "automatedResult": "running",
                    "visualReview": {"status": "pending"},
                    "result": "capture-running-review-pending",
                    "screenshots": [],
                })
            destination = directory / f"{locale}-{screenshot_number}-Gameplay.png"
            temporary = destination.with_suffix(".png.tmp")
            try:
                temporary.write_bytes(image)
                os.replace(temporary, destination)
            except OSError as error:
                try:
                    temporary.unlink()
                except OSError:
                    pass
                raise BridgeError("screenshot_write_failed", "Could not save the game screenshot", 500) from error
            width, height = struct.unpack("!II", image[16:24])
            manifest_path = directory / "screenshots-evidence.json"
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                if manifest.get("batchId") != batch_id or manifest.get("expectedScreenshots") != total:
                    raise ValueError("batch metadata mismatch")
                screenshots = manifest.get("screenshots")
                if not isinstance(screenshots, list):
                    raise ValueError("batch screenshot list is invalid")
                screenshots.append({
                    "locale": locale,
                    "number": screenshot_number,
                    "content": "Gameplay",
                    "sequence": sequence,
                    "file": destination.name,
                    "width": width,
                    "height": height,
                    "bytes": len(image),
                    "sha256": hashlib.sha256(image).hexdigest(),
                    "capturedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                })
                self._write_screenshot_manifest(directory, manifest)
            except BridgeError:
                try:
                    destination.unlink()
                except OSError:
                    pass
                raise
            except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError, TypeError) as error:
                try:
                    destination.unlink()
                except OSError:
                    pass
                raise BridgeError("screenshot_write_failed", "Could not update screenshot evidence", 500) from error
            self.log_event("screenshot.saved", locale=locale, sequence=sequence,
                           width=width, height=height, bytes=len(image))
            return {"ok": True, "locale": locale, "number": screenshot_number, "sequence": sequence,
                    "file": destination.name, "directory": str(directory),
                    "width": width, "height": height, "bytes": len(image)}

    def finish_screenshot_batch(
        self, batch_id: Any, outcome: Any, captured: Any, expected: Any, settings_restored: Any,
    ) -> dict[str, Any]:
        if not isinstance(batch_id, str) or not re.fullmatch(r"[0-9a-f]{32}", batch_id) \
                or outcome not in ("complete", "failed", "cancelled") \
                or type(captured) is not int or type(expected) is not int \
                or not 0 <= captured <= expected <= 99 or settings_restored is not True:
            raise BridgeError("screenshot_request_invalid", "Invalid screenshot completion", 400)
        with _SCREENSHOT_LOCK:
            directory = self._screenshot_batches.get(batch_id)
            if directory is None:
                raise BridgeError("screenshot_batch_missing", "The screenshot batch is unavailable", 404)
            try:
                manifest = json.loads((directory / "screenshots-evidence.json").read_text(encoding="utf-8"))
            except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
                raise BridgeError("screenshot_write_failed", "Could not read screenshot evidence", 500) from error
            if len(manifest.get("screenshots", [])) != captured or manifest.get("expectedScreenshots") != expected:
                raise BridgeError("screenshot_request_invalid", "Screenshot completion does not match the batch", 409)
            automated_result = "pass" if outcome == "complete" and captured == expected else "fail"
            manifest.update({
                "completedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                "outcome": outcome,
                "capturedScreenshots": captured,
                "settingsRestored": True,
                "automatedResult": automated_result,
                "result": "capture-pass-review-pending" if automated_result == "pass" else "automated-fail",
            })
            self._write_screenshot_manifest(directory, manifest)
            self.log_event("screenshot.batch", outcome=outcome, captured=captured, expected=expected)
            return {"ok": True, "directory": str(directory), "captured": captured,
                    "expected": expected, "automatedResult": automated_result}

    def open_screenshot_batch(self, batch_id: Any) -> dict[str, Any]:
        if not isinstance(batch_id, str) or not re.fullmatch(r"[0-9a-f]{32}", batch_id):
            raise BridgeError("screenshot_request_invalid", "Invalid screenshot batch", 400)
        directory = self._screenshot_batches.get(batch_id)
        if directory is None or not directory.is_dir():
            raise BridgeError("screenshot_batch_missing", "The screenshot batch is unavailable", 404)
        try:
            if sys.platform == "darwin":
                subprocess.Popen(["/usr/bin/open", str(directory)], stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL)
            elif os.name == "nt":
                os.startfile(str(directory))  # type: ignore[attr-defined]
            else:
                raise BridgeError("screenshot_folder_open_failed", "Could not open the screenshot folder", 501)
        except OSError as error:
            raise BridgeError("screenshot_folder_open_failed", "Could not open the screenshot folder", 500) from error
        return {"ok": True, "opened": True, "directory": str(directory)}

    @staticmethod
    def _open_external_url(url: str) -> None:
        try:
            if sys.platform == "darwin":
                subprocess.Popen(
                    ["/usr/bin/open", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                return
            if os.name == "nt":
                os.startfile(url)  # type: ignore[attr-defined]
                return
        except OSError as error:
            raise BridgeError("browser_open_failed", "Could not open the system browser", 500) from error
        raise BridgeError("browser_open_failed", "Could not open the system browser", 501)

    def open_vnrevival_game_page(self, game_slug: Any) -> dict[str, Any]:
        if not isinstance(game_slug, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,99}", game_slug):
            raise BridgeError("invalid_game_slug", "Invalid game page", 400)
        url = f"{VNREVIVAL_SITE_ORIGIN}/ru/games/{game_slug}#translation-how-title"
        self._open_external_url(url)
        return {"ok": True, "opened": True}


class LocalServiceRequestHandler(BaseHTTPRequestHandler):
    server_version = "VNRevivalLocal/1"

    @property
    def bridge(self) -> LocalServiceBridge:
        return self.server.bridge

    def log_message(self, fmt: str, *args: Any) -> None:
        pass  # Structured response events replace BaseHTTPRequestHandler text logs.

    def _headers(self, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-VNRevival-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def _write_json(self, payload: dict[str, Any], status: int = 200) -> None:
        if not self.path.startswith("/v1/log/") and self.path != "/v1/translation-metrics":
            self.bridge.log_event("http.response", request_id=getattr(self, "request_id", None),
                                  route=self.path if self.path in _LOG_ROUTES else "other", helper_status=status,
                                  error=payload.get("error"), provider_status=payload.get("providerStatus"))
        try:
            self._headers(status)
            self.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            self.bridge.log_event("client.disconnected", request_id=getattr(self, "request_id", None))

    def _require_auth(self) -> None:
        token = self.headers.get("X-VNRevival-Token", "")
        if not token or token != self.server.auth_token:
            raise BridgeError("unauthorized", "Invalid local helper token", 401)

    def _read_json(self) -> dict[str, Any]:
        raw_length = self.headers.get("Content-Length", "0")
        if not re.fullmatch(r"\d+", raw_length):
            raise BridgeError("invalid_request", "Invalid request size", 400)
        length = int(raw_length)
        if length <= 0 or length > MAX_REQUEST_BYTES:
            raise BridgeError("request_too_large", "The request size is not allowed", 413)
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise BridgeError("invalid_json", "Invalid request format", 400) from error
        if not isinstance(payload, dict):
            raise BridgeError("invalid_json", "A JSON object was expected", 400)
        return payload

    def do_OPTIONS(self) -> None:
        self._headers(204)

    def do_GET(self) -> None:
        self.request_id = uuid.uuid4().hex
        trace_token = _TRACE_ID.set(self.request_id)
        try:
            self._require_auth()
            if self.path != "/v1/health":
                raise BridgeError("not_found", "Unknown endpoint", 404)
            self._write_json({"ok": True, "service": "vnrevival-local"})
        except BridgeError as error:
            payload: dict[str, Any] = {"ok": False, "error": error.code, "message": str(error)}
            if error.provider_status is not None:
                payload["providerStatus"] = error.provider_status
            if error.retry_after_ms is not None:
                payload["retryAfterMs"] = error.retry_after_ms
            if error.usage is not None:
                payload["usage"] = error.usage
            self._write_json(payload, error.status)
        except Exception as error:
            self.bridge.log_event("http.internal_error", error_kind=safe_exception_kind(error))
            self._write_json({"ok": False, "error": "internal_error", "message": "Internal service error"}, 500)
        finally:
            _TRACE_ID.reset(trace_token)

    def do_POST(self) -> None:
        self.request_id = uuid.uuid4().hex
        trace_token = _TRACE_ID.set(self.request_id)
        try:
            self._require_auth()
            payload = self._read_json()
            if self.path == "/v1/openai-compatible/status":
                result = self.bridge.openai_status(payload.get("preset"), payload.get("baseURL"))
            elif self.path == "/v1/vnrevival/translation-config":
                result = self.bridge.site_translation_config(
                    payload.get("gameSlug"), payload.get("locale")
                )
            elif self.path == "/v1/vnrevival/open-game-page":
                result = self.bridge.open_vnrevival_game_page(payload.get("gameSlug"))
            elif self.path == "/v1/screenshots/capture":
                result = self.bridge.capture_screenshot(
                    payload.get("batchId"), payload.get("locale"), payload.get("screenshotNumber"),
                    payload.get("sequence"), payload.get("total"),
                    payload.get("translatorVersion"), payload.get("gameVersion")
                )
            elif self.path == "/v1/screenshots/finish":
                result = self.bridge.finish_screenshot_batch(
                    payload.get("batchId"), payload.get("outcome"), payload.get("captured"),
                    payload.get("expected"), payload.get("settingsRestored")
                )
            elif self.path == "/v1/screenshots/open":
                result = self.bridge.open_screenshot_batch(payload.get("batchId"))
            elif self.path == "/v1/translation-metrics":
                measured = screen_metrics(payload)
                self.bridge.log_event("screen." + payload["phase"], **measured)
                result = {"ok": True}
            elif self.path == "/v1/log/status":
                result = self.bridge.log_status()
            elif self.path == "/v1/log/read":
                result = self.bridge.read_log()
            elif self.path == "/v1/log/clear":
                if payload.get("accepted") is not True:
                    raise BridgeError("confirmation_required", "Explicit confirmation is required", 400)
                result = self.bridge.clear_log()
            elif self.path == "/v1/capture/status":
                result = self.bridge.capture_status()
            elif self.path == "/v1/capture/start":
                result = self.bridge.start_capture(payload.get("accepted"))
            elif self.path == "/v1/capture/append":
                result = self.bridge.append_capture(payload)
            elif self.path == "/v1/capture/stop":
                result = self.bridge.stop_capture()
            elif self.path == "/v1/capture/read":
                result = self.bridge.read_capture()
            elif self.path == "/v1/capture/clear":
                result = self.bridge.clear_capture(payload.get("accepted"))
            elif self.path == "/v1/openai-compatible/key":
                result = self.bridge.set_openai_key(
                    payload.get("preset"), payload.get("baseURL"), payload.get("apiKey")
                )
            elif self.path == "/v1/openai-compatible/key/remove":
                if payload.get("accepted") is not True:
                    raise BridgeError("confirmation_required", "Explicit confirmation is required", 400)
                result = self.bridge.remove_openai_key(payload.get("preset"), payload.get("baseURL"))
            elif self.path == "/v1/openai-compatible/translate":
                result = self.bridge.openai_translate(
                    payload.get("target"), payload.get("targetName"), payload.get("text"),
                    payload.get("model"), payload.get("preset"), payload.get("baseURL"),
                    payload.get("systemPrompt"), payload.get("modelParameters"),
                    request_id=self.request_id, diagnostics=payload.get("diagnostics"),
                )
            elif self.path == "/v1/launcher/reselect-executable":
                if payload.get("accepted") is not True:
                    raise BridgeError("confirmation_required", "Explicit confirmation is required", 400)
                result = self.bridge.request_game_executable_change()
            else:
                raise BridgeError("not_found", "Unknown endpoint", 404)
            self._write_json(result)
        except BridgeError as error:
            payload = {"ok": False, "error": error.code, "message": str(error)}
            if error.provider_status is not None:
                payload["providerStatus"] = error.provider_status
            if error.retry_after_ms is not None:
                payload["retryAfterMs"] = error.retry_after_ms
            if error.usage is not None:
                payload["usage"] = error.usage
            self._write_json(payload, error.status)
        except Exception as error:
            self.bridge.log_event("http.internal_error", error_kind=safe_exception_kind(error))
            self._write_json({"ok": False, "error": "internal_error", "message": "Internal service error"}, 500)
        finally:
            _TRACE_ID.reset(trace_token)


class LocalServiceHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address) -> None:
        self.bridge.log_event("http.internal_error", error="unhandled_request_error")

    def __init__(self, address, handler, bridge: LocalServiceBridge, auth_token: str):
        super().__init__(address, handler)
        self.bridge = bridge
        self.auth_token = auth_token


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="VN Revival local translation service")
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--token", required=True)
    parser.add_argument("--data-dir", required=True, type=Path)
    parser.add_argument("--credential-id", required=True)
    parser.add_argument("--cdp-port", type=int)
    parser.add_argument("--target-title-hint", default="")
    parser.add_argument("--target-url-hint", default="")
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    if len(args.token) < 16:
        parser.error("token must contain at least 16 characters")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", args.credential_id):
        parser.error("credential-id must use lowercase ASCII letters, digits, and hyphens")
    if args.cdp_port is not None and not 1 <= args.cdp_port <= 65535:
        parser.error("cdp-port must be between 1 and 65535")
    if args.cdp_port is not None and not (args.target_title_hint or args.target_url_hint):
        parser.error("a target title or URL hint is required with cdp-port")
    return args


def main() -> None:
    args = parse_args()
    bridge = LocalServiceBridge(
        args.data_dir,
        credential_id=args.credential_id,
        cdp_port=args.cdp_port,
        target_title_hint=args.target_title_hint,
        target_url_hint=args.target_url_hint,
    )
    server = LocalServiceHTTPServer(
        ("127.0.0.1", args.port), LocalServiceRequestHandler, bridge, args.token
    )
    bridge.log_event("service.start", log_schema=1)
    server.serve_forever(poll_interval=0.25)


if __name__ == "__main__":
    main()
