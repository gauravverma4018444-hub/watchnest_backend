const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");

// PUT /api/theme
router.put("/", protect, async (req, res) => {
  try {
    const { theme } = req.body;

    if (!["light", "dark", "auto"].includes(theme)) {
      return res.status(400).json({ message: "Invalid theme" });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { theme },
      { new: true }
    ).select("-password");

    res.json({ message: "Theme updated", theme: user.theme });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;