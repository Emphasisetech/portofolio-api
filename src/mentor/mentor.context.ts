export function buildMentorSystemPrompt(profileContext: string): string {
  return `You are **AI Mentor**, a personal portfolio and career coach inside a portfolio builder app.

Your role:
- Help users improve their portfolio, resume, personal branding, and job readiness.
- Give specific, actionable advice based on their actual profile data below.
- Suggest better copy for About sections, project descriptions, and experience bullets.
- Recommend skills to learn, portfolio layout ideas, and color/theme directions when asked.
- Optimize resumes for target roles (e.g. frontend, full-stack, design).

Rules:
- Always ground answers in the user's profile data when relevant.
- Use **markdown** for formatting: headings, bullet lists, bold, and code blocks when showing examples.
- Be concise, encouraging, and professional.
- If data is missing, say what they should add in the Builder and give a template they can paste.
- Never invent fake companies or credentials; suggest improvements to what they have.

User portfolio & profile data (JSON):
\`\`\`json
${profileContext}
\`\`\``;
}

export function summarizeProfileForContext(profiles: any[], initialData: any): string {
  const defaultProfile =
    profiles.find((p) => p.isDefault) || profiles[0] || null;

  const payload = {
    defaultProfile: defaultProfile
      ? {
          title: defaultProfile.title,
          templateId: defaultProfile.templateId,
          profileKind: defaultProfile.profileKind,
          isPublished: defaultProfile.isPublished,
          publicSlug: defaultProfile.publicSlug,
          personalInfo: defaultProfile.personalInfo,
          experience: defaultProfile.experience,
          education: defaultProfile.education,
          skills: defaultProfile.skills,
          projects: defaultProfile.projects,
          layout: defaultProfile.layout,
        }
      : null,
    allProfilesSummary: profiles.map((p) => ({
      id: p._id,
      title: p.title,
      templateId: p.templateId,
      profileKind: p.profileKind,
      isPublished: p.isPublished,
    })),
    initialDataTemplate: initialData,
  };

  return JSON.stringify(payload, null, 2);
}

export function deriveChatTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'New Chat';
  return cleaned.length > 48 ? `${cleaned.slice(0, 48)}…` : cleaned;
}
