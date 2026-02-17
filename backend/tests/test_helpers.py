"""Unit tests for helper functions in app/main.py"""
import sys
import os
import pytest

# Add the backend app to the path so we can import from main
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.main import (
    _is_local_model,
    _sanitize_assistant_output,
    _build_conversation_profile_block,
    _parse_feedback_profile,
    _parse_agent_mode,
    _infer_chat_intelligence,
    _build_behavior_policy,
)


# ──────────────────────────────────────────────
# _is_local_model
# ──────────────────────────────────────────────

class TestIsLocalModel:
    def test_local_ollama_model(self):
        assert _is_local_model("llama3.1:8b") is True

    def test_local_model_without_tag(self):
        assert _is_local_model("tinyllama") is True

    def test_cloud_openai(self):
        assert _is_local_model("openai:gpt-4") is False

    def test_cloud_gemini(self):
        assert _is_local_model("gemini:gemini-pro") is False

    def test_cloud_anthropic(self):
        assert _is_local_model("anthropic:claude-3") is False

    def test_cloud_mistral(self):
        assert _is_local_model("mistral:mistral-large") is False

    def test_cloud_groq(self):
        assert _is_local_model("groq:mixtral-8x7b") is False

    def test_cloud_deepseek(self):
        assert _is_local_model("deepseek:deepseek-chat") is False

    def test_empty_string_defaults_to_local(self):
        assert _is_local_model("") is True


# ──────────────────────────────────────────────
# _sanitize_assistant_output
# ──────────────────────────────────────────────

class TestSanitizeAssistantOutput:
    def test_strips_assistant_tag(self):
        assert _sanitize_assistant_output("<|assistant|>Hello world") == "Hello world"

    def test_strips_end_tag(self):
        assert _sanitize_assistant_output("Hello<|end|>") == "Hello"

    def test_strips_im_end_tag(self):
        assert _sanitize_assistant_output("Response<|im_end|>") == "Response"

    def test_strips_im_start_assistant(self):
        assert _sanitize_assistant_output("<|im_start|>assistant\nHello") == "Hello"

    def test_preserves_normal_text(self):
        text = "This is a perfectly normal response with no tags."
        assert _sanitize_assistant_output(text) == text

    def test_handles_empty_string(self):
        assert _sanitize_assistant_output("") == ""

    def test_handles_none_like_empty(self):
        assert _sanitize_assistant_output("") == ""

    def test_strips_multiple_tags(self):
        text = "<|assistant|>Hello<|end|> world<|im_end|>"
        result = _sanitize_assistant_output(text)
        assert "<|" not in result
        assert "Hello" in result
        assert "world" in result


# ──────────────────────────────────────────────
# _build_conversation_profile_block
# ──────────────────────────────────────────────

class TestBuildConversationProfileBlock:
    def test_full_profile(self):
        profile = {
            "name": "Alice",
            "role": "Developer",
            "context": "Working on loom",
            "preferences": "concise answers",
        }
        result = _build_conversation_profile_block(profile)
        assert "Alice" in result
        assert "Developer" in result
        assert "Working on loom" in result
        assert "concise answers" in result
        assert result.startswith("Conversation Profile")

    def test_returns_empty_for_none(self):
        assert _build_conversation_profile_block(None) == ""

    def test_returns_empty_for_empty_dict(self):
        assert _build_conversation_profile_block({}) == ""

    def test_partial_profile(self):
        result = _build_conversation_profile_block({"name": "Bob"})
        assert "Bob" in result
        assert "role" not in result.lower().split("bob")[0]  # no role line


# ──────────────────────────────────────────────
# _parse_feedback_profile
# ──────────────────────────────────────────────

class TestParseFeedbackProfile:
    def test_valid_profile(self):
        result = _parse_feedback_profile({
            "verbosity": "concise",
            "tone": "friendly",
            "detail_level": "high",
        })
        assert result["verbosity"] == "concise"
        assert result["tone"] == "friendly"
        assert result["detail_level"] == "high"

    def test_defaults_on_missing_keys(self):
        # Empty dict passes `not raw` check as {} is falsy, so returns {}
        result = _parse_feedback_profile({})
        assert result == {}

    def test_returns_empty_for_none(self):
        assert _parse_feedback_profile(None) == {}

    def test_returns_empty_for_non_dict(self):
        assert _parse_feedback_profile("not a dict") == {}


# ──────────────────────────────────────────────
# _parse_agent_mode
# ──────────────────────────────────────────────

class TestParseAgentMode:
    def test_valid_modes(self):
        assert _parse_agent_mode("auto") == "auto"
        assert _parse_agent_mode("none") == "none"
        assert _parse_agent_mode("always") == "always"

    def test_case_insensitive(self):
        assert _parse_agent_mode("AUTO") == "auto"
        assert _parse_agent_mode("Always") == "always"

    def test_none_input(self):
        assert _parse_agent_mode(None) == "none"

    def test_empty_string(self):
        assert _parse_agent_mode("") == "none"

    def test_invalid_mode_defaults_to_none(self):
        assert _parse_agent_mode("turbo") == "none"


# ──────────────────────────────────────────────
# _infer_chat_intelligence
# ──────────────────────────────────────────────

class TestInferChatIntelligence:
    def test_detects_code_task(self):
        result = _infer_chat_intelligence("Can you fix this function?")
        assert result["task"] == "code"

    def test_detects_explanation_task(self):
        result = _infer_chat_intelligence("What is a neural network?")
        assert result["task"] == "explanation"

    def test_detects_creative_task(self):
        result = _infer_chat_intelligence("Write me a poem about the moon")
        assert result["task"] == "creative"

    def test_defaults_to_general(self):
        result = _infer_chat_intelligence("Hello")
        assert result["task"] == "general"

    def test_returns_expected_keys(self):
        result = _infer_chat_intelligence("Test prompt")
        expected_keys = {"task", "response_contract", "confidence",
                         "uncertainty", "complexity", "ask_clarifying_question",
                         "latest_user_message"}
        assert set(result.keys()) == expected_keys

    def test_truncates_long_message(self):
        long_prompt = "x" * 1000
        result = _infer_chat_intelligence(long_prompt)
        assert len(result["latest_user_message"]) == 500


# ──────────────────────────────────────────────
# _build_behavior_policy
# ──────────────────────────────────────────────

class TestBuildBehaviorPolicy:
    def test_basic_policy(self):
        intel = {"task": "code"}
        feedback = {}
        result = _build_behavior_policy(intel, feedback)
        assert "Behavior Policy:" in result
        assert "Task type: code" in result

    def test_concise_verbosity(self):
        result = _build_behavior_policy(
            {"task": "general"},
            {"verbosity": "concise"},
        )
        assert "concise" in result.lower()

    def test_verbose_verbosity(self):
        result = _build_behavior_policy(
            {"task": "general"},
            {"verbosity": "verbose"},
        )
        assert "thorough" in result.lower() or "detailed" in result.lower()

    def test_friendly_tone(self):
        result = _build_behavior_policy(
            {"task": "general"},
            {"tone": "friendly"},
        )
        assert "friendly" in result.lower()

    def test_professional_tone(self):
        result = _build_behavior_policy(
            {"task": "general"},
            {"tone": "professional"},
        )
        assert "professional" in result.lower()
