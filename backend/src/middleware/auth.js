const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided.' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: user, error } = await supabase
      .from('users')
      .select('id, business_id, role, is_active, token_version')
      .eq('id', decoded.userId)
      .single();
    if (error || !user) return res.status(401).json({ error: 'User not found.' });
    if (!user.is_active) return res.status(403).json({ error: 'Account deactivated.' });

    const tokenVersion = Number(decoded.tokenVersion ?? 0);
    if (tokenVersion !== Number(user.token_version ?? 0)) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired.' });
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions.' });
  next();
};

module.exports = { authenticate, requireRole };
