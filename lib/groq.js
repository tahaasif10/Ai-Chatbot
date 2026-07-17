import Groq from "groq-sdk";
import { estimateTokens, logUserUsage } from "@/lib/rateLimit";

export const SYSTEM_PROMPT = `
You are an intelligent, versatile AI assistant — capable of helping with anything from technical problems and creative writing to research, math, advice, and everyday questions.

## CORE BEHAVIOR
- Answer every question directly and confidently
- Match the user's tone: casual when they're casual, precise when they're technical
- For complex topics, structure your response so it's easy to follow
- If something is unclear, make a reasonable assumption and state it — don't just ask for clarification
- Never pad responses with filler like "Great question!", "Certainly!", or "Of course!"
- Be honest when you don't know something rather than guessing

## RESPONSE QUALITY
- Lead with the most useful information first — don't bury the answer
- Be concise when the question is simple; be thorough when depth is needed
- Use analogies and examples to explain difficult concepts
- When giving opinions or recommendations, be direct — say "I'd recommend X" not "You might want to consider perhaps X"
- Break down multi-step problems step by step

## MARKDOWN FORMATTING RULES
Always use proper Markdown. Follow these rules strictly:

**Headings** — use # and ## to organize long responses into clear sections. Never use headings for short conversational replies.

**Code** — always wrap code in fenced code blocks with the correct language tag:
\`\`\`python
print("like this")
\`\`\`

**Lists** — use bullet points (-) for unordered items, numbered lists (1. 2. 3.) for sequential steps or ranked items.

**Bold** — use **bold** to highlight key terms or important points, not for decoration.

**Tables** — use tables when comparing multiple options, features, or values side by side.

**Inline code** — use \`backticks\` for variable names, file paths, commands, and short code references within sentences.

Do NOT use heavy formatting for simple conversational replies — a one-sentence answer should just be a sentence, not a headed document.

## KNOWLEDGE & LIMITATIONS
- Your training data has a knowledge cutoff — be transparent about this for recent events
- If real-time data (prices, news, scores, weather) is provided in the conversation, use it
- Never fabricate facts, statistics, names, or sources — if unsure, say so clearly
- For medical, legal, or financial questions: give genuinely useful information, then recommend consulting a professional for high-stakes decisions

## PERSONALITY
- Confident but not arrogant
- Helpful without being sycophantic
- Direct without being cold
- Curious and engaged with the user's problem — treat every question as worth answering well
`;

const TITLE_SYSTEM_PROMPT = `You generate short, descriptive sidebar titles for chat conversations.

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
- "Planning a 7-Day Trip to Japan"`;

const TITLE_MAX_LENGTH = 48;
const DEFAULT_TEXT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

function normalizeAttachments(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((attachment) => {
      return (
        attachment &&
        typeof attachment.name === "string" &&
        typeof attachment.type === "string" &&
        typeof attachment.url === "string"
      );
    })
    .map((attachment) => ({
      id: typeof attachment.id === "string" ? attachment.id : "",
      name: attachment.name,
      type: attachment.type,
      url: attachment.url,
      size: Number.isFinite(attachment.size) ? attachment.size : 0,
      extractedText:
        typeof attachment.extractedText === "string"
          ? attachment.extractedText.trim()
          : "",
    }));
}

function isImageAttachment(attachment) {
  return attachment.type.startsWith("image/") && attachment.url;
}

function isDocumentAttachment(attachment) {
  return Boolean(attachment.extractedText);
}

function buildTextWithDocuments(content, attachments) {
  const documentBlocks = attachments
    .filter(isDocumentAttachment)
    .map((attachment) =>
      [
        `[Document Attachment: ${attachment.name}]`,
        "---",
        attachment.extractedText,
        "---",
      ].join("\n")
    );

  if (documentBlocks.length === 0) {
    return content;
  }

  return [
    ...documentBlocks,
    "",
    `User Prompt: ${content || "Please analyze the attached file."}`,
  ].join("\n");
}

function toGroqMessage(message) {
  if (message.role !== "user") {
    return {
      role: message.role,
      content: message.content,
    };
  }

  const text = buildTextWithDocuments(message.content, message.attachments);
  const images = message.attachments.filter(isImageAttachment);

  if (images.length === 0) {
    return {
      role: "user",
      content: text,
    };
  }

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: text || "Please analyze the attached image.",
      },
      ...images.map((attachment) => ({
        type: "image_url",
        image_url: {
          url: attachment.url,
        },
      })),
    ],
  };
}

export function normalizeChatMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => {
      return (
        message &&
        (message.role === "user" || message.role === "assistant") &&
        (typeof message.content === "string" && message.content.trim() || Array.isArray(message.attachments))
      );
    })
    .slice(-20)
    .map((message) => ({
      role: message.role,
      content: typeof message.content === "string" ? message.content.trim() : "",
      attachments: Array.isArray(message.attachments) ? normalizeAttachments(message.attachments) : [],
    }));
}

export async function createGroqChatStream(messages) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured on the server.");
  }

  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

  // Check if there are any images in any of the messages to choose vision model
  const hasImages = messages.some((msg) =>
    msg.attachments?.some((att) => att.type?.startsWith("image/"))
  );

  const model = hasImages
    ? (process.env.GROQ_VISION_MODEL || DEFAULT_VISION_MODEL)
    : (process.env.GROQ_MODEL || DEFAULT_TEXT_MODEL);

  // Format messages for Groq completion API
  const formattedMessages = messages.map((msg) => {
    if (msg.role !== "user") {
      return {
        role: msg.role,
        content: msg.content,
      };
    }

    const hasImgInMsg = msg.attachments?.some((att) => att.type?.startsWith("image/"));

    // Prepare document text injections if any
    let textWithDocs = msg.content || "";
    if (msg.attachments && msg.attachments.length > 0) {
      const docInjections = msg.attachments
        .filter((att) => att.extractedText && att.extractedText.trim())
        .map((att) => `[Document Attachment: ${att.name}]\n---\n${att.extractedText.trim()}\n---`)
        .join("\n\n");

      if (docInjections) {
        textWithDocs = `${docInjections}\n\n${textWithDocs}`;
      }
    }

    if (hasImgInMsg) {
      const contentArray = [
        { type: "text", text: textWithDocs.trim() || "Analyze the attached image(s)." },
      ];

      const imageAttachments = msg.attachments.filter((att) =>
        att.type?.startsWith("image/")
      );

      for (const img of imageAttachments) {
        contentArray.push({
          type: "image_url",
          image_url: {
            url: img.url,
          },
        });
      }

      return {
        role: "user",
        content: contentArray,
      };
    } else {
      return {
        role: "user",
        content: textWithDocs,
      };
    }
  });

  return groq.chat.completions.create({
    model: model,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...formattedMessages],
    temperature: 0.4,
    max_completion_tokens: 1024,
    stream: true,
  });
}

export async function createGroqChatTitle({ userMessage, assistantMessage }) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured on the server.");
  }

  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_TITLE_MODEL || process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: TITLE_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          "Create a title for this chat:",
          "",
          `User: ${userMessage.trim()}`,
          "",
          `Assistant: ${assistantMessage.trim()}`,
        ].join("\n"),
      },
    ],
    temperature: 0.2,
    max_completion_tokens: 24,
  });

  const rawTitle = completion.choices?.[0]?.message?.content || "";
  const compactTitle = rawTitle
    .replace(/["'`*_#]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?:;,]+$/g, "");

  if (!compactTitle) {
    return "New chat";
  }

  if (compactTitle.length <= TITLE_MAX_LENGTH) {
    return compactTitle;
  }

  return `${compactTitle.slice(0, TITLE_MAX_LENGTH - 3).trim()}...`;
}

export function groqStreamToTextStream(
  completion,
  supabase,
  userId,
  promptTokens = 0
) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let outputText = "";

      try {
        for await (const chunk of completion) {
          const token = chunk.choices?.[0]?.delta?.content || "";

          if (token) {
            outputText += token;
            controller.enqueue(encoder.encode(token));
          }
        }

        if (supabase && userId) {
          const totalTokens = promptTokens + estimateTokens(outputText);
          await logUserUsage(supabase, userId, totalTokens);
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
