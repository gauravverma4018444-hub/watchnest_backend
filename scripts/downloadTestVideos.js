const https = require('https');
const fs = require('fs');
const path = require('path');

const samples = [
  { url: 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4', category: 'entertainment', name: 'bunny.mp4' },
  // Add more sample URLs from Pexels API
];

samples.forEach(({ url, category, name }) => {
  const dir = path.join(__dirname, '../test_videos', category);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = fs.createWriteStream(path.join(dir, name));
  https.get(url, res => res.pipe(file));
});