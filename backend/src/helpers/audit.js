const supabase = require('../config/supabase');

function compactMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};

  const blocked = new Set(['password', 'password_hash', 'token', 'jwt', 'secret', 'authorization', 'card']);
  return Object.entries(metadata).reduce((acc, [key, value]) => {
    const normalized = key.toLowerCase();
    if ([...blocked].some((blockedKey) => normalized.includes(blockedKey))) return acc;
    if (value === undefined) return acc;
    acc[key] = value;
    return acc;
  }, {});
}

async function logAudit({ businessId, userId, action, entityType, entityId = null, summary = null, metadata = {} }) {
  if (!businessId || !action || !entityType) return { ok: false, skipped: true };

  try {
    const { error } = await supabase.from('audit_logs').insert({
      business_id: businessId,
      user_id: userId || null,
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      summary,
      metadata: compactMetadata(metadata),
    });

    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.warn('[audit] failed to write audit log:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { logAudit, compactMetadata };
