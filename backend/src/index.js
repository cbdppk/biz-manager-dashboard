require('dotenv').config();

// ── Crash guards — must be registered before any async work ───────
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
  process.exit(1);
});

// ── Required env var validation ────────────────────────────────────
const REQUIRED_ENV = [
  'SUPABASE_URL',
  'JWT_SECRET',
  'FRONTEND_URL',
];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_KEY) {
  missingEnv.push('SUPABASE_SECRET_KEY');
}
if (missingEnv.length > 0) {
  console.error('[startup] Missing required env vars:', missingEnv.join(', '));
  process.exit(1);
}

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { raw } = require('express');
const Sentry = require('./config/sentry');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const salesRoutes = require('./routes/sales');
const customerRoutes = require('./routes/customers');
const invoiceRoutes = require('./routes/invoices');
const aiRoutes = require('./routes/ai');
const paymentRoutes = require('./routes/payments');
const whatsappRoutes = require('./routes/whatsapp');
const billingRoutes = require('./routes/billing');
const settingsRoutes = require('./routes/settings');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const recipeRoutes = require('./routes/recipes');
const foodReportRoutes = require('./routes/foodReports');
const expenseRoutes = require('./routes/expenses');
const supportRoutes = require('./routes/support');
const auditRoutes = require('./routes/audit');

const CORS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const CORS_ALLOWED_HEADERS = ['Content-Type', 'Authorization'];
const PRODUCTION_ORIGINS = [
  'https://bizmanager-dashboard.vercel.app',
];

function normalizeOrigin(value) {
  if (!value) return null;

  const raw = value.startsWith('http') ? value : `https://${value}`;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function configuredOrigins() {
  return [
    ...PRODUCTION_ORIGINS,
    ...(process.env.FRONTEND_URL || '').split(','),
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ].map((origin) => normalizeOrigin(origin?.trim())).filter(Boolean);
}

function isAllowedCorsOrigin(req, origin) {
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;

  const allowed = configuredOrigins();
  const isConfiguredOrigin = allowed.includes(normalizedOrigin);
  const isLocalOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin);
  const isPreview = process.env.VERCEL_ENV === 'preview' && /\.vercel\.app$/.test(new URL(normalizedOrigin).host);
  const requestHost = req.get('x-forwarded-host') || req.get('host');
  const isSameHost = requestHost && new URL(normalizedOrigin).host === requestHost;

  return isConfiguredOrigin || isLocalOrigin || isPreview || isSameHost;
}

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  const skipRateLimits = process.env.DISABLE_RATE_LIMITS === '1';

  // ── Security middleware ────────────────────────────────────────
  app.use(helmet());
  app.use(cors((req, callback) => {
    callback(null, {
      origin: (origin, originCallback) => {
        if (isAllowedCorsOrigin(req, origin)) return originCallback(null, true);
        return originCallback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: CORS_METHODS,
      allowedHeaders: CORS_ALLOWED_HEADERS,
    });
  }));

  // ── Rate limiting ──────────────────────────────────────────────
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => skipRateLimits,
    message: { error: 'Too many requests, please try again later.' }
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skip: () => skipRateLimits,
    message: { error: 'Too many auth attempts.' }
  });

  const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    skip: () => skipRateLimits,
    message: { error: 'Too many signup attempts. Please wait a few minutes and try again.' }
  });

  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    skip: () => skipRateLimits,
    message: { error: 'AI rate limit reached.' }
  });

  const whatsappWebhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => skipRateLimits,
    keyGenerator: (req) => {
      const sender = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
      return sender || req.ip;
    },
    message: { error: 'Too many WhatsApp webhook requests.' }
  });

  app.use(limiter);

  // ── Paystack webhook — must be registered before express.json() ─
  app.post('/api/billing/webhook', raw({ type: 'application/json' }), billingRoutes.paystackWebhook);

  app.use(express.json({
    limit: '10kb',
    verify: (req, _res, buf) => {
      if (req.originalUrl?.startsWith('/api/whatsapp/webhook')) {
        req.rawBody = Buffer.from(buf);
      }
    },
  }));
  app.use(express.urlencoded({ extended: false }));

  // ── Routes ─────────────────────────────────────────────────────
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/refresh', authLimiter);
  app.use('/api/auth/register', registerLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/sales', salesRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/ai', aiLimiter, aiRoutes);
  app.use('/api/payments', paymentRoutes);
  app.post('/api/whatsapp/webhook', whatsappWebhookLimiter);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api/billing', billingRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/menu', menuRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/recipes', recipeRoutes);
  app.use('/api/reports', foodReportRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/support', supportRoutes);
  app.use('/api/audit-logs', auditRoutes);

  // ── Health check ───────────────────────────────────────────────
  app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

  // ── Global error handler ───────────────────────────────────────
  app.use((err, req, res, next) => {
    console.error(err.stack);
    Sentry.captureException(err);
    const status = err.status || 500;
    res.status(status).json({
      error: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message
    });
  });

  return app;
}

const app = createApp();

function startServer(port = process.env.PORT || 4000) {
  require('./ai/embedWorker');
  return app.listen(port, () => console.log(`BizManager API running on port ${port}`));
}

if (require.main === module) {
  startServer();
}

// Default export = Express app (required by Vercel's experimentalServices)
module.exports = app;
module.exports.app = app;
module.exports.createApp = createApp;
module.exports.startServer = startServer;
