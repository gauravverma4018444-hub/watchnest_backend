/*
// config/passport.js
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      // callbackURL example: "http://localhost:5000/api/auth/google/callback"
    },

    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const googleAvatar = profile.photos[0]?.value || "";

        // ── Case 1: User already logged in with Google before
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
          // Update avatar if changed on Google
          if (googleAvatar && user.avatar !== googleAvatar) {
            user.avatar = googleAvatar;
            await user.save();
          }
          return done(null, user);
        }

        // ── Case 2: Email exists (local account) → Link Google
        user = await User.findOne({ email });
        if (user) {
          user.googleId = profile.id;
          user.authProvider = "both"; // has both local + google
          user.isVerified = true;     // Google email is verified
          if (!user.avatar && googleAvatar) {
            user.avatar = googleAvatar;
          }
          await user.save();
          return done(null, user);
        }

        // ── Case 3: Brand new user via Google
        const newUser = await User.create({
          name: profile.displayName,
          // Generate unique username from email prefix
          username: await generateUniqueUsername(
            email.split("@")[0]
          ),
          email,
          googleId: profile.id,
          avatar: googleAvatar,
          authProvider: "google",
          isVerified: true,   // Google already verified email
          password: null,     // no password for Google users
        });

        return done(null, newUser);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Helper: generate unique username
async function generateUniqueUsername(base) {
  // Clean base: remove special chars
  let cleanBase = base.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (cleanBase.length < 3) cleanBase = cleanBase + "user";

  let username = cleanBase;
  let counter = 0;

  while (true) {
    const existing = await User.findOne({ username });
    if (!existing) return username;
    counter++;
    username = `${cleanBase}${counter}`;
  }
}

// Serialize/deserialize for session (minimal - we use JWT)
passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
*/

// config/passport.js
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      // callbackURL example: "http://localhost:5000/api/auth/google/callback"
      passReqToCallback: true,  // ✅ Access req in verify callback
    },

    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const googleAvatar = profile.photos[0]?.value || "";
        const displayName = profile.displayName || email.split("@")[0];

        console.log(`\n🔵 Google OAuth attempt:`);
        console.log(`   Email: ${email}`);
        console.log(`   Google ID: ${profile.id}`);

        // ══════════════════════════════════════════════════════
        //  CASE 1: User already linked with this Google account
        // ══════════════════════════════════════════════════════
        let user = await User.findOne({ googleId: profile.id });

        if (user) {
          console.log(`   ✅ Existing Google user: ${user.email}`);

          // Update avatar if changed on Google side
          if (googleAvatar && user.avatar !== googleAvatar) {
            user.avatar = googleAvatar;
            await user.save();
            console.log(`   📸 Avatar updated`);
          }

          // Update name if changed on Google
          if (displayName && user.name !== displayName) {
            user.name = displayName;
            await user.save();
          }

          return done(null, user);
        }

        // ══════════════════════════════════════════════════════
        //  CASE 2: Email exists (local account) → Link Google
        // ══════════════════════════════════════════════════════
        user = await User.findOne({ email });

        if (user) {
          console.log(`   🔗 Linking Google to existing account: ${email}`);

          user.googleId = profile.id;
          user.authProvider = user.password ? "both" : "google";
          user.isVerified = true; // Google email is always verified

          if (!user.avatar && googleAvatar) {
            user.avatar = googleAvatar;
          }

          await user.save();
          return done(null, user);
        }

        // ══════════════════════════════════════════════════════
        //  CASE 3: Brand new user via Google
        // ══════════════════════════════════════════════════════
        console.log(`   🆕 Creating new Google user: ${email}`);

        const uniqueUsername = await generateUniqueUsername(
          email.split("@")[0]
        );

        const newUser = await User.create({
          name: displayName,
          username: uniqueUsername,
          email,
          googleId: profile.id,
          avatar: googleAvatar,
          authProvider: "google",
          isVerified: true,   // Google already verified email
          password: null,     // no password for Google-only users
        });

        console.log(`   ✅ New user created: ${newUser.username}`);
        return done(null, newUser);

      } catch (error) {
        console.error("❌ Google OAuth error:", error);
        return done(error, null);
      }
    }
  )
);

// ══════════════════════════════════════════════════════════════
//  HELPER: Generate Unique Username
// ══════════════════════════════════════════════════════════════
async function generateUniqueUsername(base) {
  // Clean base: remove special chars, lowercase
  let cleanBase = base.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

  // Ensure minimum length
  if (cleanBase.length < 3) cleanBase = cleanBase + "user";

  // Try base first, then append counter
  let username = cleanBase;
  let counter = 0;
  const maxAttempts = 100;

  while (counter < maxAttempts) {
    const existing = await User.findOne({ username });
    if (!existing) return username;
    counter++;
    username = `${cleanBase}${counter}`;
  }

  // Fallback: append random string
  username = `${cleanBase}${Date.now().toString(36)}`;
  return username;
}

// ══════════════════════════════════════════════════════════════
//  SERIALIZE / DESERIALIZE (minimal — we use JWT)
// ══════════════════════════════════════════════════════════════
passport.serializeUser((user, done) => done(null, user._id));

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;