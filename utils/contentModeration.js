// ============================================
// CONTENT MODERATION SYSTEM
// ============================================

const BLOCKLIST = {
  adultKeywords: [
    "porn", "xxx", "nude", "naked", "nsfw", "18+", "adult only",
    "erotic", "sexual", "pornhub", "onlyfans", "sex tape",
    "hentai", "escort", "webcam girl",
  ],
  violenceKeywords: [
    "kill", "murder", "suicide", "bomb", "terrorist", "weapon",
    "gun", "shoot", "attack", "torture", "brutal", "beheading",
    "massacre", "genocide",
  ],
  hateKeywords: [
    "racist", "nazi", "hitler", "hate speech", "kill all",
    "white power", "islamophobic",
  ],
  drugKeywords: [
    "cocaine", "heroin", "meth", "marijuana", "drug dealer",
    "ecstasy", "lsd", "opium",
  ],
  spamPatterns: [
    "free followers", "click here now", "win money now",
    "limited offer", "make money fast", "get rich quick",
    "buy followers", "hack account",
  ],
  scamKeywords: [
    "scam", "fraud", "phishing", "fake giveaway",
    "credit card hack", "bank account hack",
  ],
};

const WARNING_WORDS = [
  "violence", "blood", "gore", "fight", "war",
  "alcohol", "smoke", "gambling", "casino", "betting",
  "mature", "graphic",
];

// Improved keyword check with word boundaries (reduces false positives)
const containsKeyword = (text, keyword) => {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(text);
};

class ContentModerator {
  static analyze(text) {
    if (!text || typeof text !== "string") {
      return {
        isSafe: true,
        blocked: false,
        score: 0,
        flags: [],
        warnings: [],
        action: "APPROVE",
      };
    }

    const lowerText = text.toLowerCase();
    const flags = [];
    const warnings = [];
    let score = 0;
    let category = null;

    // Adult content (highest priority)
    for (const keyword of BLOCKLIST.adultKeywords) {
      if (containsKeyword(lowerText, keyword)) {
        flags.push({ type: "ADULT", keyword, severity: "HIGH" });
        score += 100;
        category = "adult";
      }
    }

    // Violence
    for (const keyword of BLOCKLIST.violenceKeywords) {
      if (containsKeyword(lowerText, keyword)) {
        flags.push({ type: "VIOLENCE", keyword, severity: "HIGH" });
        score += 80;
        category = category || "violence";
      }
    }

    // Hate speech
    for (const keyword of BLOCKLIST.hateKeywords) {
      if (containsKeyword(lowerText, keyword)) {
        flags.push({ type: "HATE", keyword, severity: "HIGH" });
        score += 90;
        category = category || "hate";
      }
    }

    // Drugs
    for (const keyword of BLOCKLIST.drugKeywords) {
      if (containsKeyword(lowerText, keyword)) {
        flags.push({ type: "DRUGS", keyword, severity: "MEDIUM" });
        score += 60;
        category = category || "drugs";
      }
    }

    // Spam
    for (const pattern of BLOCKLIST.spamPatterns) {
      if (containsKeyword(lowerText, pattern)) {
        flags.push({ type: "SPAM", keyword: pattern, severity: "LOW" });
        score += 30;
      }
    }

    // Scam
    for (const keyword of BLOCKLIST.scamKeywords) {
      if (containsKeyword(lowerText, keyword)) {
        flags.push({ type: "SCAM", keyword, severity: "MEDIUM" });
        score += 50;
      }
    }

    // Warning words
    for (const word of WARNING_WORDS) {
      if (containsKeyword(lowerText, word)) {
        warnings.push(word);
      }
    }

    // Determine action
    let action, blocked, isSafe;
    if (score >= 80) {
      action = "BLOCK";
      blocked = true;
      isSafe = false;
    } else if (score >= 30) {
      action = "REVIEW";
      blocked = false;
      isSafe = false;
    } else {
      action = "APPROVE";
      blocked = false;
      isSafe = true;
    }

    const flaggedWords = flags.map((f) => f.keyword);
    const reason = flags.length > 0
      ? flags.map((f) => `${f.type}: "${f.keyword}"`).join(", ")
      : null;

    const warning = warnings.length > 0
      ? `Contains sensitive content: ${warnings.join(", ")}`
      : null;

    return {
      isSafe,
      blocked,
      score,
      action,
      category,
      flags,
      flaggedWords,
      warnings,
      reason,
      warning,
    };
  }

  static async moderateVideo(videoData) {
    const { title = "", description = "", tags = [] } = videoData;
    const combinedText = [title, description, ...(tags || [])].join(" ");
    return this.analyze(combinedText);
  }

  static moderateComment(text) {
    return this.analyze(text);
  }

  static containsProhibitedExtension(filename) {
    const prohibited = [".exe", ".bat", ".sh", ".php", ".vbs", ".cmd", ".msi", ".dll", ".scr", ".jar"];
    const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
    return prohibited.includes(ext);
  }

  static validateVideoFile(mimetype) {
    const allowed = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-matroska"];
    return allowed.includes(mimetype);
  }

  static validateImageFile(mimetype) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    return allowed.includes(mimetype);
  }

  static MAX_VIDEO_SIZE = 500 * 1024 * 1024;
  static MAX_THUMBNAIL_SIZE = 10 * 1024 * 1024;
}

// Legacy function - kept for backward compatibility with uploadVideo & rescanVideo
const checkContent = (text) => {
  const result = ContentModerator.analyze(text);
  return {
    blocked: result.blocked,
    warning: result.warning,
    reason: result.reason,
    word: result.flaggedWords[0] || null,
    score: result.score,
    action: result.action,
  };
};

module.exports = {
  ContentModerator,
  checkContent,
};