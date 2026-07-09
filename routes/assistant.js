const express = require("express");
const { generatePortfolioAssistantReply } = require("../services/contact-assistant");

const router = express.Router();

function normalizeString(value) {
  return String(value || "").trim();
}

router.post("/assistant", async (request, response) => {
  try {
    const message = normalizeString(request.body?.message);

    if (!message) {
      return response.status(400).json({
        success: false,
        message: "Message is required.",
      });
    }
    const answer = await generatePortfolioAssistantReply(message);

    return response.json({
      success: true,
      answer,
    });
  } catch (error) {
    console.error("Assistant request failed:", error.message);
    return response.status(500).json({
      success: false,
      message: "Assistant request failed.",
    });
  }
});

module.exports = router;
