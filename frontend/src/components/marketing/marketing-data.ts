export const MARKETING_IMAGES = {
  heroPos: '/marketing/hero-pos.jpg',
  heroMarket: '/marketing/hero-market.jpg',
  featureRetail: '/marketing/feature-retail.jpg',
  featureRestaurant: '/marketing/feature-restaurant.jpg',
  featureInventory: '/marketing/feature-inventory.jpg',
  featureAnalytics: '/marketing/feature-analytics.jpg',
  aboutTeam: '/marketing/about-team.jpg',
  aboutOffice: '/marketing/about-office.jpg',
  avatar1: '/marketing/avatar-1.jpg',
  avatar2: '/marketing/avatar-2.jpg',
  avatar3: '/marketing/avatar-3.jpg',
} as const;

export const NAV_LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
] as const;

export const FEATURES = [
  {
    title: 'Mobile Point of Sale',
    desc: 'Ring up sales in seconds. Cash, MoMo, and card-ready workflows built for busy counters.',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.12)',
  },
  {
    title: 'Inventory & Stock',
    desc: 'Track quantities in real time, get low-stock alerts, and know what to reorder before you run out.',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.12)',
  },
  {
    title: 'Invoices & Credit',
    desc: 'Professional invoices, customer balances, and payment history — all in one place.',
    color: '#ec4899',
    bg: 'rgba(236,72,153,0.12)',
  },
  {
    title: 'AI Business Advisor',
    desc: 'Daily insights powered by Claude AI — tailored recommendations for your shop or restaurant.',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.12)',
  },
  {
    title: 'WhatsApp & SMS',
    desc: 'Notify customers, share receipts, and keep staff aligned without leaving the tools they use.',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
  },
  {
    title: 'Reports & Daily Close',
    desc: 'See revenue, top products, and staff performance. Close the day with confidence.',
    color: '#06b6d4',
    bg: 'rgba(6,182,212,0.12)',
  },
] as const;

export const TESTIMONIALS = [
  {
    quote: 'We replaced three notebooks and a calculator. My team finally sees the same stock numbers on every phone.',
    name: 'Ama Osei',
    role: 'Owner, Accra Provisions',
    avatar: MARKETING_IMAGES.avatar2,
  },
  {
    quote: 'MoMo sales sync automatically and invoices go out in minutes. BizManager paid for itself in the first month.',
    name: 'Kwame Mensah',
    role: 'Manager, Mensah Electronics',
    avatar: MARKETING_IMAGES.avatar1,
  },
  {
    quote: 'The kitchen display and menu tools keep orders moving. Offline mode saved us when the network dropped.',
    name: 'Efua Boateng',
    role: 'Operator, Palm Court Kitchen',
    avatar: MARKETING_IMAGES.avatar3,
  },
] as const;

export const PRICING_PLANS = [
  {
    id: 'trial',
    name: 'Free trial',
    price: 'GHS 0',
    period: '14 days',
    featured: false,
    cta: 'Start free trial',
    href: '/register',
    features: [
      'Full POS & inventory',
      'Up to 3 staff accounts',
      'Invoices & customer CRM',
      'Offline sales queue',
    ],
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 'GHS 79',
    period: 'per month',
    featured: true,
    cta: 'Get Basic',
    href: '/register',
    features: [
      'Everything in trial',
      'Unlimited products',
      'Business reports',
      'Email support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'GHS 149',
    period: 'per month',
    featured: false,
    cta: 'Get Pro',
    href: '/register',
    features: [
      'Everything in Basic',
      'AI Business Advisor',
      'WhatsApp integrations',
      'Food POS & kitchen flow',
      'Priority support',
    ],
  },
] as const;
