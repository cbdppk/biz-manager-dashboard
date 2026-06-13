const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { buildProviderError } = require('./providerErrors');

const SUBSCRIPTION_KEY = process.env.MOMO_SUBSCRIPTION_KEY;
const ENV = process.env.MOMO_ENVIRONMENT || 'sandbox';

function getMoMoBaseUrl() {
  if (ENV === 'production') {
    return process.env.MOMO_BASE_URL_PRODUCTION || process.env.MOMO_BASE_URL;
  }

  return process.env.MOMO_BASE_URL_SANDBOX || process.env.MOMO_BASE_URL;
}

function ensureMoMoConfig() {
  const baseUrl = getMoMoBaseUrl();
  const missing = [];

  if (!baseUrl) missing.push(ENV === 'production' ? 'MOMO_BASE_URL_PRODUCTION or MOMO_BASE_URL' : 'MOMO_BASE_URL_SANDBOX or MOMO_BASE_URL');
  if (!SUBSCRIPTION_KEY) missing.push('MOMO_SUBSCRIPTION_KEY');
  if (!process.env.MOMO_API_USER) missing.push('MOMO_API_USER');
  if (!process.env.MOMO_API_KEY) missing.push('MOMO_API_KEY');

  if (missing.length > 0) {
    const error = new Error(`MoMo is not configured. Missing ${missing.join(', ')}.`);
    error.code = 'MOMO_CONFIG';
    throw error;
  }

  return baseUrl;
}

async function getAccessToken() {
  const baseUrl = ensureMoMoConfig();
  const credentials = Buffer.from(`${process.env.MOMO_API_USER}:${process.env.MOMO_API_KEY}`).toString('base64');
  try {
    const response = await axios.post(`${baseUrl}/collection/token/`, {}, {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY
      }
    });
    return response.data.access_token;
  } catch (error) {
    throw buildProviderError('MoMo token request failed', error);
  }
}

async function initiateMoMoPayment(phone, amount, note) {
  const baseUrl = ensureMoMoConfig();
  const token = await getAccessToken();
  const referenceId = uuidv4();

  try {
    await axios.post(`${baseUrl}/collection/v1_0/requesttopay`, {
      amount: String(amount),
      currency: 'GHS',
      externalId: referenceId,
      payer: { partyIdType: 'MSISDN', partyId: phone },
      payerMessage: note,
      payeeNote: note
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Reference-Id': referenceId,
        'X-Target-Environment': ENV,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    throw buildProviderError('MoMo collection request failed', error);
  }

  return { referenceId };
}

async function checkMoMoStatus(referenceId) {
  const baseUrl = ensureMoMoConfig();
  const token = await getAccessToken();
  try {
    const response = await axios.get(`${baseUrl}/collection/v1_0/requesttopay/${referenceId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Target-Environment': ENV,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY
      }
    });
    return response.data;
  } catch (error) {
    throw buildProviderError('MoMo status request failed', error);
  }
}

module.exports = { initiateMoMoPayment, checkMoMoStatus };
