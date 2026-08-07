const brevo = require("@getbrevo/brevo");

const apiInstance = new brevo.TransactionalEmailsApi();

if (process.env.BREVO_API_KEY) {
  apiInstance.setApiKey(
    brevo.TransactionalEmailsApiApiKeys.apiKey,
    process.env.BREVO_API_KEY
  );

  console.log("✅ Brevo email service initialized");
} else {
  console.warn("⚠️ BREVO_API_KEY not set");
}

module.exports = { apiInstance, brevo };