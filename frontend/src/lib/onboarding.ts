export const ONBOARDING_DISMISS_KEY = 'bm_onboarding_dismissed';

export type OnboardingStepId =
  | 'profile'
  | 'products'
  | 'customer'
  | 'staff'
  | 'sale'
  | 'orders'
  | 'report'
  | 'install'
  | 'channels';

export type OnboardingGroup = 'required' | 'recommended' | 'optional';

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  href: string;
  group: OnboardingGroup;
  optional?: boolean;
  done: boolean;
  ctaLabel?: string;
}

export interface OnboardingSnapshot {
  businessName?: string;
  sector?: string | null;
  operatingMode?: 'retail' | 'food';
  hasProfile: boolean;
  productCount: number;
  customerCount: number;
  staffCount: number;
  saleCount: number;
  dismissed: boolean;
}

export function isOnboardingDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(ONBOARDING_DISMISS_KEY) === '1';
}

export function dismissOnboarding() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ONBOARDING_DISMISS_KEY, '1');
}

export function resetOnboardingDismissal() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ONBOARDING_DISMISS_KEY);
}

export function buildOnboardingSteps(snapshot: OnboardingSnapshot): OnboardingStep[] {
  const hasProfile = snapshot.hasProfile;
  const productDone = snapshot.productCount > 0;
  const customerDone = snapshot.customerCount > 0;
  const staffDone = snapshot.staffCount > 1;
  const saleDone = snapshot.saleCount > 0;
  const isFoodMode = snapshot.operatingMode === 'food' || snapshot.sector === 'restaurant';

  if (isFoodMode) {
    return [
      {
        id: 'profile',
        title: 'Complete business profile',
        description: 'Add your restaurant name and phone so receipts, reports, and staff setup look right.',
        href: '/settings/profile',
        group: 'required',
        done: hasProfile,
        ctaLabel: hasProfile ? 'Review' : 'Complete',
      },
      {
        id: 'products',
        title: 'Add menu items or groceries',
        description: 'Set up the meals, drinks, or kitchen stock you sell before opening Food POS.',
        href: '/menu',
        group: 'required',
        done: productDone,
        ctaLabel: productDone ? 'Review menu' : 'Add menu',
      },
      {
        id: 'sale',
        title: 'Open Food POS',
        description: 'Create your first takeaway, dine-in, or delivery order from the restaurant counter.',
        href: '/food-pos',
        group: 'required',
        done: saleDone,
        ctaLabel: saleDone ? 'Open' : 'Start order',
      },
      {
        id: 'orders',
        title: 'Check kitchen orders',
        description: 'Use the kitchen queue to track pending orders and keep service moving.',
        href: '/orders',
        group: 'required',
        done: saleDone,
        ctaLabel: saleDone ? 'Review' : 'Open queue',
      },
      {
        id: 'report',
        title: 'View your first report',
        description: 'After your first sale, reports show profit, cash, credit, stock, and expenses.',
        href: '/reports',
        group: 'required',
        done: saleDone,
        ctaLabel: saleDone ? 'View report' : 'Open',
      },
      {
        id: 'staff',
        title: 'Invite staff',
        description: 'Give waiters, cashiers, or kitchen staff their own login when you are ready.',
        href: '/settings/staff',
        group: 'recommended',
        optional: true,
        done: staffDone,
        ctaLabel: staffDone ? 'Review' : 'Invite',
      },
      {
        id: 'channels',
        title: 'WhatsApp & SMS later',
        description: 'Connect customer messages and summaries after the core restaurant flow is working.',
        href: '/settings/whatsapp',
        group: 'optional',
        optional: true,
        done: false,
        ctaLabel: 'Open',
      },
      {
        id: 'install',
        title: 'Install on your phone',
        description: 'Add BizManager to your home screen for fast counter access and a full-screen app feel.',
        href: '/onboarding#install',
        group: 'optional',
        optional: true,
        done: false,
        ctaLabel: 'Read steps',
      },
    ];
  }

  return [
    {
      id: 'profile',
      title: 'Complete business profile',
      description: 'Add your shop name and phone so receipts and reports look right.',
      href: '/settings/profile',
      group: 'required',
      done: hasProfile,
      ctaLabel: hasProfile ? 'Review' : 'Complete',
    },
    {
      id: 'products',
      title: 'Add your first product',
      description: 'Load items you sell so POS search and stock tracking work.',
      href: '/products/new',
      group: 'required',
      done: productDone,
      ctaLabel: productDone ? 'Review' : 'Add product',
    },
    {
      id: 'sale',
      title: 'Record first sale',
      description: 'Try one cash sale in POS to confirm your product, stock, and receipt flow.',
      href: '/pos',
      group: 'required',
      done: saleDone,
      ctaLabel: saleDone ? 'Open POS' : 'Record sale',
    },
    {
      id: 'report',
      title: 'View your first report',
      description: 'After your first sale, reports show profit, cash, credit, stock, and expenses.',
      href: '/reports',
      group: 'required',
      done: saleDone,
      ctaLabel: saleDone ? 'View report' : 'Open',
    },
    {
      id: 'customer',
      title: 'Add a customer for credit sales',
      description: 'Useful when customers buy on credit or need invoices and statements.',
      href: '/customers/new',
      group: 'recommended',
      optional: true,
      done: customerDone,
      ctaLabel: customerDone ? 'Review' : 'Add customer',
    },
    {
      id: 'staff',
      title: 'Invite staff',
      description: 'Give a cashier login for the till while you keep reports private.',
      href: '/settings/staff',
      group: 'recommended',
      optional: true,
      done: staffDone,
      ctaLabel: staffDone ? 'Review' : 'Invite',
    },
    {
      id: 'install',
      title: 'Install on your phone',
      description: 'Add BizManager to your home screen for fast counter access and a full-screen app feel.',
      href: '/onboarding#install',
      group: 'optional',
      optional: true,
      done: false,
      ctaLabel: 'Read steps',
    },
    {
      id: 'channels',
      title: 'WhatsApp & SMS later',
      description: 'Connect notifications when you are ready — not required for day one.',
      href: '/settings/whatsapp',
      group: 'optional',
      optional: true,
      done: false,
      ctaLabel: 'Open',
    },
  ];
}

export function onboardingProgress(steps: OnboardingStep[]) {
  const required = steps.filter((s) => s.group === 'required' || (!s.group && !s.optional));
  const recommended = steps.filter((s) => s.group === 'recommended');
  const optional = steps.filter((s) => s.group === 'optional' || (s.optional && s.group !== 'recommended'));
  const requiredDone = required.filter((s) => s.done).length;
  const recommendedDone = recommended.filter((s) => s.done).length;
  const optionalDone = optional.filter((s) => s.done).length;

  return {
    done: requiredDone,
    total: required.length,
    requiredDone,
    requiredTotal: required.length,
    recommendedDone,
    recommendedTotal: recommended.length,
    optionalDone,
    optionalTotal: optional.length,
    complete: required.length > 0 && requiredDone >= required.length,
  };
}

export function shouldShowOnboarding(snapshot: OnboardingSnapshot): boolean {
  if (snapshot.dismissed) return false;
  const steps = buildOnboardingSteps(snapshot);
  return !onboardingProgress(steps).complete;
}
