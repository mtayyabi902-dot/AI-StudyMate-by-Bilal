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

// -------------------- HEALTH CHECK --------------------

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    configured: Boolean(ai),
    app: "AI StudyMate by Bilal",
    fallbackEnabled: true
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// -------------------- INPUT VALIDATION --------------------

function getText(value, maxLength = 45000) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error("Please required information enter karo.");
    error.status = 400;
    throw error;
  }

  return value.trim().slice(0, maxLength);
}

// -------------------- ERROR HELPERS --------------------

function getErrorInfo(error) {
  const message = String(error?.message || "").toLowerCase();

  const status = Number(
    error?.status ??
    error?.statusCode ??
    error?.code
  );

  const isQuota =
    status === 429 ||
    message.includes("resource_exhausted") ||
    message.includes("quota");

  const isTemporary =
    status === 503 ||
    status === 502 ||
    status === 504 ||
    status === 500 ||
    message.includes("unavailable") ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("temporarily") ||
    message.includes("econnreset") ||
    message.includes("etimedout");

  return {
    isQuota,
    isTemporary,
    status
  };
}

// -------------------- GEMINI REQUEST --------------------

async function generateAI(prompt) {
  if (!ai) {
    const error = new Error("Gemini API key is not configured.");
    error.status = 503;
    throw error;
  }

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt
  });

  const answer = response?.text;

  if (!answer || !answer.trim()) {
    const error = new Error("Empty AI response.");
    error.status = 503;
    throw error;
  }

  return answer.trim();
}

// -------------------- FALLBACK HELPERS --------------------

function makeDemoResponse(answer, reason = "ai_unavailable") {
  return {
    answer,
    demoMode: true,
    notice:
      reason === "quota"
        ? "Demo Mode: Gemini free quota khatam hai. Real AI answers quota reset hone par available ho sakte hain."
        : "Demo Mode: Gemini AI filhal unavailable hai. Yeh basic demo response hai."
  };
}

function getTopicWords(text) {
  return text
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
}

function demoChat(question) {
  const topic = getTopicWords(question) || "this topic";

  return [
    "### Demo Mode — Study Assistant",
    "",
    `Your question is about: **${topic}**`,
    "",
    "Gemini AI is currently unavailable, so this is a basic demo response rather than a verified AI answer.",
    "",
    "**To study this topic:**",
    "1. Identify the main concept and learn its definition.",
    "2. Break the topic into smaller parts.",
    "3. Review examples from your textbook or lecture notes.",
    "4. Practice explaining the concept in your own words.",
    "",
    "Please try again when the AI service is available for a detailed answer."
  ].join("\n");
}

function demoSummary(text) {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

  const summary = sentences.slice(0, 5);

  return [
    "### Demo Summary",
    "",
    "Gemini AI is unavailable. This is a basic extractive summary generated from the text you supplied.",
    "",
    "**Main points:**",
    ...(summary.length
      ? summary.map(sentence => `- ${sentence}`)
      : [`- ${text.slice(0, 1200)}`]),
    "",
    "**Note:** This summary may miss important details. Review the original material."
  ].join("\n");
}

function demoQuiz(topic, count) {
  const safeTopic = topic.replace(/\s+/g, " ").trim();
  const questions = [];

  for (let i = 1; i <= count; i++) {
    questions.push(
      `${i}. Which is the best way to study "${safeTopic}"?\n` +
      "A. Memorize words without understanding\n" +
      "B. Understand concepts and practice examples\n" +
      "C. Skip the topic completely\n" +
      "D. Avoid reviewing notes\n" +
      "Correct answer: B\n" +
      "Explanation: Understanding and practicing concepts supports learning. This is a generic demo question, not a topic-verified question."
    );
  }

  return [
    "### Demo Quiz",
    "",
    "Gemini AI is unavailable. These are generic practice questions, not verified questions about your topic.",
    "",
    questions.join("\n\n")
  ].join("\n");
}

function demoAssignment(topic, instructions) {
  return [
    `# Assignment: ${topic}`,
    "",
    "> Demo Mode: This is a basic template, not a fully researched AI assignment.",
    "",
    "## Introduction",
    `${topic} is the subject of this assignment. Begin by explaining its meaning, background, and importance using reliable course material.`,
    "",
    "## Main Discussion",
    "Describe the key concepts, important features, and relevant examples. Organize the discussion into headings based on your teacher's requirements.",
    "",
    "## Examples and Applications",
    "Add accurate examples from your textbook, class notes, or reliable sources.",
    "",
    "## Conclusion",
    `Summarize the main ideas about ${topic} and explain why they matter.`,
    "",
    "## Instructions to follow",
    instructions || "Follow the assignment format provided by your teacher.",
    "",
    "## References",
    "Add real sources that you have personally checked. Do not submit invented references.",
    "",
    "Please review and complete this template before submitting it."
  ].join("\n");
}

function demoPdfAnswer(pdfText, question) {
  const queryWords = question
    .toLowerCase()
    .split(/\W+/)
    .filter(word => word.length > 3);

  const paragraphs = pdfText
    .split(/\n{2,}|(?<=[.!?])\s+/)
    .map(part => part.trim())
    .filter(Boolean);

  const matches = paragraphs.filter(paragraph =>
    queryWords.some(word => paragraph.toLowerCase().includes(word))
  );

  const excerpts = (matches.length ? matches : paragraphs).slice(0, 4);

  return [
    "### PDF Assistant — Demo Mode",
    "",
    "Gemini AI is unavailable. I cannot provide a reliable AI-generated answer right now.",
    "",
    "**Your question:**",
    question,
    "",
    "**Relevant extracted text:**",
    ...(excerpts.length
      ? excerpts.map(part => `- ${part.slice(0, 700)}`)
      : ["No usable text was found in the supplied PDF text."]),
    "",
    "These are text excerpts, not a verified answer. Check the PDF yourself and try again when AI is available."
  ].join("\n");
}

// -------------------- AI + FALLBACK CONTROLLER --------------------

async function sendAIOrDemo(res, prompt, fallbackFactory) {
  let lastError;

  if (ai) {
    // Retry one time only for temporary server/model problems.
    // Do not retry quota errors: that wastes time and will not restore quota.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const answer = await generateAI(prompt);
        return res.json({
          answer,
          demoMode: false
        });
      } catch (error) {
        lastError = error;
        const info = getErrorInfo(error);

        console.error(
          `Gemini request failed (attempt ${attempt + 1}):`,
          error?.message || "Unknown error"
        );

        if (info.isQuota) {
          return res.json(
            makeDemoResponse(fallbackFactory(), "quota")
          );
        }

        if (info.isTemporary && attempt === 0) {
          // Brief delay, kept short for serverless hosting.
          await new Promise(resolve => setTimeout(resolve, 700));
          continue;
        }

        break;
      }
    }
  } else {
    console.warn("Gemini API key is missing; using Demo Mode.");
  }

  // Keep the website usable if the API key is missing,
  // the model is busy, or another AI request fails.
  const fallbackAnswer = fallbackFactory();

  if (lastError) {
    const info = getErrorInfo(lastError);

    return res.json(
      makeDemoResponse(
        fallbackAnswer,
        info.isQuota ? "quota" : "ai_unavailable"
      )
    );
  }

  return res.json(
    makeDemoResponse(fallbackAnswer, "ai_unavailable")
  );
}

// -------------------- CHAT --------------------

app.post("/api/chat", async (req, res, next) => {
  try {
    const question = getText(req.body.message, 8000);

    const prompt = `
You are AI StudyMate by Bilal, a helpful student assistant.
Explain concepts clearly using simple English. Use Roman Urdu if the
student requests it. Give accurate, organized, student-friendly answers.
If a question is unclear, ask for clarification.

Student's question:
${question}
`;

    return await sendAIOrDemo(
      res,
      prompt,
      () => demoChat(question)
    );
  } catch (error) {
    next(error);
  }
});

// -------------------- SUMMARIZER --------------------

app.post("/api/summarize", async (req, res, next) => {
  try {
    const text = getText(req.body.text);

    const prompt = `
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
`;

    return await sendAIOrDemo(
      res,
      prompt,
      () => demoSummary(text)
    );
  } catch (error) {
    next(error);
  }
});

// -------------------- QUIZ GENERATOR --------------------

app.post("/api/quiz", async (req, res, next) => {
  try {
    const topic = getText(req.body.topic, 2000);

    const count = Math.min(
      20,
      Math.max(1, Number.parseInt(req.body.count, 10) || 5)
    );

    const prompt = `
Create exactly ${count} multiple-choice questions about this topic:
${topic}

For each question:
- Give four options labelled A, B, C, D.
- Give only one correct answer.
- Include the correct answer and a brief explanation after the options.
- Keep the questions useful for student exam preparation.
- Number each question clearly.
`;

    return await sendAIOrDemo(
      res,
      prompt,
      () => demoQuiz(topic, count)
    );
  } catch (error) {
    next(error);
  }
});

// -------------------- ASSIGNMENT HELP --------------------

app.post("/api/assignment", async (req, res, next) => {
  try {
    const topic = getText(req.body.topic, 5000);

    const instructions = String(req.body.instructions || "")
      .trim()
      .slice(0, 5000);

    const prompt = `
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
`;

    return await sendAIOrDemo(
      res,
      prompt,
      () => demoAssignment(topic, instructions)
    );
  } catch (error) {
    next(error);
  }
});

// -------------------- PDF ASSISTANT --------------------

app.post("/api/pdf-ask", async (req, res, next) => {
  try {
    const pdfText = getText(req.body.pdfText, 45000);
    const question = getText(req.body.question, 5000);

    const prompt = `
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
`;

    return await sendAIOrDemo(
      res,
      prompt,
      () => demoPdfAnswer(pdfText, question)
    );
  } catch (error) {
    next(error);
  }
});

// -------------------- ERROR HANDLER --------------------

app.use((err, req, res, next) => {
  console.error("Request error:", err?.message || "Unknown error");

  if (res.headersSent) return next(err);

  if (err.status === 400) {
    return res.status(400).json({
      error: err.message || "Please check your input."
    });
  }

  res.status(500).json({
    error: "Request process nahi ho saki. Input check karke dobara try karo."
  });
});

// -------------------- SERVER START --------------------

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `AI StudyMate by Bilal running at http://localhost:${PORT}`
    );
  });
}

module.exports = app;
