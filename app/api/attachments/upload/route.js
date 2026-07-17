import { getAuthContext, unauthorized } from "@/lib/auth";
import { createRequire } from "module";
import mammoth from "mammoth";

// Server-side polyfills for browser-only APIs required by newer PDF.js builds inside pdf-parse
if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
    }
    static fromMatrix() { return new DOMMatrix(); }
    static fromFloat32Array() { return new DOMMatrix(); }
    static fromFloat64Array() { return new DOMMatrix(); }
    translate() { return this; }
    scale() { return this; }
    multiply() { return this; }
    inverse() { return this; }
    transformPoint(p) { return p; }
  };
}

if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = class ImageData {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  };
}

if (typeof globalThis.Path2D === "undefined") {
  globalThis.Path2D = class Path2D {
    constructor() {}
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    ellipse() {}
    rect() {}
  };
}

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

export async function POST(request) {
  const { supabase, user } = await getAuthContext(request);

  if (!user) {
    return unauthorized();
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return Response.json({ error: "No file provided or invalid file." }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      { error: "File size exceeds the 10MB limit." },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  // Upload to Supabase Storage
  const fileExt = file.name.split(".").pop();
  const uniqueId = crypto.randomUUID();
  const fileName = `${uniqueId}.${fileExt}`;
  const filePath = `${user.id}/${fileName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("chat-attachments")
    .upload(filePath, fileBuffer, {
      contentType: file.type,
      duplex: "half",
    });

  if (uploadError) {
    console.error("Supabase Storage Upload Error:", uploadError);
    return Response.json(
      { error: "Failed to upload file to storage." },
      { status: 500 }
    );
  }

  const { data: { publicUrl } } = supabase.storage
    .from("chat-attachments")
    .getPublicUrl(filePath);

  // Parse Text if applicable
  let extractedText = "";
  const mimeType = file.type;

  try {
    if (mimeType === "application/pdf") {
      const parsedPdf = await pdf(fileBuffer);
      extractedText = parsedPdf.text || "";
    } else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      extractedText = result.value || "";
    } else if (
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      fileExt === "csv" ||
      fileExt === "md"
    ) {
      extractedText = new TextDecoder().decode(fileBuffer);
    }
  } catch (parseError) {
    console.error("Text extraction failed for file:", file.name, parseError);
    // We don't fail the upload if text parsing fails; we just return empty text
    extractedText = "[Error: Could not extract text from this document]";
  }

  return Response.json({
    id: uniqueId,
    name: file.name,
    type: file.type,
    url: publicUrl,
    size: file.size,
    extractedText: extractedText.trim()
  });
}
