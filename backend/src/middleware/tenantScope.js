const tenantScope = (req, res, next) => {
  if (!req.user?.business_id) return res.status(403).json({ error: 'No business context.' });
  req.businessId = req.user.business_id;
  next();
};
module.exports = tenantScope;
