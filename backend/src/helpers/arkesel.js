const axios = require('axios');
const { buildProviderError } = require('./providerErrors');

async function sendSMS(phone, message) {
  // Normalize phone: strip leading 0, add Ghana code
  const normalized = phone.startsWith('0') ? `233${phone.slice(1)}` : phone;

  try {
    const response = await axios.get('https://sms.arkesel.com/sms/api', {
      params: {
        action: 'send-sms',
        api_key: process.env.ARKESEL_API_KEY,
        to: normalized,
        from: process.env.ARKESEL_SENDER_ID,
        sms: message
      }
    });
    return response.data;
  } catch (err) {
    console.error('SMS error:', err.message);
    throw buildProviderError('Arkesel SMS request failed', err);
  }
}

module.exports = { sendSMS };
