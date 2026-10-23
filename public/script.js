const $ = (id) => document.getElementById(id);

const themeToggle = $("themeToggle");
const themeIcon = $("themeIcon");
const themeLabel = $("themeLabel");

function applyTheme(theme) {
  const chosenTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = chosenTheme;

  themeIcon.textContent = chosenTheme === "dark" ? "☀️" : "🌙";
  themeLabel.textContent = chosenTheme === "dark" ? "Light mode" : "Dark mode";
  themeToggle.setAttribute(
    "aria-label",
    chosenTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"
  );

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = chosenTheme === "dark" ? "#0b1020" : "#f4f7fb";
  }
}

let savedTheme = "light";

try {
  savedTheme = localStorage.getItem("studymate-theme") || "light";
} catch (_) {
  // Theme still works for this page if storage is unavailable.
}

applyTheme(savedTheme);

themeToggle.addEventListener("click", () => {
  const nextTheme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";

  applyTheme(nextTheme);

  try {
    localStorage.setItem("studymate-theme", nextTheme);
  } catch (_) {
    // The selected theme remains active until the page is closed.
  }
});

async function apiPost(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  let data;

  try {
    data = await response.json();
  } catch (_) {
    throw new Error("Server se valid response nahi mila.");
  }

  if (!response.ok) {
    throw new Error(data.error || "Request complete nahi hui.");
  }

  return data;
}

function showResult(id, text, type = "success") {
  const box = $(id);
  box.hidden = false;
  box.replaceChildren();

  const content = document.createElement("div");
  content.className =
    type === "error" ? "result-content result-error" : "result-content";

  // textContent prevents AI output from being interpreted as HTML.
  content.textContent = text;
  box.appendChild(content);

  if (type === "success") {
    const actions = document.createElement("div");
    actions.className = "result-actions";

    const copy = document.createElement("button");
    copy.className = "copy-btn";
    copy.type = "button";
    copy.textContent = "Copy result";

    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = "Copied!";
      } catch (_) {
        copy.textContent = "Copy unavailable";
      }
    });

    actions.appendChild(copy);
    box.appendChild(actions);
  }
}

async function runTool({ buttonId, resultId, endpoint, payload }) {
  const button = $(buttonId);
  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = "Working...";

  showResult(resultId, "AI is preparing your response. Please wait.");
  $(resultId).firstChild.className = "result-content result-loading";

  try {
    const data = await apiPost(endpoint, payload);
    showResult(resultId, data.answer || "No answer was returned.");
  } catch (error) {
    showResult(resultId, error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

// 1. AI Chat Assistant
$("chatBtn").addEventListener("click", () => {
  const message = $("chatMessage").value.trim();

  if (!message) {
    showResult("chatResult", "Please pehle apna question likho.", "error");
    return;
  }

  runTool({
    buttonId: "chatBtn",
    resultId: "chatResult",
    endpoint: "/api/chat",
    payload: { message }
  });
});

// 2. Quiz Generator
$("quizBtn").addEventListener("click", () => {
  const topic = $("quizTopic").value.trim();
  const requestedCount = Number($("quizCount").value);
  const count = Math.min(100, Math.max(1, Math.floor(requestedCount || 10)));

  if (!topic) {
    showResult("quizResult", "Please quiz ka topic enter karo.", "error");
    return;
  }

  runTool({
    buttonId: "quizBtn",
    resultId: "quizResult",
    endpoint: "/api/quiz",
    payload: {
      topic,
      count
    }
  });
});

// 3. Text Summarizer
$("summarizeBtn").addEventListener("click", () => {
  const text = $("summaryText").value.trim();

  if (!text) {
    showResult("summaryResult", "Please apna study material paste karo.", "error");
    return;
  }

  if (text.length > 45000) {
    showResult(
      "summaryResult",
      "Text 45,000 characters se zyada hai. Isay chhota karke dobara try karo.",
      "error"
    );
    return;
  }

  runTool({
    buttonId: "summarizeBtn",
    resultId: "summaryResult",
    endpoint: "/api/summarize",
    payload: { text }
  });
});

// 4. PDF Assistant — extract text in the browser.
let extractedPdfText = "";
let pdfPageCount = 0;

const pdfFileInput = $("pdfFile");
const pdfStatus = $("pdfStatus");
const pdfAskBtn = $("pdfAskBtn");

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

pdfFileInput.addEventListener("change", async () => {
  const file = pdfFileInput.files && pdfFileInput.files[0];

  extractedPdfText = "";
  pdfPageCount = 0;
  pdfAskBtn.disabled = true;

  if (!file) {
    pdfStatus.textContent = "No PDF selected.";
    return;
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    pdfStatus.textContent = "Please PDF file select karo.";
    pdfFileInput.value = "";
    return;
  }

  if (file.size > 3 * 1024 * 1024) {
    pdfStatus.textContent = "File 3 MB se bari hai. Chhoti PDF select karo.";
    pdfFileInput.value = "";
    return;
  }

  if (!window.pdfjsLib) {
    pdfStatus.textContent = "PDF reader load nahi hua. Internet connection check karo.";
    return;
  }

  pdfStatus.textContent = "PDF read ho rahi hai...";

  try {
    const buffer = await file.arrayBuffer();
    const documentPdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer)
    }).promise;

    pdfPageCount = documentPdf.numPages;
    const pagesText = [];
    let totalCharacters = 0;

    for (let pageNumber = 1; pageNumber <= pdfPageCount; pageNumber++) {
      const page = await documentPdf.getPage(pageNumber);
      const content = await page.getTextContent();

      const pageText = content.items
        .map((item) => item.str || "")
        .join(" ");

      if (pageText.trim()) {
        const pageLabel = `\n[Page ${pageNumber}]\n`;
        const remaining = 45000 - totalCharacters;

        if (remaining <= pageLabel.length) break;

        const keptText = pageLabel + pageText.slice(0, remaining - pageLabel.length);
        pagesText.push(keptText);
        totalCharacters += keptText.length;
      }

      if (totalCharacters >= 45000) break;
    }

    extractedPdfText = pagesText.join("\n").trim();

    if (!extractedPdfText) {
      pdfStatus.textContent =
        "Is PDF se readable text nahi mila. Ho sakta hai yeh scanned PDF ho.";
      return;
    }

    pdfAskBtn.disabled = false;
    pdfStatus.textContent =
      `PDF ready: ${file.name} · ${pdfPageCount} pages · ` +
      `${extractedPdfText.length.toLocaleString()} characters extracted.`;
  } catch (error) {
    console.error("PDF extraction error:", error);
    pdfStatus.textContent =
      "PDF read nahi ho saki. File check karo ya doosri PDF try karo.";
  }
});

$("pdfAskBtn").addEventListener("click", () => {
  const question = $("pdfQuestion").value.trim();

  if (!extractedPdfText) {
    showResult("pdfResult", "Pehle readable PDF upload karo.", "error");
    return;
  }

  if (!question) {
    showResult("pdfResult", "PDF ke baare mein apna question likho.", "error");
    return;
  }

  runTool({
    buttonId: "pdfAskBtn",
    resultId: "pdfResult",
    endpoint: "/api/pdf-ask",
    payload: { pdfText: extractedPdfText, question }
  });
});

// 5. Assignment Help
$("assignmentBtn").addEventListener("click", () => {
  const topic = $("assignmentTopic").value.trim();
  const instructions = $("assignmentInstructions").value.trim();

  if (!topic) {
    showResult("assignmentResult", "Please assignment ka topic enter karo.", "error");
    return;
  }

  runTool({
    buttonId: "assignmentBtn",
    resultId: "assignmentResult",
    endpoint: "/api/assignment",
    payload: { topic, instructions }
  });
});
