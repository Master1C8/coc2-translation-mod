import io
import json
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import local_service


class FakeCredentialStore:
    backend = "test credential vault"

    def __init__(self, value=None):
        self.value = value

    def get(self):
        return self.value

    def set(self, value):
        self.value = value

    def delete(self):
        self.value = None


class FakeHTTPResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, _limit=-1):
        return self.payload


class LocalServiceTests(unittest.TestCase):
    def bridge(self, directory, key=None):
        return local_service.LocalServiceBridge(
            Path(directory), credential_id="coc2", credential_store=FakeCredentialStore(key)
        )

    def test_presets_cover_the_supported_openai_compatible_endpoints(self):
        self.assertEqual(list(local_service.OPENAI_COMPATIBLE_PRESETS), [
            "opencode-go", "opencode-zen", "openrouter", "deepseek", "lmstudio", "custom"
        ])
        self.assertEqual(
            local_service.LocalServiceBridge._connection("lmstudio", "ignored")["baseURL"],
            "http://127.0.0.1:1234/v1",
        )

    def test_remote_http_is_rejected_but_loopback_http_is_allowed(self):
        with self.assertRaises(local_service.BridgeError) as caught:
            local_service.LocalServiceBridge._connection("custom", "http://example.com/v1")
        self.assertEqual(caught.exception.code, "openai_url_insecure")
        for url in ("http://127.0.0.1:9000/v1", "http://[::1]:9000/v1", "http://localhost:9000/v1"):
            self.assertTrue(local_service.LocalServiceBridge._connection("custom", url)["loopback"])

    def test_base_url_rejects_credentials_query_fragment_and_traversal(self):
        for url in (
            "https://user:secret@example.com/v1",
            "https://example.com/v1?token=secret",
            "https://example.com/v1#fragment",
            "https://example.com/v1/%2e%2e/admin",
        ):
            with self.subTest(url=url), self.assertRaises(local_service.BridgeError):
                local_service.LocalServiceBridge._connection("custom", url)

    def test_credentials_are_scoped_to_the_endpoint(self):
        left = local_service.OpenAICompatibleCredentialStore("coc2", "https://one.example/v1")
        right = local_service.OpenAICompatibleCredentialStore("coc2", "https://two.example/v1")
        self.assertNotEqual(left.credential_id, right.credential_id)
        self.assertTrue(left.credential_id.startswith("coc2-"))

    def test_macos_keychain_receives_secret_over_stdin_not_process_arguments(self):
        store = local_service.OpenAICompatibleCredentialStore("coc2", "https://example.test/v1")
        api_key = "secret-key-that-is-long-enough"
        completed = mock.Mock(returncode=0, stderr="")
        with mock.patch.object(local_service.sys, "platform", "darwin"), \
                mock.patch.object(local_service.subprocess, "run", return_value=completed) as run:
            store.set(api_key)
        command = run.call_args.args[0]
        self.assertNotIn(api_key, command)
        self.assertEqual(command[-1], "-w")
        self.assertEqual(run.call_args.kwargs["input"], f"{api_key}\n{api_key}\n")

    def test_status_does_not_contact_a_keyed_preset_before_a_key_is_saved(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = self.bridge(directory)
            with mock.patch.object(local_service.urllib.request, "urlopen") as urlopen:
                status = bridge.openai_status("openrouter", "ignored")
            self.assertFalse(status["available"])
            self.assertFalse(status["configured"])
            self.assertEqual(status["models"], [])
            urlopen.assert_not_called()

    def test_status_fetches_models_with_the_vault_key_in_a_header(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = self.bridge(directory, "secret-key-that-is-long-enough")
            captured = {}

            def fake_open(request, timeout):
                captured["request"] = request
                captured["timeout"] = timeout
                return FakeHTTPResponse({"data": [{"id": "model/b"}, {"id": "model/a"}]})

            with mock.patch.object(local_service.urllib.request, "urlopen", side_effect=fake_open):
                status = bridge.openai_status("openrouter", "ignored")
            self.assertEqual(status["models"], ["model/b", "model/a"])
            self.assertEqual(captured["request"].get_header("Authorization"), "Bearer secret-key-that-is-long-enough")
            self.assertNotIn("secret-key", captured["request"].full_url)

    def test_translation_uses_chat_completions_and_marks_output_unreviewed(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = self.bridge(directory, "secret-key-that-is-long-enough")
            captured = {}

            def fake_open(request, timeout):
                captured["request"] = request
                captured["timeout"] = timeout
                return FakeHTTPResponse({
                    "choices": [{"message": {"content": json.dumps({
                        "translation": "Вы видите VRCTXSEP1X дверь."
                    })}}]
                })

            with mock.patch.object(local_service.urllib.request, "urlopen", side_effect=fake_open):
                result = bridge.openai_translate(
                    "ru", "Russian", "You see VRCTXSEP1X a door.", "provider/model",
                    "openrouter", "ignored",
                )
            request_body = json.loads(captured["request"].data.decode("utf-8"))
            self.assertTrue(captured["request"].full_url.endswith("/chat/completions"))
            self.assertIn("untrusted content", request_body["messages"][0]["content"])
            self.assertEqual(request_body["messages"][1]["content"], "You see VRCTXSEP1X a door.")
            self.assertIn("response_format", request_body)
            self.assertEqual(result["translatedText"], "Вы видите VRCTXSEP1X дверь.")
            self.assertIs(result["reviewed"], False)

    def test_translation_rejects_changed_context_markers(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = self.bridge(directory, "secret-key-that-is-long-enough")
            response = FakeHTTPResponse({
                "choices": [{"message": {"content": '{"translation":"Маркер удалён"}'}}]
            })
            with mock.patch.object(local_service.urllib.request, "urlopen", return_value=response):
                with self.assertRaises(local_service.BridgeError) as caught:
                    bridge.openai_translate(
                        "ru", "Russian", "One VRCTXSEP1X two", "model", "openrouter", "ignored"
                    )
            self.assertEqual(caught.exception.code, "openai_format_invalid")

    def test_translation_falls_back_from_json_schema_to_json_object(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = self.bridge(directory, "secret-key-that-is-long-enough")
            request_bodies = []

            def fake_open(request, timeout):
                request_bodies.append(json.loads(request.data.decode("utf-8")))
                if len(request_bodies) == 1:
                    raise urllib.error.HTTPError(
                        request.full_url, 400, "unsupported", {},
                        io.BytesIO(b'{"error":{"message":"json_schema response_format is unsupported"}}'),
                    )
                return FakeHTTPResponse({
                    "choices": [{"message": {"content": '{"translation":"Привет"}'}}]
                })

            with mock.patch.object(local_service.urllib.request, "urlopen", side_effect=fake_open):
                result = bridge.openai_translate(
                    "ru", "Russian", "Hello", "model", "openrouter", "ignored"
                )
            self.assertEqual(request_bodies[0]["response_format"]["type"], "json_schema")
            self.assertEqual(request_bodies[1]["response_format"], {"type": "json_object"})
            self.assertEqual(result["translatedText"], "Привет")

    def test_translation_uses_plain_fallback_only_after_explicit_format_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = self.bridge(directory, "secret-key-that-is-long-enough")
            request_bodies = []

            def fake_open(request, timeout):
                request_bodies.append(json.loads(request.data.decode("utf-8")))
                if len(request_bodies) < 3:
                    raise urllib.error.HTTPError(
                        request.full_url, 400, "unsupported", {},
                        io.BytesIO(b'{"error":{"message":"response_format structured output is unsupported"}}'),
                    )
                return FakeHTTPResponse({"choices": [{"message": {"content": "Привет"}}]})

            with mock.patch.object(local_service.urllib.request, "urlopen", side_effect=fake_open):
                result = bridge.openai_translate(
                    "ru", "Russian", "Hello", "model", "openrouter", "ignored"
                )
            self.assertIn("response_format", request_bodies[0])
            self.assertIn("response_format", request_bodies[1])
            self.assertNotIn("response_format", request_bodies[2])
            self.assertEqual(result["translatedText"], "Привет")

    def test_key_and_model_errors_are_reported_without_leaking_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = self.bridge(directory, "secret-key-that-is-long-enough")
            error = urllib.error.HTTPError(
                "https://openrouter.ai/api/v1/chat/completions", 401, "denied", {},
                io.BytesIO(b'{"error":{"message":"secret-key-that-is-long-enough was denied"}}'),
            )
            with mock.patch.object(local_service.urllib.request, "urlopen", side_effect=error):
                with self.assertRaises(local_service.BridgeError) as caught:
                    bridge.openai_translate("ru", "Russian", "Hello", "model", "openrouter", "ignored")
            self.assertEqual(caught.exception.code, "openai_key_invalid")
            self.assertNotIn("secret-key", str(caught.exception))

    def test_game_executable_change_creates_next_launch_marker(self):
        with tempfile.TemporaryDirectory() as directory:
            result = self.bridge(directory).request_game_executable_change()
            self.assertTrue(result["reselectOnNextLaunch"])
            self.assertEqual(
                (Path(directory) / ".reselect-game-executable").read_text(encoding="utf-8"),
                "requested\n",
            )

    def test_request_logging_is_safe_without_console(self):
        handler = object.__new__(local_service.LocalServiceRequestHandler)
        with mock.patch.object(local_service.sys, "stderr", None):
            handler.log_message("%s", "request")


if __name__ == "__main__":
    unittest.main()
