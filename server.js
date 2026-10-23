const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    configured: Boolean(ai),
    app: "AI StudyMate by Bilal"
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function generateAI(prompt) {
  if (!ai) {
    const error = new Error(
      "Gemini API key set nahi hai. Apni .env file check karo."
    );
    error.status = 503;
    throw error;
  }

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt
  });

  const answer = response.text;

  if (!answer || !answer.trim()) {
    throw new Error("AI se text response nahi mila. Dobara try karo.");
  }

  return answer.trim();
}

function getText(value, maxLength = 45000) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error("Please required information enter karo.");
    error.status = 400;
    throw error;
  }

  return value.trim().slice(0, maxLength);
}

app.post("/api/chat", async (req, res, next) => {
  try {
    const question = getText(req.body.message, 8000);

    const answer = await generateAI(`
You are AI StudyMate by Bilal, a helpful student assistant.
Explain concepts clearly using simple English. Use Roman Urdu if the
student requests it. Give accurate, organized, student-friendly answers.
If a question is unclear, ask for clarification.

Student's question:
${question}
`);

    res.json({ answer });
  } catch (error) {
    next(error);
  }
});

app.post("/api/summarize", async (req, res, next) => {
  try {
    const text = getText(req.body.text);

    const answer = await generateAI(`
Summarize the following study material for a student.
Include:
1. A clear title.
2. The main idea.
3. Important points in bullet form.
4. Key terms and definitions.
5. A short revision summary.
Use simple language and do not invent facts.

Study material:
${text}
`);

    res.json({ answer });
  } catch (error) {
    next(error);
  }
});

app.post("/api/quiz", async (req, res, next) => {
  try {
    const topic = getText(req.body.topic, 2000);
    const count = Math.min(
      20,
      Math.max(1, Number.parseInt(req.body.count, 10) || 5)
    );

    const answer = await generateAI(`
Create exactly ${count} multiple-choice questions about this topic:
${topic}

For each question:
- Give four options labelled A, B, C, D.
- Give only one correct answer.
- Include the correct answer and a brief explanation after the options.
- Keep the questions useful for student exam preparation.
- Number each question clearly.
`);

    res.json({ answer });
  } catch (error) {
    next(error);
  }
});

app.post("/api/assignment", async (req, res, next) => {
  try {
    const topic = getText(req.body.topic, 5000);
    const instructions = String(req.body.instructions || "")
      .trim()
      .slice(0, 5000);

    const answer = await generateAI(`
Help a student prepare an assignment on this topic:
${topic}

Teacher's instructions:
${instructions || "No additional instructions supplied."}

Provide:
- A suitable title
- An introduction
- Organized headings and explanations
- Examples where useful
- A conclusion
- Suggested sources or references to verify

Use original wording, do not invent citations, and tell the student
to verify facts and follow their institution's academic integrity rules.
`);

    res.json({ answer });
  } catch (error) {
    next(error);
  }
});

app.post("/api/pdf-ask", async (req, res, next) => {
  try {
    const pdfText = getText(req.body.pdfText, 45000);
    const question = getText(req.body.question, 5000);

    const answer = await generateAI(`
You are a study assistant. Answer the student's question using the
provided PDF text as your primary source.

If the answer is not present in the text, clearly say so. You may give
general background separately, but do not pretend it came from the PDF.
Use simple explanations and cite page numbers only if they are present
in the extracted text.

PDF text:
${pdfText}

Student's question:
${question}
`);

    res.json({ answer });
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  console.error("API error:", err.message);

  if (res.headersSent) return next(err);

  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  const message = String(err.message || "").toLowerCase();

  if (
    message.includes("429") ||
    message.includes("resource_exhausted") ||
    message.includes("quota")
  ) {
    return res.status(429).json({
      error: "Gemini API quota limit reached. Baad mein dobara try karo."
    });
  }

  if (
    message.includes("api key") ||
    message.includes("unauthorized") ||
    message.includes("permission denied")
  ) {
    return res.status(401).json({
      error: "Gemini API key ya uski permissions check karo."
    });
  }

  res.status(500).json({
    error: "AI request complete nahi hui. Server logs check karo aur dobara try karo."
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AI StudyMate by Bilal running at http://localhost:${PORT}`);
  });
}

module.exports = app;