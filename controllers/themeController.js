const User = require("../models/User");

// @desc Update theme preference
const updateTheme = async (req, res) => {
  try {
    const { theme } = req.body;

    if (!["light", "dark", "auto"].includes(theme)) {
      return res.status(400).json({ message: "Invalid theme option" });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { theme },
      { new: true }
    ).select("theme");

    res.status(200).json({ message: "Theme updated", theme: user.theme });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc Get theme preference
const getTheme = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("theme");
    res.status(200).json({ theme: user.theme });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { updateTheme, getTheme };