import { PlanFeatures, PlanLimits, SubscriptionPlan } from './plan.types';

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
