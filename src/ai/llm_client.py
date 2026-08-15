"""Minimal OpenRouter chat-completions client.

This is the only module in the project that knows OpenRouter's URL, request/
response shape, or model name -- every caller goes through the one function
below (`complete`), so swapping providers later means editing only this file.

Standard-library only: one synchronous, non-streaming JSON POST per call.
No retries, no alternate model, no cached/mocked response on failure -- a
failure is always raised, never swallowed.
"""

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-4o-mini"
REQUEST_TIMEOUT_SECONDS = 30


class LlmConfigurationError(RuntimeError):
    """OPENROUTER_API_KEY is not set in the environment."""


class LlmTimeoutError(RuntimeError):
    """The request to OpenRouter did not complete within the timeout."""


class LlmRequestError(RuntimeError):
    """The request to OpenRouter failed at the network level, or OpenRouter
    returned a non-2xx status."""


class LlmResponseError(RuntimeError):
    """OpenRouter returned a 2xx response whose body was not the expected
    chat-completion shape."""


def complete(system_prompt: str, user_prompt: str) -> str:
    """Send one non-streaming chat-completion request to OpenRouter and
    return the assistant's reply text.

    Raises:
        LlmConfigurationError: OPENROUTER_API_KEY is not set.
        LlmTimeoutError: the request did not complete within the timeout.
        LlmRequestError: the network request failed, or OpenRouter returned
            a non-2xx response.
        LlmResponseError: OpenRouter returned 2xx but the response body
            doesn't contain the expected assistant message.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise LlmConfigurationError("OPENROUTER_API_KEY is not set in the environment.")

    payload = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
    }).encode("utf-8")

    request = Request(
        OPENROUTER_URL,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            raw_body = response.read()
    except TimeoutError as e:
        raise LlmTimeoutError(f"OpenRouter request timed out after {REQUEST_TIMEOUT_SECONDS}s.") from e
    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise LlmRequestError(f"OpenRouter returned HTTP {e.code}: {detail}") from e
    except URLError as e:
        raise LlmRequestError(f"Could not reach OpenRouter: {e.reason}") from e

    try:
        body = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise LlmResponseError(f"OpenRouter response was not valid JSON: {e}") from e

    try:
        return body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise LlmResponseError(f"Unexpected OpenRouter response shape: {body!r}") from e
