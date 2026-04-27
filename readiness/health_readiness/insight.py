"""AI insight generation.

Deterministic scoring stays the source of truth; this module produces a
narrative layer around it and caches the result in `ai_insights`.

The backend is pluggable via a small Protocol. Stage 0 uses the `codex exec`
CLI against the user's personal Codex subscription; later we can swap in the
OpenAI / Anthropic API or a local `ollama` model without touching callers.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .repos import AiInsightsRepo

PROMPT_ROOT = Path(__file__).resolve().parents[1] / "prompts"
DEFAULT_PROMPT = "daily_insight_v2"


@dataclass(frozen=True)
class InsightResult:
    model: str
    prompt_version: str
    payload: dict[str, Any]
    tokens_in: int | None = None
    tokens_out: int | None = None


class InsightBackend(Protocol):
    model_name: str

    def run(self, system_prompt: str, user_context: dict[str, Any]) -> dict[str, Any]: ...


class CodexInsightBackend:
    """Runs the prompt through the `codex exec` CLI.

    We use `--output-last-message` so only the final assistant message hits a
    file (the stdout from `--json` is a JSONL event stream that's harder to
    parse). The prompt is assembled as a single string: system rules + a
    `<context>` JSON blob, so both pieces survive CLI sandboxing.
    """

    model_name = "codex"

    def __init__(
        self,
        extra_args: list[str] | None = None,
        timeout_s: int = 180,
        model: str | None = None,
    ) -> None:
        self._extra_args = list(extra_args or [])
        self._timeout_s = timeout_s
        self._model = model

    def _build_prompt(self, system_prompt: str, user_context: dict[str, Any]) -> str:
        ctx = json.dumps(user_context, ensure_ascii=False, sort_keys=True)
        return (
            f"{system_prompt.strip()}\n\n"
            "## Context\n\n"
            "```json\n"
            f"{ctx}\n"
            "```\n"
        )

    def run(self, system_prompt: str, user_context: dict[str, Any]) -> dict[str, Any]:
        prompt = self._build_prompt(system_prompt, user_context)
        with tempfile.NamedTemporaryFile("w+", suffix=".txt", delete=False) as tmp:
            out_path = Path(tmp.name)

        try:
            cmd = ["codex", "exec", "--skip-git-repo-check", "--sandbox", "read-only",
                   "--output-last-message", str(out_path)]
            if self._model:
                cmd.extend(["--model", self._model])
            cmd.extend(self._extra_args)
            cmd.append(prompt)

            # `codex exec` treats a non-TTY stdin as "read additional prompt
            # from stdin" and hangs forever. Explicitly close it.
            proc = subprocess.run(
                cmd,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                timeout=self._timeout_s,
                check=False,
            )
            if proc.returncode != 0:
                raise RuntimeError(
                    f"codex exec failed (exit {proc.returncode}): "
                    f"{proc.stderr.strip()[:500] or proc.stdout.strip()[:500]}"
                )

            raw = out_path.read_text(encoding="utf-8").strip()
        finally:
            try:
                out_path.unlink(missing_ok=True)
            except OSError:
                pass

        if not raw:
            raise RuntimeError("codex exec produced no final message")

        return _extract_json_object(raw)


def _extract_json_object(text: str) -> dict[str, Any]:
    """Pull the first JSON object out of the model response.

    Models occasionally wrap responses in ```json fences or add a preface even
    when told not to; be forgiving here rather than asking them to retry.
    """
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        candidate = text[start : end + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as err:
            raise RuntimeError(
                f"codex output didn't contain valid JSON: {err}: {text[:500]}"
            )
    raise RuntimeError(f"codex output didn't contain JSON: {text[:500]}")


def load_prompt(name: str = DEFAULT_PROMPT) -> str:
    path = PROMPT_ROOT / f"{name}.md"
    return path.read_text(encoding="utf-8")


def generate_daily_insight(
    *,
    backend: InsightBackend,
    date: str,
    today_summary: dict[str, Any],
    trend: list[dict[str, Any]],
    planned_session: dict[str, Any] | None,
    last_checkin: dict[str, Any] | None,
    repo: AiInsightsRepo,
    prompt_version: str = "daily_insight_v1",
    completed_today: list[dict[str, Any]] | None = None,
    daily_decision: dict[str, Any] | None = None,
) -> InsightResult:
    system_prompt = load_prompt(prompt_version)
    context = {
        "date": date,
        "today_summary": today_summary,
        "trend": trend,
        "planned_session": planned_session,
        "last_checkin": last_checkin,
        "completed_today": completed_today or [],
        "daily_decision": daily_decision,
    }

    payload = backend.run(system_prompt, context)

    repo.upsert(
        date=date,
        prompt_version=prompt_version,
        model=backend.model_name,
        payload=payload,
    )

    return InsightResult(
        model=backend.model_name,
        prompt_version=prompt_version,
        payload=payload,
        tokens_in=payload.get("tokens_in"),
        tokens_out=payload.get("tokens_out"),
    )
