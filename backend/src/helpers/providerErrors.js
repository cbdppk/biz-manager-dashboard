function pickProviderMessage(data) {
  if (!data) return null;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
  if (typeof data.error_description === 'string' && data.error_description.trim()) return data.error_description.trim();

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0];
    if (typeof first === 'string' && first.trim()) return first.trim();
    if (typeof first?.message === 'string' && first.message.trim()) return first.message.trim();
  }

  return null;
}

function buildProviderError(label, error, status = 502) {
  const message = pickProviderMessage(error?.response?.data) || error?.message || `${label} request failed.`;
  const wrapped = new Error(`${label}: ${message}`);
  wrapped.code = 'UPSTREAM_PROVIDER';
  wrapped.status = status;
  return wrapped;
}

module.exports = {
  buildProviderError,
  pickProviderMessage,
};
