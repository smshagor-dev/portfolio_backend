const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function normalizeBaseUrl(value, fallback) {
  return String(value || fallback || "").trim().replace(/\/+$/, "");
}

async function parseJsonResponse(response, fallbackMessage) {
  const payload = await response.json().catch(async () => {
    const text = await response.text().catch(() => "");
    return { error: { message: text || fallbackMessage } };
  });

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `${fallbackMessage} (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

async function generateWithOpenAI({
  apiKey,
  baseUrl,
  modelName,
  systemPrompt,
  userMessage,
  temperature = 0.2,
  maxTokens = 700,
}) {
  const response = await fetch(`${normalizeBaseUrl(baseUrl, DEFAULT_OPENAI_BASE_URL)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      temperature,
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  const payload = await parseJsonResponse(response, "OpenAI request failed.");
  const answer = String(payload?.choices?.[0]?.message?.content || "").trim();

  if (!answer) {
    throw new Error("OpenAI returned an empty response.");
  }

  return answer;
}

async function generateWithDeepSeek({
  apiKey,
  baseUrl,
  modelName,
  systemPrompt,
  userMessage,
  temperature = 0.2,
  maxTokens = 700,
}) {
  const response = await fetch(`${normalizeBaseUrl(baseUrl, DEFAULT_DEEPSEEK_BASE_URL)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  const payload = await parseJsonResponse(response, "DeepSeek request failed.");
  const answer = String(payload?.choices?.[0]?.message?.content || "").trim();

  if (!answer) {
    throw new Error("DeepSeek returned an empty response.");
  }

  return answer;
}

async function generateWithGemini({
  apiKey,
  baseUrl,
  modelName,
  systemPrompt,
  userMessage,
  temperature = 0.2,
  maxTokens = 700,
}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl, DEFAULT_GEMINI_BASE_URL);
  const response = await fetch(
    `${normalizedBaseUrl}/models/${encodeURIComponent(modelName)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userMessage }],
          },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      }),
    },
  );

  const payload = await parseJsonResponse(response, "Gemini request failed.");
  const answer = (payload?.candidates?.[0]?.content?.parts || [])
    .map((part) => String(part?.text || "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!answer) {
    throw new Error("Gemini returned an empty response.");
  }

  return answer;
}

module.exports = {
  generateWithDeepSeek,
  generateWithGemini,
  generateWithOpenAI,
};
