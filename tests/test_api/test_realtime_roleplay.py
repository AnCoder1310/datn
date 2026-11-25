"""Contract tests for provider events, ownership, training persistence and grading."""

import asyncio
import json

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI

from src.agents.roleplay.customer_agent import CustomerAgent
from src.agents.roleplay.graph import RoleplayGraph
from src.agents.roleplay.scenario_loader import ScenarioRepository
from src.agents.roleplay.turn_analyzer import TurnAnalyzer
from src.api.practice_errors import PracticeAPIError, practice_exception_handler
from src.api.recorded_practice import create_recorded_practice_routers
from src.config import get_settings
from src.integrations.practice_persistence import SQLCheckpointRepository
from src.integrations.practice_records import SQLPracticeRecordsRepository
from src.services import realtime_roleplay
from src.services.practice import PracticeService
from src.services.realtime_roleplay import RealtimeRoleplayService, session_config
from src.services.recorded_practice import RecordedPracticeService
from tests.test_api.test_recorded_practice import ADVISOR_A, ADVISOR_B, MANAGER, SCENARIO, fake_identity
from tests.test_roleplay.test_practice_service import EvidenceProvider, RecordingEvaluator

_OFFER = "v=0\r\ns=practice-test\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111"


class TestSideband:
    __test__ = False

    def __init__(self):
        self.sent = []
        self.incoming = asyncio.Queue()
        self.closed = False

    async def send(self, data):
        self.sent.append(json.loads(data))

    async def close(self):
        self.closed = True

    def __aiter__(self):
        return self

    async def __anext__(self):
        return json.dumps(await self.incoming.get())


class ClaimAnalyzer:
    async def analyze(self, text, scenario, state):
        return {"factual_claims": [{"category": "battery_charging", "text": text}]} if "pin" in text else {}


class CapturingEvaluator(RecordingEvaluator):
    async def evaluate(self, scenario, state, knowledge_evidence):
        self.state = state
        return await super().evaluate(scenario, state, knowledge_evidence)


@pytest_asyncio.fixture
async def room(tmp_path, monkeypatch):
    settings = get_settings().model_copy(update={"openai_api_key": "fake-test-key"})
    checkpoint = SQLCheckpointRepository(f"sqlite:///{tmp_path / 'practice.db'}")
    records = SQLPracticeRecordsRepository(f"sqlite:///{tmp_path / 'practice.db'}")
    scenarios = ScenarioRepository()
    evaluator = CapturingEvaluator()
    graph = RoleplayGraph(scenarios, TurnAnalyzer(ClaimAnalyzer()), CustomerAgent(None), checkpoint)
    practice = RecordedPracticeService(
        PracticeService(graph, scenarios, evaluator=evaluator, knowledge_evidence=EvidenceProvider()), records
    )
    voice = RealtimeRoleplayService(practice, settings)
    providers = []
    offers = []

    async def create(call, offer, scenario, previous):
        config = session_config(settings, settings.realtime_model, scenario, previous)
        offers.append((offer, config))
        return "rtc_test", "sdp-answer", settings.realtime_model

    async def connect(url, **options):
        assert url.endswith("call_id=rtc_test")
        assert options["additional_headers"]["Authorization"] == "Bearer fake-test-key"
        socket = TestSideband()
        providers.append(socket)
        return socket

    async def close_transport(call):
        if call.websocket:
            await call.websocket.close()

    monkeypatch.setattr(voice, "_create", create)
    monkeypatch.setattr(realtime_roleplay, "connect", connect)
    monkeypatch.setattr(voice, "_close_transport", close_transport)

    router, _ = create_recorded_practice_routers(practice, fake_identity, realtime=voice)
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.add_exception_handler(PracticeAPIError, practice_exception_handler)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/practice/sessions", headers=ADVISOR_A, json={"scenario_id": SCENARIO})
        assert response.status_code == 201, response.text
        url = f"/api/v1/practice/{response.json()['session_id']}"
        yield client, url, voice, checkpoint, evaluator, providers, offers
    await voice.shutdown()


async def emit(voice, call, *events):
    for kind, fields in events:
        async with call.lock:
            await voice.process(call, {"type": kind, **fields})


@pytest.mark.asyncio
async def test_realtime_availability_explains_missing_openai_key_before_creating_call(room):
    client, url, voice, _, _, _, offers = room
    endpoint = url + "/realtime"
    assert (await client.get(endpoint)).status_code == 401
    assert (await client.get(endpoint, headers=ADVISOR_B)).status_code == 404
    ready = await client.get(endpoint, headers=ADVISOR_A)
    assert ready.json() == {"available": True, "message": None}
    assert ready.headers["Cache-Control"] == "no-store"
    voice.settings = voice.settings.model_copy(update={"openai_api_key": " "})
    unavailable = await client.get(endpoint, headers=ADVISOR_A)
    assert unavailable.status_code == 200
    assert unavailable.json()["available"] is False
    assert "OPENAI_API_KEY" in unavailable.json()["message"]
    rejected = await client.post(endpoint, headers=ADVISOR_A, json={"sdp": _OFFER})
    assert rejected.status_code == 503
    assert rejected.json()["code"] == "voice_not_configured"
    assert not offers and not voice.calls


@pytest.mark.asyncio
async def test_webrtc_ownership_persona_and_reconnect(room):
    client, url, voice, _, _, providers, offers = room
    payload = {"sdp": _OFFER}
    assert (await client.post(url + "/realtime", json=payload)).status_code == 401
    assert (await client.post(url + "/realtime", headers=MANAGER, json=payload)).status_code == 403
    assert (await client.post(url + "/realtime", headers=ADVISOR_B, json=payload)).status_code == 404
    assert (
        await client.post(url + "/realtime", headers=ADVISOR_A, json={**payload, "persona": "override"})
    ).status_code == 422
    assert (
        await client.post(
            url + "/realtime",
            headers=ADVISOR_A,
            json={"sdp": _OFFER + "\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel"},
        )
    ).status_code == 422
    assert not offers

    started = await client.post(url + "/realtime", headers=ADVISOR_A, json=payload)
    assert started.status_code == 200, started.text
    opened = started.json()
    assert set(opened) == {"sdp", "call_id", "model"}
    assert started.headers["Cache-Control"] == "no-store"
    config = offers[0][1]
    assert config["audio"]["output"]["voice"] == "marin"
    assert config["audio"]["input"]["turn_detection"]["interrupt_response"] is True
    assert config["audio"]["input"]["transcription"]["languages"] == ["vi"]
    assert "khách hàng Việt Nam" in config["instructions"]
    assert "target_skills" not in config["instructions"]
    assert "training_objective" not in config["instructions"]
    assert "ideal_sales_response" not in config["instructions"]

    route = url + "/realtime/" + opened["call_id"]
    assert (await client.get(route + "/events", headers=ADVISOR_B)).status_code == 404
    assert (await client.post(route + "/stop", headers=ADVISOR_B)).status_code == 404
    assert (await client.post(url + "/realtime", headers=ADVISOR_A, json=payload)).status_code == 409
    assert (await client.post(url + "/finish", headers=ADVISOR_A)).json()["code"] == "realtime_transcript_incomplete"

    await voice.stop(next(iter(voice.calls.values())), disconnected=True)
    assert providers[0].closed
    second = await client.post(url + "/realtime", headers=ADVISOR_A, json=payload)
    assert second.status_code == 200
    assert second.json()["call_id"] != opened["call_id"]


@pytest.mark.asyncio
async def test_transcript_orders_items_and_excludes_unplayed_text_before_grading(room):
    client, url, voice, checkpoint, evaluator, providers, _ = room
    opened = (await client.post(url + "/realtime", headers=ADVISOR_A, json={"sdp": _OFFER})).json()
    call = next(iter(voice.calls.values()))
    await emit(
        voice,
        call,
        ("input_audio_buffer.speech_started", {"item_id": "user-1"}),
        (
            "conversation.item.input_audio_transcription.delta",
            {"item_id": "user-1", "delta": "Em chào", "event_id": "p1"},
        ),
        (
            "conversation.item.input_audio_transcription.delta",
            {"item_id": "user-1", "delta": "Em chào", "event_id": "p1"},
        ),
    )
    assert call.snapshot()["messages"][0]["partial"]
    assert call.snapshot()["messages"][0]["content"] == "Em chào"
    await emit(
        voice,
        call,
        ("input_audio_buffer.speech_stopped", {"item_id": "user-1"}),
        ("input_audio_buffer.committed", {"item_id": "user-1"}),
        ("response.created", {"response": {"id": "response-1"}}),
        ("response.output_item.added", {"response_id": "response-1", "item": {"id": "ai-1", "role": "assistant"}}),
        ("response.output_audio_transcript.delta", {"item_id": "ai-1", "delta": "Đoạn AI tạo trước khi phát"}),
        ("output_audio_buffer.started", {"response_id": "response-1"}),
        ("input_audio_buffer.speech_started", {"item_id": "user-2"}),
        ("input_audio_buffer.committed", {"item_id": "user-2"}),
        ("conversation.item.input_audio_transcription.completed", {"item_id": "user-2", "transcript": "Xe có pin."}),
    )
    assert providers[0].sent == [{"type": "response.create"}]
    assert (await checkpoint.load(call.session_id))["messages"] == []

    route = url + "/realtime/" + opened["call_id"]
    assert (await client.post(route + "/interrupt", headers=ADVISOR_A)).status_code == 204
    assert [event["type"] for event in providers[0].sent][-2:] == ["response.cancel", "output_audio_buffer.clear"]
    await emit(
        voice,
        call,
        ("output_audio_buffer.cleared", {"response_id": "response-1"}),
        ("response.output_audio_transcript.done", {"item_id": "ai-1", "transcript": "Đoạn AI không phát hết."}),
        ("response.done", {"response": {"id": "response-1", "status": "cancelled"}}),
        ("conversation.item.input_audio_transcription.completed", {"item_id": "user-1", "transcript": "Em chào anh."}),
        ("response.created", {"response": {"id": "response-2"}}),
        ("response.output_item.added", {"response_id": "response-2", "item": {"id": "ai-2", "role": "assistant"}}),
        ("output_audio_buffer.started", {"response_id": "response-2"}),
        ("response.output_audio_transcript.done", {"item_id": "ai-2", "transcript": "Pin dùng được bao lâu em?"}),
        ("response.done", {"response": {"id": "response-2", "status": "completed"}}),
    )
    assert len((await checkpoint.load(call.session_id))["messages"]) == 3
    await emit(voice, call, ("output_audio_buffer.stopped", {"response_id": "response-2"}))

    stop = await client.post(route + "/stop", headers=ADVISOR_A)
    assert stop.status_code == 200 and not stop.json()["incomplete"]
    saved = (await client.get(url, headers=ADVISOR_A)).json()
    assert [item["role"] for item in saved["messages"]] == ["advisor", "customer", "advisor", "customer"]
    assert saved["messages"][1]["interrupted"]
    assert "không phát hết" not in json.dumps(saved, ensure_ascii=False)
    assert saved["messages"][0]["timestamp"]
    assert saved["messages"][2]["turn_id"] == saved["messages"][3]["turn_id"]
    assert providers[0].closed

    result = await client.post(url + "/finish", headers=ADVISOR_A)
    assert result.status_code == 200, result.text
    assert evaluator.calls == 1
    assert [item.content for item in evaluator.state.messages] == [
        "Em chào anh.",
        "Xe có pin.",
        "Pin dùng được bao lâu em?",
    ]
    assert evaluator.state.factual_claims[0].text == "Xe có pin."


@pytest.mark.asyncio
async def test_transcription_failure_remains_saved_and_blocks_scoring(room):
    client, url, voice, _, evaluator, _, _ = room
    opened = (await client.post(url + "/realtime", headers=ADVISOR_A, json={"sdp": _OFFER})).json()
    call = next(iter(voice.calls.values()))
    await emit(
        voice,
        call,
        ("input_audio_buffer.committed", {"item_id": "speech"}),
        ("conversation.item.input_audio_transcription.failed", {"item_id": "speech"}),
    )
    stop = await client.post(url + "/realtime/" + opened["call_id"] + "/stop", headers=ADVISOR_A)
    assert stop.json()["incomplete"]
    assert (await client.post(url + "/finish", headers=ADVISOR_A)).json()["code"] == "realtime_transcript_incomplete"
    assert evaluator.calls == 0


@pytest.mark.asyncio
async def test_models_fallback_only_when_primary_is_unavailable(monkeypatch):
    settings = get_settings().model_copy(update={"openai_api_key": "test-key"})
    scenario = ScenarioRepository().get(SCENARIO)
    created = []

    def provider(request):
        body = request.content.decode()
        created.append(body)
        assert request.url.path == "/v1/realtime/calls"
        assert request.headers["OpenAI-Safety-Identifier"] != "advisor"
        assert 'name="sdp"' in body and 'name="session"' in body
        if len(created) == 1:
            return httpx.Response(404, json={"error": {"code": "model_not_found"}})
        return httpx.Response(201, headers={"Location": "/v1/realtime/calls/rtc_fake"}, text="answer")

    client = httpx.AsyncClient
    monkeypatch.setattr(
        realtime_roleplay.httpx, "AsyncClient", lambda **kw: client(transport=httpx.MockTransport(provider), **kw)
    )
    voice = RealtimeRoleplayService(None, settings)
    call_id, answer, model = await voice._create(realtime_roleplay.Call("session", "advisor"), _OFFER, scenario, [])
    assert (call_id, answer, model) == ("rtc_fake", "answer", settings.realtime_fallback_model)
    assert f'"model": "{settings.realtime_model}"' in created[0]
    assert f'"model": "{settings.realtime_fallback_model}"' in created[1]


@pytest.mark.asyncio
async def test_reconnect_recovers_orphaned_checkpoint_without_grading_lost_audio(room):
    client, url, voice, checkpoint, evaluator, _, _ = room
    session_id = url.rsplit("/", 1)[-1]
    await voice.practice.open_realtime(session_id, "advisor-a", "old-call")
    await voice.practice.record_realtime(session_id, call_id="old-call", pending_audio=True)

    started = await client.post(url + "/realtime", headers=ADVISOR_A, json={"sdp": _OFFER})
    assert started.status_code == 200
    stored = await checkpoint.load(session_id)
    assert stored["realtime_call_id"] == started.json()["call_id"]
    assert stored["realtime_transcript_incomplete"] is True
    call = next(iter(voice.calls.values()))
    assert (await voice.stop(call))["incomplete"] is True
    assert (await client.post(url + "/finish", headers=ADVISOR_A)).status_code == 409
    assert evaluator.calls == 0


@pytest.mark.asyncio
async def test_provider_turn_limit_stops_media_and_persists_the_final_response(room):
    client, _, voice, checkpoint, _, providers, _ = room
    session = await voice.practice.start_session(SCENARIO, "advisor-a", max_turns=1)
    session_id = session.session_id
    started = await client.post(f"/api/v1/practice/{session_id}/realtime", headers=ADVISOR_A, json={"sdp": _OFFER})
    assert started.status_code == 200
    call = next(iter(voice.calls.values()))
    socket = providers[0]
    events = [
        {"type": "input_audio_buffer.committed", "item_id": "advisor"},
        {"type": "response.created", "response": {"id": "response"}},
        {
            "type": "response.output_item.added",
            "response_id": "response",
            "item": {"role": "assistant", "id": "customer"},
        },
        {"type": "output_audio_buffer.started", "response_id": "response"},
        {
            "type": "conversation.item.input_audio_transcription.completed",
            "item_id": "advisor",
            "transcript": "Anh xem xe gì ạ?",
        },
        {
            "type": "response.output_audio_transcript.done",
            "item_id": "customer",
            "transcript": "Anh đang cân nhắc VF 5.",
        },
        {"type": "response.done", "response": {"id": "response", "status": "completed"}},
        {"type": "output_audio_buffer.stopped", "response_id": "response"},
    ]
    for event in events:
        socket.incoming.put_nowait(event)
    async with asyncio.timeout(2):
        await call.closed.wait()
    assert socket.closed
    assert socket.sent == [{"type": "response.create"}]
    saved = await checkpoint.load(session_id)
    assert saved["realtime_call_id"] is None
    assert saved["termination_status"] == "max_turns"
    assert [message["role"] for message in saved["messages"]] == ["advisor", "customer"]
