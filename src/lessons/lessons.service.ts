import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ProfilesService } from '../profiles/profiles.service';

interface MiniLesson {
  id: string;
  title: string;
  description: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  practiceTask: string;
  durationMinutes: number;
  maxDurationSeconds: number;
}

interface TechTrack {
  tech: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  reason: string;
  lessons: MiniLesson[];
}

@Injectable()
export class LessonsService {
  constructor(private profilesService: ProfilesService) {}

  private readonly lessonCatalog: Record<string, { tech: string; lessons: Omit<MiniLesson, 'id'>[] }> = {
    react: {
      tech: 'React',
      lessons: [
        {
          title: 'React in 100 seconds',
          description: 'A quick mental model for components, state, and why React is used.',
          youtubeVideoId: 'Tn6-PIqc4UM',
          youtubeUrl: 'https://www.youtube.com/watch?v=Tn6-PIqc4UM',
          practiceTask: 'Write one sentence explaining components, props, and state.',
          durationMinutes: 2,
          maxDurationSeconds: 120,
        },
        {
          title: 'React hooks in 100 seconds',
          description: 'A compact overview of hooks and how component stateful logic works.',
          youtubeVideoId: 'TNhaISOUy6Q',
          youtubeUrl: 'https://www.youtube.com/watch?v=TNhaISOUy6Q',
          practiceTask: 'List two hooks you use and what each one controls.',
          durationMinutes: 2,
          maxDurationSeconds: 120,
        },
      ],
    },
    javascript: {
      tech: 'JavaScript',
      lessons: [
        {
          title: 'JavaScript in 100 seconds',
          description: 'A fast overview of the language, runtime, and common web use cases.',
          youtubeVideoId: 'DHjqpvDnNGE',
          youtubeUrl: 'https://www.youtube.com/watch?v=DHjqpvDnNGE',
          practiceTask: 'Write a tiny function that formats one profile skill.',
          durationMinutes: 2,
          maxDurationSeconds: 120,
        },
        {
          title: 'Async JavaScript in 100 seconds',
          description: 'A quick explanation of promises, async/await, and API timing.',
          youtubeVideoId: 'PoRJizFvM7s',
          youtubeUrl: 'https://www.youtube.com/watch?v=PoRJizFvM7s',
          practiceTask: 'Describe when you would use async/await in your app.',
          durationMinutes: 2,
          maxDurationSeconds: 120,
        },
      ],
    },
    typescript: {
      tech: 'TypeScript',
      lessons: [
        {
          title: 'TypeScript in 100 seconds',
          description: 'A quick intro to types, interfaces, and safer JavaScript.',
          youtubeVideoId: 'zQnBQ4tB3ZA',
          youtubeUrl: 'https://www.youtube.com/watch?v=zQnBQ4tB3ZA',
          practiceTask: 'Define one interface for a lesson card.',
          durationMinutes: 2,
          maxDurationSeconds: 120,
        },
      ],
    },
    node: {
      tech: 'Node.js',
      lessons: [
        {
          title: 'REST APIs in 100 seconds',
          description: 'A fast Node/Express-friendly overview of API request and response flow.',
          youtubeVideoId: '-MTSQjw5DrM',
          youtubeUrl: 'https://www.youtube.com/watch?v=-MTSQjw5DrM',
          practiceTask: 'Explain one route, one HTTP method, and one response status.',
          durationMinutes: 2,
          maxDurationSeconds: 120,
        },
      ],
    },
    mongodb: {
      tech: 'MongoDB',
      lessons: [
        {
          title: 'MongoDB in 100 seconds',
          description: 'A quick overview of documents, collections, and flexible data modeling.',
          youtubeVideoId: '-bt_y4Loofg',
          youtubeUrl: 'https://www.youtube.com/watch?v=-bt_y4Loofg',
          practiceTask: 'Sketch one document shape for a job posting.',
          durationMinutes: 2,
          maxDurationSeconds: 120,
        },
      ],
    },
    html: {
      tech: 'HTML',
      lessons: [
        {
          title: 'HTML in 100 seconds',
          description: 'A quick pass through tags, semantic structure, and web page basics.',
          youtubeVideoId: 'ok-plXXHlWw',
          youtubeUrl: 'https://www.youtube.com/watch?v=ok-plXXHlWw',
          practiceTask: 'Write semantic markup for a profile header.',
          durationMinutes: 2,
          maxDurationSeconds: 120,
        },
      ],
    },
    css: {
      tech: 'CSS',
      lessons: [
        {
          title: 'CSS in 100 seconds',
          description: 'A short overview of selectors, the cascade, layout, and styling.',
          youtubeVideoId: 'OEV8gMkCHXQ',
          youtubeUrl: 'https://www.youtube.com/watch?v=OEV8gMkCHXQ',
          practiceTask: 'Style one button with hover and focus states.',
          durationMinutes: 2,
          maxDurationSeconds: 120,
        },
      ],
    },
    git: {
      tech: 'Git',
      lessons: [
        {
          title: 'Git in 100 seconds',
          description: 'A quick mental model for commits, branches, and version history.',
          youtubeVideoId: 'hwP7WQkmECE',
          youtubeUrl: 'https://www.youtube.com/watch?v=hwP7WQkmECE',
          practiceTask: 'Write the three Git commands you use most often.',
          durationMinutes: 2,
          maxDurationSeconds: 120,
        },
      ],
    },
  };

  private readonly aliases: Record<string, string> = {
    js: 'javascript',
    'react.js': 'react',
    reactjs: 'react',
    'node.js': 'node',
    nodejs: 'node',
    mongo: 'mongodb',
    'mongo db': 'mongodb',
    ts: 'typescript',
    github: 'git',
  };

  private slug(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private catalogKey(tech: string): string {
    const normalized = tech.toLowerCase().replace(/[^a-z0-9#+. ]+/g, '').trim();
    return this.aliases[normalized] || normalized;
  }

  private normalizeSkill(skill: unknown): string {
    if (typeof skill === 'string') return skill.trim();
    if (skill && typeof skill === 'object' && 'name' in skill) {
      return String((skill as { name?: unknown }).name || '').trim();
    }
    return '';
  }

  private async getProfileTechs(userId: string): Promise<string[]> {
    const profiles = await this.profilesService.findByUserId(userId);
    const profile =
      profiles.find((item: any) => item.isDefault) ||
      profiles.find((item: any) => item.profileKind === 'resume') ||
      profiles[0];
    const data = profile?.toObject?.() ?? profile ?? {};
    const skills = (data.skills || [])
      .map((skill: unknown) => this.normalizeSkill(skill))
      .filter(Boolean);
    const projectTechs = (data.projects || [])
      .flatMap((project: any) => project?.techStack || [])
      .map((skill: unknown) => this.normalizeSkill(skill))
      .filter(Boolean);
    const titleWords = String(data.personalInfo?.title || data.title || '')
      .split(/\W+/)
      .filter((word) => word.length > 2 && /^[a-z0-9#+.]+$/i.test(word));

    return Array.from(new Set([...skills, ...projectTechs, ...titleWords])).slice(0, 10);
  }

  private buildTrack(tech: string, catalogKey = this.catalogKey(tech)): TechTrack | null {
    const catalog = this.lessonCatalog[catalogKey];
    if (!catalog) return null;

    return {
      tech: catalog.tech,
      level: 'Intermediate',
      reason: `Included because ${catalog.tech} appears in your profile skills, projects, or headline.`,
      lessons: catalog.lessons
        .filter((lesson) => lesson.durationMinutes <= 2 && lesson.maxDurationSeconds <= 120)
        .map((lesson, index) => ({
          ...lesson,
          id: `${this.slug(catalog.tech)}-${index + 1}`,
        })),
    };
  }

  async getMiniLessons(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new ServiceUnavailableException('Invalid user session');
    }

    const techs = await this.getProfileTechs(userId);
    const profileTracks = techs
      .map((tech) => this.buildTrack(tech))
      .filter((track): track is TechTrack => Boolean(track));
    const fallbackTracks = ['react', 'typescript', 'node', 'mongodb']
      .map((tech) => this.buildTrack(tech, tech))
      .filter((track): track is TechTrack => Boolean(track));
    const tracks = profileTracks.length ? profileTracks : fallbackTracks;

    return {
      tracks,
      generatedFromProfile: profileTracks.length > 0,
    };
  }
}
