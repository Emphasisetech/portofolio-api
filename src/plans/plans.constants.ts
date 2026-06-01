import {
  PlanCatalogItem,
  PlanFeatures,
  PlanLimits,
  SubscriptionPlan,
} from './plan.types';

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  [SubscriptionPlan.FREE]: 'Starter',
  [SubscriptionPlan.CREATOR]: 'Creator',
  [SubscriptionPlan.PRO]: 'Pro',
};

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  [SubscriptionPlan.FREE]: { maxResumes: 3, maxWebsites: 1 },
  [SubscriptionPlan.CREATOR]: { maxResumes: 5, maxWebsites: 5 },
  [SubscriptionPlan.PRO]: { maxResumes: null, maxWebsites: null },
};

export const PLAN_FEATURES: Record<SubscriptionPlan, PlanFeatures> = {
  [SubscriptionPlan.FREE]: {
    aiMentor: false,
    jobMatches: false,
    resumeImport: false,
    proTemplates: false,
  },
  [SubscriptionPlan.CREATOR]: {
    aiMentor: true,
    jobMatches: true,
    resumeImport: true,
    proTemplates: false,
  },
  [SubscriptionPlan.PRO]: {
    aiMentor: true,
    jobMatches: true,
    resumeImport: true,
    proTemplates: true,
  },
};

export const DEFAULT_PLAN_CATALOG: PlanCatalogItem[] = [
  {
    code: SubscriptionPlan.FREE,
    name: 'Starter',
    price: '$0',
    period: '/month',
    description: 'Perfect for getting started',
    highlighted: false,
    cta: 'Get Started',
    href: '/register',
    features: [
      'Up to 3 resumes',
      '1 portfolio website',
      'Core templates',
      'PDF & DOCX export',
      'Community support',
    ],
    limits: PLAN_LIMITS[SubscriptionPlan.FREE],
    featureFlags: PLAN_FEATURES[SubscriptionPlan.FREE],
    isActive: true,
    sortOrder: 1,
  },
  {
    code: SubscriptionPlan.CREATOR,
    name: 'Creator',
    price: '$12',
    period: '/month',
    description: 'For serious job seekers & freelancers',
    highlighted: true,
    cta: 'Upgrade to Creator',
    href: '/register?plan=creator',
    features: [
      'Up to 5 resumes',
      'Up to 5 websites',
      'AI Mentor coach',
      'AI job matches',
      'AI resume upload & parse',
      'All standard templates',
      'Priority email support',
    ],
    limits: PLAN_LIMITS[SubscriptionPlan.CREATOR],
    featureFlags: PLAN_FEATURES[SubscriptionPlan.CREATOR],
    isActive: true,
    sortOrder: 2,
  },
  {
    code: SubscriptionPlan.PRO,
    name: 'Pro',
    price: '$24',
    period: '/month',
    description: 'Unlimited power for professionals',
    highlighted: false,
    cta: 'Go Pro',
    href: '/register?plan=pro',
    features: [
      'Unlimited resumes',
      'Unlimited websites',
      'AI Mentor + resume import',
      'AI job matches',
      'Premium modern templates',
      'Pro builder features',
      'Priority support',
    ],
    limits: PLAN_LIMITS[SubscriptionPlan.PRO],
    featureFlags: PLAN_FEATURES[SubscriptionPlan.PRO],
    isActive: true,
    sortOrder: 3,
  },
];

/** Modern resume designs and premium website themes — Pro only. */
export const PRO_TEMPLATE_IDS = new Set([
  'resume-29',
  'resume-30',
  'resume-31',
  'resume-32',
  'resume-33',
  'resume-34',
  'web-midnight',
  'web-cyber',
  'web-cosmic',
  'web-sky',
]);

export function normalizePlan(value?: string): SubscriptionPlan {
  const upper = (value || '').toUpperCase();
  if (upper === SubscriptionPlan.CREATOR) return SubscriptionPlan.CREATOR;
  if (upper === SubscriptionPlan.PRO) return SubscriptionPlan.PRO;
  return SubscriptionPlan.FREE;
}
