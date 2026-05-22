export interface ParsedPersonalInfo {
  fullName?: string;
  title?: string;
  bio?: string;
  contactEmail?: string;
  location?: string;
  phone?: string;
  profileImage?: string;
}

export interface ParsedExperience {
  company?: string;
  position?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface ParsedEducation {
  school?: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
}

export interface ParsedSkill {
  name?: string;
  level?: number;
}

export interface ParsedProject {
  title?: string;
  description?: string;
  link?: string;
  githubLink?: string;
  techStack?: string[];
}

export interface ParsedResumeData {
  personalInfo?: ParsedPersonalInfo;
  experience?: ParsedExperience[];
  education?: ParsedEducation[];
  skills?: ParsedSkill[];
  projects?: ParsedProject[];
  suggestedTitle?: string;
}
