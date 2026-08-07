// Categories of blocked content
const BLOCKED_CATEGORIES = {
  adult: [
    "porn", "xxx", "sex", "nude", "naked", "erotic", "adult",
    "18+", "nsfw", "onlyfans", "webcam", "hentai", "escort",
  ],
  violence: [
    "kill", "murder", "suicide", "bomb", "terrorist", "weapon",
    "gun", "shoot", "torture", "brutal", "beheading", "gore",
    "massacre", "attack", "genocide",
  ],
  drugs: [
    "cocaine", "heroin", "meth", "marijuana", "drug dealer",
    "ecstasy", "lsd", "opium", "cannabis", "weed",
  ],
  hate: [
    "racist", "nazi", "hitler", "hate speech", "kill all",
    "white power", "islamophobic", "antisemitic",
  ],
  scam: [
    "hack account", "credit card hack", "bank hack",
    "phishing", "fake giveaway", "money laundering",
  ],
};

// Get all blocked words as flat array
const getAllBlockedWords = () => {
  return Object.values(BLOCKED_CATEGORIES).flat();
};

// Check if query contains blocked content
const checkQuery = (query) => {
  if (!query || typeof query !== "string") {
    return { blocked: false, blockedWords: [], categories: [] };
  }

  const lowerQuery = query.toLowerCase();
  const blockedWords = [];
  const categories = new Set();

  for (const [category, words] of Object.entries(BLOCKED_CATEGORIES)) {
    for (const word of words) {
      // Use word boundary regex to avoid false positives
      const regex = new RegExp(`\\b${word}\\b`, "i");
      if (regex.test(lowerQuery)) {
        blockedWords.push(word);
        categories.add(category);
      }
    }
  }

  return {
    blocked: blockedWords.length > 0,
    blockedWords: [...new Set(blockedWords)],
    categories: [...categories],
    severity:
      categories.has("adult") || categories.has("violence")
        ? "HIGH"
        : "MEDIUM",
  };
};

module.exports = {
  BLOCKED_CATEGORIES,
  getAllBlockedWords,
  checkQuery,
};