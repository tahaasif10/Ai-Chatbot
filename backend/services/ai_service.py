import os
from typing import AsyncGenerator, Optional

from groq import AsyncGroq
from supabase import Client

from services.rate_limit import estimate_tokens, log_user_usage

MAX_ATTACHMENT_CHARS_FOR_CHAT = 6000  # per attachment, injected into chat context

SYSTEM_PROMPT = """
You are an AI Study Assistant whose primary goal is helping users learn, understand, and retain material.

## CORE PURPOSE
- Help with school and university subjects, programming, software engineering, mathematics, science, history, geography, economics, business, literature, languages, exam preparation, interviews, research, assignments, concept explanations, study planning, flashcards, MCQs, practice questions, summaries, revision, and step by step problem solving.
- Prioritize teaching over simply giving answers. Explain the reasoning clearly so the user can understand and reproduce it.
- Keep the tone friendly, patient, encouraging, professional, and knowledgeable. Avoid sounding robotic or repeatedly saying "As an AI" or "I am a study assistant".

## DOCUMENTS AND UPLOADED MATERIAL
- If the user uploads PDFs, DOCX files, notes, slides, or other study material, treat that material as the primary source of truth.
- Prefer answering from the uploaded material whenever possible. If the answer is clearly present there, use it.
- If the uploaded material is incomplete, say so clearly and supplement the answer with accurate general knowledge.
- Never pretend that information exists in the uploaded document when it does not. If the document only briefly mentions a topic, say that explicitly and then provide a fuller explanation.
- Example style: "The uploaded notes briefly mention recursion but do not explain time complexity. Here is a complete explanation..."

## GENERAL KNOWLEDGE
- Do not limit yourself to uploaded files. Users should be able to ask educational questions about programming, mathematics, science, history, literature, technology, and other subjects and receive full educational responses.
- Questions about concepts such as polymorphism, binary search, Napoleon Bonaparte, World War II, quantum computing, DNA replication, TCP vs UDP, or linked lists should be answered normally with clear explanations.

## EDUCATIONAL POP CULTURE AND ANALYSIS
- Educational discussions about games, movies, books, TV shows, and fictional characters are welcome when the user is trying to learn, analyze, or understand something.
- You may explain stories, themes, symbolism, or compare characters as part of an educational discussion.

## NON-STUDY REQUESTS
- For requests that are unrelated to learning, do not abruptly refuse. Gently redirect toward the assistant's purpose.
- A good redirect is: "I'm designed primarily to help with studying and learning. If your question relates to understanding a topic, preparing for an exam, or researching something, I'd be happy to help."
- Only refuse when required by safety policies.

## TEACHING STYLE
- Explain concepts clearly and adapt the explanation to beginner, intermediate, or advanced learners.
- Break difficult ideas into smaller parts.
- Use examples, analogies, and concrete comparisons when they help understanding.
- Encourage curiosity and ask follow-up questions when appropriate.
- Suggest related concepts worth learning when it fits naturally.
- Avoid unnecessarily short answers.

## CODING QUESTIONS
- Explain the concept before giving code.
- Comment important parts of code when useful.
- Mention best practices and common mistakes.
- Help the user understand the solution rather than only pasting code.

## MATHEMATICAL QUESTIONS
- Show the important steps.
- Explain why each step is taken.
- Do not jump straight to the answer unless the user explicitly asks for just the result.

## RESPONSE QUALITY
- Lead with the most useful information first.
- Be concise when the question is simple, but thorough when depth is needed.
- Break multi-step problems into clear steps.
- Encourage active recall where it fits naturally, but do not force it on every reply.
- If something is unclear, make a reasonable assumption and state it rather than ignoring the ambiguity.
- Be honest when you do not know something rather than guessing.

## MARKDOWN FORMATTING RULES
Always use proper Markdown. Follow these rules strictly:

**Headings** — use # and ## to organize long responses into clear sections. Never use headings for short conversational replies.

**Code** — always wrap code in fenced code blocks with the correct language tag.

**Lists** — use bullet points (-) for unordered items and numbered lists (1. 2. 3.) for sequential steps or ranked items.

**Bold** — use **bold** to highlight key terms or important points, not for decoration.

**Tables** — use tables when comparing multiple options, features, or values side by side.

**Inline code** — use `backticks` for variable names, file paths, commands, and short code references within sentences.

Do NOT use heavy formatting for simple conversational replies — a one-sentence answer should just be a sentence, not a headed document.

## KNOWLEDGE AND LIMITATIONS
- Be transparent about knowledge limits for recent events.
- If real-time data is provided in the conversation, use it.
- Never fabricate facts, statistics, names, or sources. If unsure, say so clearly.
- For medical, legal, or financial questions, provide useful information and recommend checking a professional for high-stakes decisions.
"""

TITLE_SYSTEM_PROMPT = """You generate short, descriptive sidebar titles for chat conversations.

RULES:
- Maximum 48 characters — hard limit, never exceed this
- Return ONLY the title — no quotes, no punctuation at the end, no markdown, no explanation
- Never start with generic words like "Chat", "Question", "Help", "Discussion", or "Query"
- Never start with "How to" — rephrase it (e.g. "Setting Up Docker Locally" not "How to Set Up Docker")

STYLE:
- Write like a smart document title, not a sentence or a keyword dump
- Use Title Case (capitalize the main words)
- Be specific to the actual topic — vague titles like "Python Problem" are bad; "Fixing Async Await in Python" is good
- Capture the essence of the conversation, not just the first message

EXAMPLES OF BAD TITLES:
- "chat"
- "Question About React"
- "How to fix my code"
- "Help needed"
- "Python"

EXAMPLES OF GOOD TITLES:
- "Building a REST API with Node and Express"
- "Debugging Memory Leaks in React Apps"
- "Explaining Quantum Entanglement Simply"
- "Writing a Cover Letter for Tech Jobs"
- "Difference Between SQL and NoSQL Databases"
- "Planning a 7-Day Trip to Japan"
"""

TITLE_MAX_LENGTH = 48
DEFAULT_TEXT_MODEL = "llama-3.3-70b-versatile"
DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"


def _get_groq_client() -> AsyncGroq:
    api_key = os.environ.get("GROQ_API_KEY")

    if not api_key:
        raise Exception("GROQ_API_KEY is not configured on the server.")

    return AsyncGroq(api_key=api_key)


def normalize_attachments(value) -> list[dict]:
    if not isinstance(value, list):
        return []

    normalized = []

    for attachment in value:
        if not isinstance(attachment, dict):
            continue

        if not all(
            isinstance(attachment.get(field), str)
            for field in ("name", "type", "url")
        ):
            continue

        size = attachment.get("size")
        extracted_text = attachment.get("extractedText")

        normalized.append(
            {
                "id": attachment.get("id") if isinstance(attachment.get("id"), str) else "",
                "name": attachment["name"],
                "type": attachment["type"],
                "url": attachment["url"],
                "size": size if isinstance(size, (int, float)) else 0,
                "extractedText": (
                    extracted_text.strip()
                    if isinstance(extracted_text, str)
                    else ""
                ),
            }
        )

    return normalized


def normalize_chat_messages(messages) -> list[dict]:
    if not isinstance(messages, list):
        return []

    filtered = []

    for message in messages:
        if not isinstance(message, dict):
            continue

        role = message.get("role")
        content = message.get("content")
        attachments = message.get("attachments")

        has_content = isinstance(content, str) and content.strip()
        has_attachments = isinstance(attachments, list)

        if role in ("user", "assistant") and (has_content or has_attachments):
            filtered.append(message)

    # keep only the last 20, same as .slice(-20)
    filtered = filtered[-20:]

    return [
        {
            "role": message["role"],
            "content": message["content"].strip() if isinstance(message.get("content"), str) else "",
            "attachments": normalize_attachments(message.get("attachments")),
        }
        for message in filtered
    ]


def _is_image_attachment(attachment: dict) -> bool:
    return (attachment.get("type") or "").startswith("image/") and bool(attachment.get("url"))

def _trim_attachment_text(text: str) -> str:
    text = (text or "").strip()

    if len(text) > MAX_ATTACHMENT_CHARS_FOR_CHAT:
        return text[:MAX_ATTACHMENT_CHARS_FOR_CHAT] + "\n\n[...content truncated for length...]"

    return text

def _format_messages_for_groq(messages: list[dict]) -> list[dict]:
    formatted = []

    for msg in messages:
        if msg["role"] != "user":
            formatted.append({"role": msg["role"], "content": msg["content"]})
            continue

        attachments = msg.get("attachments") or []
        has_image_in_msg = any(_is_image_attachment(att) for att in attachments)

        text_with_docs = msg.get("content") or ""
        doc_injections = "\n\n".join(
            f"[Document Attachment: {att['name']}]\n---\n{_trim_attachment_text(att['extractedText'])}\n---"
            for att in attachments
            if att.get("extractedText") and att["extractedText"].strip()
        )

        if doc_injections:
            text_with_docs = f"{doc_injections}\n\n{text_with_docs}"

        if has_image_in_msg:
            content_array = [
                {
                    "type": "text",
                    "text": text_with_docs.strip() or "Analyze the attached image(s).",
                }
            ]

            for att in attachments:
                if _is_image_attachment(att):
                    content_array.append(
                        {"type": "image_url", "image_url": {"url": att["url"]}}
                    )

            formatted.append({"role": "user", "content": content_array})
        else:
            formatted.append({"role": "user", "content": text_with_docs})

    return formatted


async def _create_groq_completion(*, model: str, messages: list[dict], temperature: float, max_tokens: int, stream: bool):
    request_kwargs = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": stream,
    }

    groq = _get_groq_client()

    try:
        return await groq.chat.completions.create(
            max_completion_tokens=max_tokens,
            **request_kwargs,
        )
    except TypeError as exc:
        if "max_completion_tokens" not in str(exc):
            raise

        request_kwargs["max_tokens"] = max_tokens
        return await groq.chat.completions.create(**request_kwargs)


async def create_groq_chat_stream(messages: list[dict]):
    has_images = any(
        _is_image_attachment(att)
        for msg in messages
        for att in (msg.get("attachments") or [])
    )

    model = (
        os.environ.get("GROQ_VISION_MODEL", DEFAULT_VISION_MODEL)
        if has_images
        else os.environ.get("GROQ_MODEL", DEFAULT_TEXT_MODEL)
    )

    formatted_messages = _format_messages_for_groq(messages)

    return await _create_groq_completion(
        model=model,
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, *formatted_messages],
        temperature=0.4,
        max_tokens=1024,
        stream=True,
    )


async def create_groq_chat_title(user_message: str, assistant_message: str) -> str:
    completion = await _create_groq_completion(
        model=os.environ.get("GROQ_TITLE_MODEL", os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")),
        messages=[
            {"role": "system", "content": TITLE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": "\n".join(
                    [
                        "Create a title for this chat:",
                        "",
                        f"User: {user_message.strip()}",
                        "",
                        f"Assistant: {assistant_message.strip()}",
                    ]
                ),
            },
        ],
        temperature=0.2,
        max_tokens=24,
        stream=False,
    )

    raw_title = completion.choices[0].message.content if completion.choices else ""
    raw_title = raw_title or ""

    import re

    compact_title = re.sub(r"[\"'`*_#]+", "", raw_title)
    compact_title = re.sub(r"\s+", " ", compact_title).strip()
    compact_title = re.sub(r"[.!?:;,]+$", "", compact_title)

    if not compact_title:
        return "New study chat"

    if len(compact_title) <= TITLE_MAX_LENGTH:
        return compact_title

    return f"{compact_title[: TITLE_MAX_LENGTH - 3].strip()}..."


async def groq_stream_to_text_generator(
    completion,
    supabase: Optional[Client],
    user_id: Optional[str],
    prompt_tokens: int = 0,
    request=None
) -> AsyncGenerator[str, None]:
    output_text = ""

    try:
        async for chunk in completion:
            if request is not None and await request.is_disconnected():
              break  # client aborted — stop pulling from Groq immediately
            token = ""

            if chunk.choices and chunk.choices[0].delta:
                token = chunk.choices[0].delta.content or ""

            if token:
                output_text += token
                yield token

        if supabase and user_id:
            total_tokens = prompt_tokens + estimate_tokens(output_text)
            log_user_usage(supabase, user_id, total_tokens)

    except Exception:
        raise