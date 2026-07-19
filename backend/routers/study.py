import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from dependencies.auth import AuthContext, require_user
from services.ai_service import _create_groq_completion, DEFAULT_TEXT_MODEL

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/study", tags=["study"])

MAX_SOURCE_TEXT_CHARS = 12000  # keeps prompt size sane; trims very long documents


class FlashcardsBody(BaseModel):
    text: str
    count: int = Field(default=8, ge=1, le=20)


class QuizBody(BaseModel):
    text: str
    count: int = Field(default=5, ge=1, le=15)


class SummarizeBody(BaseModel):
    text: str


def _trim_source_text(text: str) -> str:
    text = (text or "").strip()

    if len(text) > MAX_SOURCE_TEXT_CHARS:
        return text[:MAX_SOURCE_TEXT_CHARS] + "\n\n[...content truncated...]"

    return text


def _parse_json_response(raw: str) -> dict | list:
    raw = (raw or "").strip()

    # Models occasionally wrap JSON in markdown fences despite instructions — strip if present.
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    return json.loads(raw)


@router.post("/flashcards")
async def generate_flashcards(
    body: FlashcardsBody,
    ctx: AuthContext = Depends(require_user),
):
    source_text = _trim_source_text(body.text)

    if not source_text:
        raise HTTPException(status_code=400, detail="No text provided to generate flashcards from.")

    prompt = f"""Generate exactly {body.count} flashcards from the study material below.

Return ONLY a JSON array, no markdown fences, no explanation. Each item must have this exact shape:
{{"front": "question or term", "back": "answer or definition"}}

Study material:
---
{source_text}
---"""

    try:
        completion = await _create_groq_completion(
            model=DEFAULT_TEXT_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You generate study flashcards from provided material. Always respond with valid JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_tokens=2048,
            stream=False,
        )

        raw_content = completion.choices[0].message.content if completion.choices else ""
        flashcards = _parse_json_response(raw_content)

        if not isinstance(flashcards, list):
            raise ValueError("Model did not return a JSON array.")

    except (json.JSONDecodeError, ValueError):
        logger.exception("Flashcard generation returned invalid JSON")
        raise HTTPException(status_code=500, detail="Could not parse flashcards from the AI response. Try again.")
    except Exception:
        logger.exception("Flashcard generation error")
        raise HTTPException(status_code=500, detail="Could not generate flashcards right now.")

    return {"flashcards": flashcards}


@router.post("/quiz")
async def generate_quiz(
    body: QuizBody,
    ctx: AuthContext = Depends(require_user),
):
    source_text = _trim_source_text(body.text)

    if not source_text:
        raise HTTPException(status_code=400, detail="No text provided to generate a quiz from.")

    prompt = f"""Generate exactly {body.count} multiple-choice quiz questions from the study material below.

Return ONLY a JSON array, no markdown fences, no explanation. Each item must have this exact shape:
{{"question": "...", "options": ["A", "B", "C", "D"], "correctAnswer": "the exact text of the correct option", "explanation": "brief reason why it's correct"}}

Study material:
---
{source_text}
---"""

    try:
        completion = await _create_groq_completion(
            model=DEFAULT_TEXT_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You generate multiple-choice quiz questions from provided material. Always respond with valid JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_tokens=2048,
            stream=False,
        )

        raw_content = completion.choices[0].message.content if completion.choices else ""
        quiz = _parse_json_response(raw_content)

        if not isinstance(quiz, list):
            raise ValueError("Model did not return a JSON array.")

    except (json.JSONDecodeError, ValueError):
        logger.exception("Quiz generation returned invalid JSON")
        raise HTTPException(status_code=500, detail="Could not parse the quiz from the AI response. Try again.")
    except Exception:
        logger.exception("Quiz generation error")
        raise HTTPException(status_code=500, detail="Could not generate a quiz right now.")

    return {"quiz": quiz}


@router.post("/summarize")
async def summarize(
    body: SummarizeBody,
    ctx: AuthContext = Depends(require_user),
):
    source_text = _trim_source_text(body.text)

    if not source_text:
        raise HTTPException(status_code=400, detail="No text provided to summarize.")

    prompt = f"""Summarize the study material below into a clear, well-organized study summary.
Use headings and bullet points for key concepts. Keep it focused — don't just restate everything, highlight what matters most for understanding and recall.

Study material:
---
{source_text}
---"""

    try:
        completion = await _create_groq_completion(
            model=DEFAULT_TEXT_MODEL,
            messages=[
                {"role": "system", "content": "You summarize study material clearly and concisely for exam prep."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=1024,
            stream=False,
        )

        summary = completion.choices[0].message.content if completion.choices else ""

    except Exception:
        logger.exception("Summarize error")
        raise HTTPException(status_code=500, detail="Could not generate a summary right now.")

    return {"summary": (summary or "").strip()}