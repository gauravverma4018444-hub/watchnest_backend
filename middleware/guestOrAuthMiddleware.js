const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Accepts either JWT auth token OR guest token
module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const guestToken = req.headers['x-guest-token'];

    // Try JWT first
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this');
        const user = await User.findById(decoded.userId).select('-password');
        if (user) {
          req.user = user;
          req.userId = user._id;
          req.isGuest = false;
          return next();
        }
      } catch (e) { /* fall through to guest */ }
    }

    // Try guest token
    if (guestToken) {
      try {
        const decoded = JSON.parse(Buffer.from(guestToken, 'base64').toString());
        req.guest = decoded;
        req.guestId = decoded.guestId;
        req.isGuest = true;
        return next();
      } catch (e) {
        return res.status(401).json({ message: 'Invalid guest token.' });
      }
    }

    return res.status(401).json({ message: 'Authentication required.' });
  } catch (err) {
    res.status(500).json({ message: 'Auth error.' });
  }
};