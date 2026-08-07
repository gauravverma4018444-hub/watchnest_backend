const mongoose = require("mongoose");
const User = require("../models/User");
require("dotenv").config();

const fix = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await User.updateMany(
    { plan: { $exists: false } },
    { $set: { plan: "free" } }
  );
  console.log(`✅ Updated ${result.modifiedCount} users`);
  
  const result2 = await mongoose.connection.db.collection("videos").updateMany(
    { allowedPlans: { $exists: false } },
    { $set: { allowedPlans: ["free", "bronze", "silver", "gold"] } }
  );
  console.log(`✅ Updated ${result2.modifiedCount} videos`);
  
  const result3 = await mongoose.connection.db.collection("videos").updateMany(
    { isPublished: { $exists: false } },
    { $set: { isPublished: true } }
  );
  console.log(`✅ Published ${result3.modifiedCount} videos`);
  
  process.exit(0);
};

fix();