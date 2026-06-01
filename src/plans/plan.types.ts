export enum SubscriptionPlan {
  FREE = 'FREE',
  CREATOR = 'CREATOR',
  PRO = 'PRO',
}

export interface PlanLimits {
  maxResumes: number | null;
  maxWebsites: number | null;
}

export interface PlanFeatures {
  aiMentor: boolean;
  jobMatches: boolean;
  resumeImport: boolean;
  proTemplates: boolean;
}

export interface PlanUsage {
  resumes: number;
  websites: number;
}

export interface SubscriptionInfo {
  plan: SubscriptionPlan;
  planLabel: string;
  limits: PlanLimits;
  usage: PlanUsage;
  features: PlanFeatures;
}

export interface PlanCatalogItem {
  id?: string;
  code: SubscriptionPlan;
  name: string;
  price: string;
  period: string;
  description: string;
  highlighted: boolean;
  cta: string;
  href: string;
  features: string[];
  limits: PlanLimits;
  featureFlags: PlanFeatures;
  isActive: boolean;
  sortOrder: number;
}
