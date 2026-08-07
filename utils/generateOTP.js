/*
const crypto = require("crypto");

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

module.exports = generateOTP;
*/

// utils/generateOTP.js

const crypto = require("crypto");

const generateOTP = () => {
  return String(crypto.randomInt(100000, 999999));
};

module.exports = generateOTP;