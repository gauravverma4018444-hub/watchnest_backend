const mongoose = require("mongoose");
const Video = require("../models/Video");
require("dotenv").config();

const fixVideos = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to DB");

    // Get all videos
    const videos = await Video.find({});
    console.log(`📊 Total videos: ${videos.length}`);

    let updated = 0;

    for (const video of videos) {
      console.log(`\n🎬 ${video.title}`);
      console.log(`   Current allowedPlans: [${video.allowedPlans?.join(", ") || "none"}]`);

      // ✅ Set to all plans by default (all can access)
      if (!video.allowedPlans || video.allowedPlans.length === 0) {
        video.allowedPlans = ["free", "bronze", "silver", "gold"];
        await video.save();
        console.log(`   ✅ Updated to: [free, bronze, silver, gold]`);
        updated++;
      } else {
        console.log(`   ⏭️  Skipped (already has plans)`);
      }
    }

    console.log(`\n\n✅ Fixed ${updated} videos`);
    console.log(`ℹ️  ${videos.length - updated} videos already had plans`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
};

fixVideos();