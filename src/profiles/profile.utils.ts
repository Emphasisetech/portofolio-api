export const WEBSITE_TEMPLATE_IDS = [
  'modern',
  'web-midnight',
  'web-light',
  'web-cyber',
  'web-cosmic',
  'web-sky',
];

export type ProfileKind = 'website' | 'resume';

export function getProfileKind(templateId?: string): ProfileKind {
  if (templateId && WEBSITE_TEMPLATE_IDS.includes(templateId)) {
    return 'website';
  }
  return 'resume';
}

export const DEFAULT_SECTIONS = [
  { id: 'header', type: 'header', content: {} },
  { id: 'about', type: 'about', content: {} },
  { id: 'skills', type: 'skills', content: {} },
  { id: 'projects', type: 'projects', content: {} },
  { id: 'experience', type: 'experience', content: {} },
  { id: 'education', type: 'education', content: {} },
  { id: 'contact', type: 'contact', content: {} },
];

export function slugifyTitle(title: string): string {
  return (title || 'resume')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'resume';
}

export function buildPublicSlug(username: string, title: string): string {
  return `${slugifyTitle(username)}-${slugifyTitle(title)}`;
}

export function deepCloneLayout(layout: any) {
  if (!layout?.length) {
    return JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
  }
  return JSON.parse(JSON.stringify(layout));
}

export function extractProfileContent(profile: any) {
  return {
    personalInfo: JSON.parse(JSON.stringify(profile.personalInfo || {})),
    experience: JSON.parse(JSON.stringify(profile.experience || [])),
    education: JSON.parse(JSON.stringify(profile.education || [])),
    skills: JSON.parse(JSON.stringify(profile.skills || [])),
    projects: JSON.parse(JSON.stringify(profile.projects || [])),
    templateId: profile.templateId || 'resume-1',
    layout: deepCloneLayout(profile.layout),
    profileKind: profile.profileKind || getProfileKind(profile.templateId),
  };
}
