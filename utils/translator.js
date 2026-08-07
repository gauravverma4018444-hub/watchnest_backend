const axios = require("axios");

// Simple translation using free API (LibreTranslate)
// For production, use Google Translate API or DeepL
const translateText = async (text, targetLang, sourceLang = "auto") => {
  try {
    // Using MyMemory API (free, no key needed for < 1000 words/day)
    const response = await axios.get(
      "https://api.mymemory.translated.net/get",
      {
        params: {
          q: text,
          langpair: `${sourceLang === "auto" ? "en" : sourceLang}|${targetLang}`,
        },
        timeout: 5000,
      }
    );

    if (response.data?.responseData?.translatedText) {
      return {
        success: true,
        translatedText: response.data.responseData.translatedText,
        detectedLang: response.data.responseData.detectedLang || sourceLang,
      };
    }

    return { success: false, error: "Translation failed" };
  } catch (error) {
    console.error("Translation error:", error.message);
    return { success: false, error: error.message };
  }
};

// Detect language (simple heuristic)
const detectLanguage = (text) => {
  // Hindi/Devanagari
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  // Chinese
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
  // Japanese
  if (/[\u3040-\u30FF]/.test(text)) return "ja";
  // Korean
  if (/[\uAC00-\uD7AF]/.test(text)) return "ko";
  // Arabic
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  // Tamil
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta";
  // Bengali
  if (/[\u0980-\u09FF]/.test(text)) return "bn";
  // Default to English
  return "en";
};

module.exports = { translateText, detectLanguage };