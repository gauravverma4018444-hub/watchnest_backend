const express = require("express");
const router = express.Router();
const Comment = require("../models/Comment");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const { moderateComment } = require("../utils/commentModerator");
const { translateText, detectLanguage } = require("../utils/translator");
const {
  getClientIP,
  getLocationFromIP,
} = require("../utils/locationDetector");

// ==================== GET COMMENTS ====================
router.get("/:videoId", async (req, res) => {
  try {
    const comments = await Comment.find({
      video: req.params.videoId,
      parentComment: null,
      status: { $in: ["active", "flagged"] }, // Show active + flagged
    })
      .populate("user", "name avatar")
      .sort({ createdAt: -1 })
      .limit(50);

    // Return only necessary data (hide detailed location)
    const sanitized = comments.map((c) => ({
      _id: c._id,
      text: c.text,
      language: c.language,
      user: {
        _id: c.user?._id,
        name: c.user?.name,
        avatar: c.user?.avatar,
      },
      likes: c.likes,
      dislikes: c.dislikes,
      reportCount: c.reportCount,
      isFlagged: c.isFlagged,
      isEdited: c.isEdited,
      showLocation: c.showLocation,
      // Only show country if user opted in (never city)
      location: c.showLocation
        ? { country: c.location?.country || "Unknown" }
        : null,
      createdAt: c.createdAt,
      editedAt: c.editedAt,
    }));

    res.json(sanitized);
  } catch (error) {
    console.error("Get comments error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== POST COMMENT ====================
router.post("/:videoId", protect, async (req, res) => {
  try {
    const { text, showLocation } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Comment text required" });
    }

    if (text.length > 1000) {
      return res.status(400).json({ message: "Comment too long (max 1000 chars)" });
    }

    // ✅ MODERATE the comment
    const moderation = moderateComment(text);
    console.log(`💬 Comment moderation: ${moderation.action} (score: ${moderation.score})`);

    if (moderation.action === "block") {
      return res.status(403).json({
        message: "Your comment was blocked",
        reasons: moderation.reasons,
        blocked: true,
      });
    }

    // ✅ Detect language
    const detectedLang = detectLanguage(text);

    // ✅ Get user location (if they want to show it)
    let location = null;
    if (showLocation) {
      try {
        const ip = getClientIP(req);
        const loc = await getLocationFromIP(ip);
        location = {
          country: loc.country,
          state: loc.state,
          city: loc.city, // Stored but never displayed
        };
      } catch (e) {}
    }

    // Create comment
    const comment = await Comment.create({
      user: req.user._id,
      video: req.params.videoId,
      text: text.trim(),
      language: detectedLang,
      showLocation: !!showLocation,
      location,
      isFlagged: moderation.action === "flag",
      flagReason: moderation.action === "flag" ? moderation.reasons.join(", ") : "",
      autoModerated: moderation.action === "flag",
      moderationScore: moderation.score,
      status: moderation.action === "flag" ? "flagged" : "active",
    });

    const populated = await Comment.findById(comment._id).populate(
      "user",
      "name avatar"
    );

    res.status(201).json({
      _id: populated._id,
      text: populated.text,
      language: populated.language,
      user: {
        _id: populated.user._id,
        name: populated.user.name,
        avatar: populated.user.avatar,
      },
      likes: [],
      dislikes: [],
      reportCount: 0,
      isFlagged: populated.isFlagged,
      showLocation: populated.showLocation,
      location: populated.showLocation
        ? { country: populated.location?.country }
        : null,
      createdAt: populated.createdAt,
      warning: moderation.action === "flag" 
        ? "Your comment was flagged for review but is visible"
        : null,
    });
  } catch (error) {
    console.error("Post comment error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== TRANSLATE COMMENT ====================
router.post("/:commentId/translate", protect, async (req, res) => {
  try {
    const { targetLang } = req.body;

    if (!targetLang) {
      return res.status(400).json({ message: "Target language required" });
    }

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // Same language? Return as is
    if (comment.language === targetLang) {
      return res.json({
        translated: comment.text,
        sourceLang: comment.language,
        targetLang,
        cached: false,
      });
    }

    // ✅ Check cache first
    if (comment.translations?.get(targetLang)) {
      return res.json({
        translated: comment.translations.get(targetLang),
        sourceLang: comment.language,
        targetLang,
        cached: true,
      });
    }

    // Translate
    const result = await translateText(
      comment.text,
      targetLang,
      comment.language
    );

    if (!result.success) {
      return res.status(500).json({
        message: "Translation failed",
        error: result.error,
      });
    }

    // ✅ Cache the translation
    comment.translations.set(targetLang, result.translatedText);
    await comment.save();

    res.json({
      translated: result.translatedText,
      sourceLang: comment.language,
      targetLang,
      cached: false,
    });
  } catch (error) {
    console.error("Translate error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== LIKE ====================
router.put("/:commentId/like", protect, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const userId = req.user._id.toString();
    const alreadyLiked = comment.likes.some((id) => id.toString() === userId);

    if (alreadyLiked) {
      comment.likes = comment.likes.filter((id) => id.toString() !== userId);
    } else {
      comment.likes.push(req.user._id);
      // Remove from dislikes if present
      comment.dislikes = comment.dislikes.filter(
        (id) => id.toString() !== userId
      );
    }

    await comment.save();

    res.json({
      liked: !alreadyLiked,
      likesCount: comment.likes.length,
      dislikesCount: comment.dislikes.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== DISLIKE ====================
router.put("/:commentId/dislike", protect, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const userId = req.user._id.toString();
    const alreadyDisliked = comment.dislikes.some(
      (id) => id.toString() === userId
    );

    if (alreadyDisliked) {
      comment.dislikes = comment.dislikes.filter(
        (id) => id.toString() !== userId
      );
    } else {
      comment.dislikes.push(req.user._id);
      // Remove from likes if present
      comment.likes = comment.likes.filter((id) => id.toString() !== userId);
    }

    await comment.save();

    res.json({
      disliked: !alreadyDisliked,
      likesCount: comment.likes.length,
      dislikesCount: comment.dislikes.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== REPORT COMMENT ====================
router.post("/:commentId/report", protect, async (req, res) => {
  try {
    const { reason, description } = req.body;

    if (!reason) {
      return res.status(400).json({ message: "Report reason required" });
    }

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // Prevent duplicate reports from same user
    const alreadyReported = comment.reports.some(
      (r) => r.user?.toString() === req.user._id.toString()
    );

    if (alreadyReported) {
      return res.status(400).json({
        message: "You already reported this comment",
      });
    }

    // Add report
    comment.reports.push({
      user: req.user._id,
      reason,
      description: description || "",
      reportedAt: new Date(),
    });
    comment.reportCount = comment.reports.length;

    // ✅ Auto-flag if 3+ reports (but DON'T delete!)
    if (comment.reportCount >= 3 && comment.status === "active") {
      comment.status = "under_review";
      comment.isFlagged = true;
      comment.flagReason = "Multiple user reports";
    }

    await comment.save();

    res.json({
      message: "Comment reported. Our team will review it.",
      reportCount: comment.reportCount,
      isUnderReview: comment.status === "under_review",
    });
  } catch (error) {
    console.error("Report error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET REPLIES ====================
router.get("/:commentId/replies", async (req, res) => {
  try {
    const replies = await Comment.find({
      parentComment: req.params.commentId,
      status: { $in: ["active", "flagged"] },
    })
      .populate("user", "name avatar")
      .sort({ createdAt: 1 })
      .limit(20);

    res.json(replies);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== REPLY TO COMMENT ====================
router.post("/:commentId/reply", protect, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Reply text required" });
    }

    const parent = await Comment.findById(req.params.commentId);
    if (!parent) return res.status(404).json({ message: "Parent not found" });

    // Moderate
    const moderation = moderateComment(text);
    if (moderation.action === "block") {
      return res.status(403).json({
        message: "Reply blocked",
        reasons: moderation.reasons,
      });
    }

    const reply = await Comment.create({
      user: req.user._id,
      video: parent.video,
      text: text.trim(),
      language: detectLanguage(text),
      parentComment: parent._id,
      isFlagged: moderation.action === "flag",
      status: moderation.action === "flag" ? "flagged" : "active",
    });

    const populated = await Comment.findById(reply._id).populate(
      "user",
      "name avatar"
    );

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== EDIT COMMENT ====================
router.put("/:commentId", protect, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Text required" });
    }

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Not found" });

    if (comment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Moderate edited text
    const moderation = moderateComment(text);
    if (moderation.action === "block") {
      return res.status(403).json({
        message: "Edited text blocked",
        reasons: moderation.reasons,
      });
    }

    comment.text = text.trim();
    comment.language = detectLanguage(text);
    comment.isEdited = true;
    comment.editedAt = new Date();
    comment.translations = new Map(); // Clear cached translations
    comment.isFlagged = moderation.action === "flag";
    comment.status = moderation.action === "flag" ? "flagged" : "active";

    await comment.save();

    res.json({ message: "Comment updated", comment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== DELETE COMMENT ====================
router.delete("/:commentId", protect, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Not found" });

    if (comment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await Comment.deleteMany({ parentComment: comment._id });
    await comment.deleteOne();

    res.json({ message: "Comment deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;