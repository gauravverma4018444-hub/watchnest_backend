// Blocked words (extend as needed)
const BLOCKED_WORDS = [
  // Profanity
  "fuck", "shit", "bitch", "asshole", "damn", "bastard",
  // Hate speech
  "nigger", "faggot", "retard", "hitler", "nazi",
  // Threats
  "kill you", "die", "murder",
  // Spam patterns
  "click here", "free money", "make money fast", "buy followers",
  "www.", "http://", "https://",
];

// Check for abusive content
const checkAbusive = (text) => {
  const lower = text.toLowerCase();
  const found = [];

  for (const word of BLOCKED_WORDS) {
    // Use word boundary regex
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(lower)) {
      found.push(word);
    }
  }

  return {
    isAbusive: found.length > 0,
    words: found,
  };
};

// Check for spam patterns
const checkSpam = (text) => {
  const flags = [];

  // Too many URLs
  const urlCount = (text.match(/https?:\/\/[^\s]+/g) || []).length;
  if (urlCount > 2) flags.push("Too many URLs");

  // Too many emojis
  const emojiCount = (text.match(/[\u{1F600}-\u{1F6FF}]/gu) || []).length;
  if (emojiCount > 15) flags.push("Excessive emojis");

  // ALL CAPS (>50% of alphabet chars)
  const alphaChars = text.replace(/[^a-zA-Z]/g, "");
  const upperChars = text.replace(/[^A-Z]/g, "");
  if (alphaChars.length > 10 && upperChars.length / alphaChars.length > 0.7) {
    flags.push("All caps shouting");
  }

  // Repeated words (spam)
  const words = text.toLowerCase().split(/\s+/);
  const wordCount = {};
  words.forEach((w) => {
    if (w.length > 2) wordCount[w] = (wordCount[w] || 0) + 1;
  });
  const maxRepeat = Math.max(...Object.values(wordCount), 0);
  if (maxRepeat > 5) flags.push("Repeated words");

  return {
    isSpam: flags.length > 0,
    reasons: flags,
  };
};

// Check for repeated special characters
const checkRepeatedChars = (text) => {
  // Same char repeated 5+ times
  const repeatedCharPattern = /(.)\1{4,}/;
  if (repeatedCharPattern.test(text)) {
    return { hasRepeated: true, pattern: "Same character 5+ times" };
  }

  // Same special char pattern
  const specialCharSpam = /[!@#$%^&*()_+={}\[\]|\\:";'<>?,./]{5,}/;
  if (specialCharSpam.test(text)) {
    return { hasRepeated: true, pattern: "Special char spam" };
  }

  return { hasRepeated: false };
};

// Main moderation function
const moderateComment = (text) => {
  const abusive = checkAbusive(text);
  const spam = checkSpam(text);
  const repeated = checkRepeatedChars(text);

  let score = 0;
  const reasons = [];
  let action = "allow";

  if (abusive.isAbusive) {
    score += 80;
    reasons.push(`Abusive: ${abusive.words.join(", ")}`);
    action = "block";
  }

  if (spam.isSpam) {
    score += 40;
    reasons.push(...spam.reasons);
    if (score >= 50) action = "flag";
  }

  if (repeated.hasRepeated) {
    score += 30;
    reasons.push(repeated.pattern);
    if (score >= 50) action = "flag";
  }

  return {
    action, // "allow" | "flag" | "block"
    score,
    reasons,
    isSafe: action === "allow",
  };
};

module.exports = {
  moderateComment,
  checkAbusive,
  checkSpam,
  checkRepeatedChars,
};