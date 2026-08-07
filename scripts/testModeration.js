require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const {
  analyzeVideo,
  loadModel,
} = require("../services/contentModerationService");

// Put your test videos in: backend/test_videos/<category>/*.mp4
const TEST_DIR = path.join(__dirname, "../test_videos");

const CATEGORIES = [
  "education",
  "entertainment",
  "sports",
  "music",
  "news",
  "gaming",
  "nature",
  "technology",
  "movies",
  "animation",
];

async function runTests() {
  await loadModel();

  const results = [];
  let total = 0,
    safe = 0,
    unsafe = 0,
    errors = 0;

  console.log("\n============================================");
  console.log("   🎬 CONTENT MODERATION TEST SUITE");
  console.log("============================================\n");

  for (const category of CATEGORIES) {
    const dir = path.join(TEST_DIR, category);
    if (!fs.existsSync(dir)) {
      console.log(`⏭️  Skipping ${category} (folder not found)`);
      continue;
    }

    const videos = fs
      .readdirSync(dir)
      .filter((f) => /\.(mp4|mov|avi|mkv|webm)$/i.test(f));

    console.log(`\n📂 ${category.toUpperCase()} (${videos.length} videos)`);
    console.log("─".repeat(60));

    for (const videoName of videos) {
      total++;
      const videoPath = path.join(dir, videoName);
      try {
        const start = Date.now();
        const result = await analyzeVideo(videoPath);
        const duration = ((Date.now() - start) / 1000).toFixed(2);

        const status = result.safe ? "✅ SAFE  " : "❌ UNSAFE";
        console.log(
          `${status} | ${videoName.padEnd(30)} | ${duration}s | ` +
            `porn:${result.maxScores.porn.toFixed(2)} ` +
            `sexy:${result.maxScores.sexy.toFixed(2)} ` +
            `hentai:${result.maxScores.hentai.toFixed(2)}`
        );

        results.push({
          category,
          video: videoName,
          safe: result.safe,
          maxScores: result.maxScores,
          avgScores: result.scores,
          reason: result.reason,
          durationSec: duration,
        });

        if (result.safe) safe++;
        else unsafe++;
      } catch (err) {
        errors++;
        console.log(`⚠️  ERROR   | ${videoName} | ${err.message}`);
      }
    }
  }

  fs.writeFileSync(
    path.join(__dirname, "test_results.json"),
    JSON.stringify(results, null, 2)
  );

  console.log("\n============================================");
  console.log("             📊 SUMMARY");
  console.log("============================================");
  console.log(`Total tested:  ${total}`);
  console.log(`✅ Safe:        ${safe}`);
  console.log(`❌ Unsafe:      ${unsafe}`);
  console.log(`⚠️  Errors:     ${errors}`);
  console.log(`\nResults saved to: scripts/test_results.json\n`);

  process.exit(0);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});