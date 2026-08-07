const tf = require("@tensorflow/tfjs");
const nsfw = require("nsfwjs");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");

ffmpeg.setFfmpegPath(ffmpegPath);

let nsfwModel = null;

const loadModel = async () => {
  if (!nsfwModel) {
    console.log("⏳ Loading NSFW model (pure JS - may take 10-20s)...");
    // MobileNetV2 works with tfjs (pure JS)
    nsfwModel = await nsfw.load("MobileNetV2");
    console.log("✅ NSFW model loaded");
  }
  return nsfwModel;
};

const THRESHOLDS = {
  porn: 0.6,
  hentai: 0.6,
  sexy: 0.75,
};

// Extract N frames from a video
const extractFrames = (videoPath, outputDir, frameCount = 10) => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    ffmpeg(videoPath)
      .on("end", () => {
        const files = fs
          .readdirSync(outputDir)
          .filter((f) => f.endsWith(".png"))
          .map((f) => path.join(outputDir, f));
        resolve(files);
      })
      .on("error", (err) => reject(err))
      .screenshots({
        count: frameCount,
        folder: outputDir,
        filename: "frame-%i.png",
        size: "224x224", // NSFW model input size
      });
  });
};

// Convert image file → tensor (pure JS way)
const imageToTensor = async (imagePath) => {
  const image = await Jimp.read(imagePath);
  image.resize(224, 224);

  const { width, height, data } = image.bitmap;
  // Jimp gives RGBA; we need RGB
  const numPixels = width * height;
  const values = new Int32Array(numPixels * 3);

  for (let i = 0; i < numPixels; i++) {
    values[i * 3 + 0] = data[i * 4 + 0]; // R
    values[i * 3 + 1] = data[i * 4 + 1]; // G
    values[i * 3 + 2] = data[i * 4 + 2]; // B
  }

  return tf.tensor3d(values, [height, width, 3], "int32");
};

// Classify a single image
const classifyImage = async (imagePath) => {
  const model = await loadModel();
  const tfImage = await imageToTensor(imagePath);
  const predictions = await model.classify(tfImage);
  tfImage.dispose();

  const scores = {};
  predictions.forEach((p) => {
    scores[p.className.toLowerCase()] = p.probability;
  });
  return scores;
};

// Analyze full video
const analyzeVideo = async (videoPath) => {
  const framesDir = path.join(path.dirname(videoPath), `frames_${Date.now()}`);

  try {
    const frames = await extractFrames(videoPath, framesDir, 10);

    const aggregate = { porn: 0, hentai: 0, sexy: 0, neutral: 0, drawing: 0 };
    const maxScores = { porn: 0, hentai: 0, sexy: 0 };

    for (const frame of frames) {
      const scores = await classifyImage(frame);
      for (const key in aggregate) aggregate[key] += scores[key] || 0;
      maxScores.porn = Math.max(maxScores.porn, scores.porn || 0);
      maxScores.hentai = Math.max(maxScores.hentai, scores.hentai || 0);
      maxScores.sexy = Math.max(maxScores.sexy, scores.sexy || 0);
    }

    const count = frames.length || 1;
    for (const key in aggregate) aggregate[key] = aggregate[key] / count;

    const isUnsafe =
      maxScores.porn > THRESHOLDS.porn ||
      maxScores.hentai > THRESHOLDS.hentai ||
      maxScores.sexy > THRESHOLDS.sexy;

    let reason = null;
    if (isUnsafe) {
      if (maxScores.porn > THRESHOLDS.porn)
        reason = "Explicit adult content detected";
      else if (maxScores.hentai > THRESHOLDS.hentai)
        reason = "Explicit animated content detected";
      else if (maxScores.sexy > THRESHOLDS.sexy)
        reason = "Suggestive content detected";
    }

    fs.rmSync(framesDir, { recursive: true, force: true });

    return {
      safe: !isUnsafe,
      scores: aggregate,
      maxScores,
      framesAnalyzed: count,
      reason,
    };
  } catch (error) {
    if (fs.existsSync(framesDir))
      fs.rmSync(framesDir, { recursive: true, force: true });
    throw error;
  }
};

// Analyze single image (for thumbnails)
const analyzeImage = async (imagePath) => {
  const scores = await classifyImage(imagePath);
  const isUnsafe =
    (scores.porn || 0) > THRESHOLDS.porn ||
    (scores.hentai || 0) > THRESHOLDS.hentai ||
    (scores.sexy || 0) > THRESHOLDS.sexy;
  return { safe: !isUnsafe, scores };
};

module.exports = { loadModel, analyzeVideo, analyzeImage, classifyImage };