const {
  generateWithDeepSeek,
  generateWithGemini,
  generateWithOpenAI,
} = require("./providers");

async function generateAssistantResponse({
  provider,
  apiKey,
  baseUrl,
  modelName,
  systemPrompt,
  userMessage,
  temperature,
  maxTokens,
}) {
  switch (String(provider || "").trim().toLowerCase()) {
    case "openai":
      return generateWithOpenAI({
        apiKey,
        baseUrl,
        modelName,
        systemPrompt,
        userMessage,
        temperature,
        maxTokens,
      });
    case "deepseek":
      return generateWithDeepSeek({
        apiKey,
        baseUrl,
        modelName,
        systemPrompt,
        userMessage,
        temperature,
        maxTokens,
      });
    case "gemini":
      return generateWithGemini({
        apiKey,
        baseUrl,
        modelName,
        systemPrompt,
        userMessage,
        temperature,
        maxTokens,
      });
    default:
      throw new Error("Unsupported AI provider selected.");
  }
}

module.exports = {
  generateAssistantResponse,
};
