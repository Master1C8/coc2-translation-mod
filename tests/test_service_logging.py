import io
import json
import tempfile
import threading
import unittest
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from tests.test_local_service import FakeCredentialStore, FakeHTTPResponse, local_service


class ServiceLoggingTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.bridge = local_service.LocalServiceBridge(
            Path(directory.name), credential_id="test",
            credential_store=FakeCredentialStore("PRIVATE-API-KEY"),
        )

    def translate(self, text="PRIVATE-SOURCE", **kwargs):
        return self.bridge.openai_translate(
            "ru", "Russian", text, "PRIVATE-MODEL", "custom",
            "https://private-endpoint.example/private-path", "PRIVATE-PROMPT", **kwargs,
        )

    def response(self, **extra):
        return FakeHTTPResponse({"choices": [{
            "message": {"content": '{"translation":"PRIVATE-TRANSLATION"}'},
            "finish_reason": "stop",
        }], **extra})

    def events(self):
        raw = self.bridge.log_path.read_text(encoding="utf-8")
        self.assertNotIn("PRIVATE", raw)
        self.assertNotIn("private-endpoint", raw)
        self.assertNotIn("private-path", raw)
        return [json.loads(line) for line in raw.splitlines()]

    def error(self, message, status=400, headers=None):
        return urllib.error.HTTPError(
            "https://private-endpoint.example/private-path", status, "PRIVATE-ERROR",
            headers or {}, io.BytesIO(json.dumps({"error": {"message": message}}).encode()),
        )

    def test_success_correlates_usage_without_recording_private_content(self):
        usage = {"prompt_tokens": 120, "completion_tokens": 40, "total_tokens": 160,
                 "prompt_tokens_details": {"cached_tokens": 100},
                 "completion_tokens_details": {"reasoning_tokens": 10},
                 "cost": 0.000321, "other": "PRIVATE-USAGE"}
        with mock.patch.object(local_service, "open_url", return_value=self.response(usage=usage)):
            result = self.translate()
        self.assertEqual(result["translatedText"], "PRIVATE-TRANSLATION")
        events = self.events()
        self.assertEqual(len({event["request_id"] for event in events}), 1)
        self.assertIsNone(local_service._TRACE_ID.get())
        measured = next(event for event in events if event["event"] == "provider.usage")
        self.assertTrue(measured["usage_available"])
        self.assertEqual([measured[key] for key in (
            "input_tokens", "output_tokens", "total_tokens", "cached_input_tokens", "reasoning_tokens",
        )], [120, 40, 160, 100, 10])
        self.assertTrue(measured["cost_available"])
        self.assertEqual(measured["cost_usd"], 0.000321)
        self.assertEqual(result["usage"]["cost_usd"], 0.000321)
        self.assertTrue(events[-1]["ok"])

    def test_repeats_and_changed_configuration_can_be_distinguished(self):
        with mock.patch.object(local_service, "open_url", return_value=self.response()):
            self.translate()
            self.translate()
            self.translate(model_parameters={"verbosity": "low"})
            self.translate(text="PRIVATE-OTHER-SOURCE")
        starts = [event for event in self.events() if event["event"] == "translation.start"]
        self.assertEqual(len({event["request_id"] for event in starts}), 4)
        self.assertEqual(starts[0]["source_id"], starts[2]["source_id"])
        self.assertNotEqual(starts[0]["source_id"], starts[3]["source_id"])
        self.assertEqual(starts[0]["config_id"], starts[1]["config_id"])
        self.assertNotEqual(starts[0]["config_id"], starts[2]["config_id"])

    def test_fallbacks_preserve_attempts_statuses_and_safe_reasons(self):
        responses = [self.error("verbosity is unsupported PRIVATE-DETAIL"),
                     self.error("json_schema response_format is unsupported PRIVATE-DETAIL"), self.response()]
        with mock.patch.object(local_service, "open_url", side_effect=responses):
            self.translate(model_parameters={"verbosity": "low"})
        events = self.events()
        attempts = [event for event in events if event["event"] == "provider.attempt"]
        self.assertEqual([event["attempt"] for event in attempts], [1, 2, 3])
        self.assertEqual([event["response_format"] for event in attempts], ["json_schema", "json_schema", "json_object"])
        self.assertEqual([event["provider_status"] for event in events if event["event"] == "provider.http"], [400, 400, 200])
        self.assertEqual([event["reason"] for event in events if event["event"] == "provider.fallback"],
                         ["unsupported_parameter", "unsupported_response_format"])
        self.assertEqual(len([event for event in events if event["event"] == "provider.usage"]), 1)

    def test_provider_400_is_not_lost_behind_helper_502(self):
        with mock.patch.object(local_service, "open_url",
                               side_effect=self.error("MissingSessionID: x-opencode-session PRIVATE-DETAIL")):
            with self.assertRaises(local_service.BridgeError) as caught:
                self.translate()
        self.assertEqual(caught.exception.status, 502)
        events = self.events()
        rejection = next(event for event in events if event["event"] == "provider.rejected")
        self.assertEqual(rejection["reason"], "missing_session_id")
        self.assertEqual(events[-1]["provider_status"], 400)
        self.assertEqual(events[-1]["helper_status"], 502)
        self.assertFalse(events[-1]["ok"])

    def test_rate_limit_records_retry_delay_and_no_invented_usage(self):
        with mock.patch.object(local_service, "open_url",
                               side_effect=self.error("PRIVATE-DETAIL", 429, {"Retry-After": "2.5"})):
            with self.assertRaises(local_service.BridgeError):
                self.translate()
        events = self.events()
        self.assertEqual(events[-1]["retry_after_ms"], 2500)
        self.assertFalse(any(event["event"] == "provider.usage" for event in events))

    def test_paid_but_invalid_translation_keeps_usage(self):
        with mock.patch.object(local_service, "open_url",
                               return_value=self.response(usage={"total_tokens": 75, "cost": 0.00015})):
            with self.assertRaises(local_service.BridgeError) as caught:
                self.translate(text="PRIVATE-SOURCE VRCTXSEP1X PRIVATE-SOURCE")
        events = self.events()
        self.assertEqual(events[-1]["error"], "openai_format_invalid")
        self.assertEqual(next(event for event in events if event["event"] == "provider.usage")["total_tokens"], 75)
        self.assertEqual(caught.exception.usage["cost_usd"], 0.00015)

    def test_absent_and_malformed_usage_are_not_zero(self):
        for usage in (None, {}, "PRIVATE", {"prompt_tokens": True, "completion_tokens": -1,
                                          "total_tokens": "123", "input_tokens_details": {"cached_tokens": 10**20}}):
            with self.subTest(usage=usage):
                self.assertEqual(local_service.token_usage({"usage": usage}),
                                 {"usage_available": False, "cost_available": False})
        self.assertEqual(local_service.token_usage({"usage": {"input_tokens": 0, "output_tokens": 4}}),
                         {"usage_available": True, "cost_available": False,
                          "input_tokens": 0, "output_tokens": 4})
        self.assertEqual(local_service.token_usage({"usage": {"cost": 0}}),
                         {"usage_available": False, "cost_available": True, "cost_usd": 0.0})
        self.assertEqual(local_service.token_usage({"usage": {}, "cost": "0.00004"}),
                         {"usage_available": False, "cost_available": True, "cost_usd": 0.00004})

    def test_concurrent_requests_keep_separate_trace_ids_and_complete_lines(self):
        barrier = threading.Barrier(4)

        def fake_open(request, timeout):
            barrier.wait(timeout=5)
            return self.response()

        with mock.patch.object(local_service, "open_url", side_effect=fake_open):
            with ThreadPoolExecutor(max_workers=4) as pool:
                list(pool.map(lambda index: self.translate(text=f"PRIVATE-SOURCE-{index}"), range(4)))
        groups = {}
        for event in self.events():
            groups.setdefault(event["request_id"], []).append(event)
        self.assertEqual(len(groups), 4)
        for group in groups.values():
            self.assertEqual([event["event"] for event in group], [
                "translation.start", "provider.attempt", "provider.http", "provider.usage", "translation.result",
            ])

    def test_disconnect_is_logged_without_a_traceback_or_response_body(self):
        handler = object.__new__(local_service.LocalServiceRequestHandler)
        handler.server = SimpleNamespace(bridge=self.bridge)
        handler.path = "/v1/openai-compatible/translate"
        handler.request_id = "test-request"
        handler._headers = mock.Mock()
        handler.wfile = mock.Mock()
        handler.wfile.write.side_effect = ConnectionAbortedError("PRIVATE-ERROR")
        handler._write_json({"ok": True, "translatedText": "PRIVATE-TRANSLATION"})
        events = self.events()
        self.assertEqual([event["event"] for event in events], ["http.response", "client.disconnected"])
        self.assertTrue(all(event["request_id"] == "test-request" for event in events))
        handler.wfile.write.side_effect = None
        handler.path = "/v1/log/status"
        handler._write_json({"ok": True})
        self.assertEqual(self.events(), events)

    def test_logging_io_failure_does_not_break_translation(self):
        with mock.patch.object(Path, "open", side_effect=OSError("PRIVATE-ERROR")), \
                mock.patch.object(local_service, "open_url", return_value=self.response()):
            self.assertTrue(self.translate()["ok"])

    def test_screen_metrics_correlate_requests_and_reject_arbitrary_content(self):
        screen_id = "a" * 32
        diagnostics = {"screen_id": screen_id, "batch_size": 12, "kind": "control"}
        with mock.patch.object(local_service, "open_url", return_value=self.response()):
            self.translate(diagnostics=diagnostics)
        event = next(event for event in self.events() if event["event"] == "translation.start")
        self.assertEqual({key: event[key] for key in diagnostics}, diagnostics)
        for bad in ({**diagnostics, "text": "PRIVATE"}, {**diagnostics, "screen_id": "PRIVATE"},
                    {**diagnostics, "batch_size": True}, {**diagnostics, "batch_size": 13},
                    {**diagnostics, "kind": "PRIVATE"}, "PRIVATE"):
            with self.subTest(bad=bad), self.assertRaises(local_service.BridgeError):
                self.translate(diagnostics=bad)
        self.events()

    def test_screen_metrics_endpoint_validates_before_logging(self):
        payload = {
            "phase": "result", "screen_id": "b" * 32, "mode": "auto", "jobs": 12,
            "requests_planned": 1, "helper_requests": 1, "batch_requests": 1,
            "batch_fallbacks": 0, "cache_hits": 0, "max_queue_wait_ms": 2,
            "usage_requests": 1, "costed_requests": 1, "input_tokens": 120,
            "output_tokens": 40, "total_tokens": 160, "cached_input_tokens": 100,
            "reasoning_tokens": 10, "reported_cost_usd": 0.000321,
            "first_apply_ms": 123, "first_story_ms": None,
            "outcome": "complete", "duration_ms": 150, "failed_jobs": 0,
        }
        handler = object.__new__(local_service.LocalServiceRequestHandler)
        handler.server = SimpleNamespace(bridge=self.bridge)
        handler.path = "/v1/translation-metrics"
        handler._require_auth = mock.Mock()
        handler._read_json = mock.Mock(return_value=payload)
        handler._write_json = mock.Mock()
        handler.do_POST()
        handler._require_auth.assert_called_once()
        handler._write_json.assert_called_once_with({"ok": True})
        event = self.events()[-1]
        self.assertEqual(event["event"], "screen.result")
        self.assertEqual(event["first_apply_ms"], 123)
        self.assertIsNone(event["first_story_ms"])
        self.assertEqual(event["reported_cost_usd"], 0.000321)
        for key, value in (("text", "PRIVATE"), ("duration_ms", "PRIVATE"), ("cache_hits", True),
                           ("first_apply_ms", -1), ("reported_cost_usd", float("nan")),
                           ("outcome", "PRIVATE"), ("phase", "PRIVATE")):
            handler._read_json.return_value = {**payload, key: value}
            handler._write_json.reset_mock()
            handler.do_POST()
            self.assertEqual(handler._write_json.call_args.args[1], 400)
            self.assertEqual(self.events()[-1], event)
        denied = local_service.BridgeError("unauthorized", "Invalid local helper token", 401)
        handler._require_auth.side_effect = denied
        handler._read_json.reset_mock()
        handler.do_POST()
        handler._read_json.assert_not_called()
        self.assertEqual(handler._write_json.call_args.args[1], 401)

    def test_request_capture_is_explicit_separate_and_replaceable(self):
        request_set = {
            "screen_id": "c" * 32,
            "game_id": "coc2",
            "game_version": "0.9.3",
            "translator_version": "test",
            "language": "ru",
            "preset": "opencode-go",
            "model": "glm-5.3-flash",
            "reasoning_effort": "low",
            "mode": "auto",
            "requests": [{
                "kind": "story",
                "batch_size": 2,
                "system_prompt": "PRIVATE-PROMPT\nPRIVATE-GLOSSARY",
                "glossary": "PRIVATE-GLOSSARY",
                "text": "PRIVATE-SOURCE",
            }],
        }
        with self.assertRaises(local_service.BridgeError):
            self.bridge.append_capture(request_set)
        with self.assertRaises(local_service.BridgeError):
            self.bridge.start_capture(False)

        started = self.bridge.start_capture(True)
        self.assertTrue(started["active"])
        appended = self.bridge.append_capture(request_set)
        self.assertEqual(appended["sets"], 1)
        self.assertFalse(appended["duplicate"])
        duplicate = self.bridge.append_capture({**request_set, "screen_id": "d" * 32, "mode": "manual"})
        self.assertEqual(duplicate["sets"], 1)
        self.assertTrue(duplicate["duplicate"])
        with self.assertRaises(local_service.BridgeError):
            self.bridge.clear_capture(False)
        cleared = self.bridge.clear_capture(True)
        self.assertTrue(cleared["active"])
        self.assertEqual(cleared["sets"], 0)
        self.assertEqual(json.loads(self.bridge.read_capture()["content"])["request_sets"], [])
        self.assertEqual(self.bridge.append_capture(request_set)["sets"], 1)
        stopped = self.bridge.stop_capture()
        self.assertFalse(stopped["active"])
        capture = self.bridge.read_capture()
        self.assertEqual(capture["sets"], 1)
        self.assertIn("PRIVATE-PROMPT", capture["content"])
        self.assertIn("PRIVATE-GLOSSARY", capture["content"])
        self.assertIn("PRIVATE-SOURCE", capture["content"])
        self.assertFalse(self.bridge.log_path.exists())

        cleared = self.bridge.clear_capture(True)
        self.assertFalse(cleared["active"])
        self.assertEqual(cleared["sets"], 0)
        self.assertEqual(self.bridge.read_capture()["content"], "")

        self.bridge.start_capture(True)
        replaced = json.loads(self.bridge.read_capture()["content"])
        self.assertEqual(replaced["request_sets"], [])

        for invalid in ({**request_set, "secret": "PRIVATE"}, {**request_set, "screen_id": "PRIVATE"},
                        {**request_set, "requests": [{**request_set["requests"][0], "batch_size": True}]}):
            with self.subTest(invalid=invalid), self.assertRaises(local_service.BridgeError):
                local_service.capture_request_set(invalid)
