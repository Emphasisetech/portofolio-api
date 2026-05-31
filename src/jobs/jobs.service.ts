import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProfilesService } from '../profiles/profiles.service';
import { Job } from './schemas/job.schema';
import { UsersService } from '../users/users.service';

interface ProfileSummary {
  title: string;
  location: string;
  skills: string[];
  experience: string[];
  projects: string[];
}

interface JobMatch {
  job: Record<string, any>;
  matchScore: number;
  matchReasons: string[];
  missingSkills: string[];
}

type ApplicationStatus = 'APPLIED' | 'ACCEPTED' | 'DECLINED' | 'HOLD';

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(Job.name) private jobModel: Model<Job>,
    private profilesService: ProfilesService,
    private usersService: UsersService,
    private configService: ConfigService,
  ) {}

  private getApiKey(): string | null {
    return (
      this.configService.get<string>('GOOGLE_AI_API_KEY') ||
      this.configService.get<string>('GEMINI_API_KEY') ||
      null
    );
  }

  private getModelName(): string {
    return (
      this.configService.get<string>('GOOGLE_AI_MODEL') ||
      this.configService.get<string>('GEMINI_MODEL') ||
      'gemini-2.5-flash'
    );
  }

  private normalizeText(value: unknown): string {
    return String(value || '').toLowerCase();
  }

  private getJobText(job: Record<string, any>): string {
    return [
      job.title,
      job.company,
      job.location,
      job.description,
      ...(Array.isArray(job.skills) ? job.skills : []),
      ...(Array.isArray(job.requirements) ? job.requirements : []),
    ]
      .filter(Boolean)
      .join(' ');
  }

  private summarizeProfile(profile: any): ProfileSummary {
    const personalInfo = profile?.personalInfo || {};
    return {
      title: personalInfo.title || profile?.title || '',
      location: personalInfo.location || '',
      skills: (profile?.skills || [])
        .map((skill: any) => skill?.name || skill)
        .filter(Boolean),
      experience: (profile?.experience || [])
        .map((item: any) =>
          [item?.position, item?.company, item?.description].filter(Boolean).join(' at '),
        )
        .filter(Boolean),
      projects: (profile?.projects || [])
        .map((item: any) =>
          [item?.title, item?.description, ...(item?.techStack || [])]
            .filter(Boolean)
            .join(' '),
        )
        .filter(Boolean),
    };
  }

  private async getProfileSummary(userId: string): Promise<ProfileSummary> {
    const profiles = await this.profilesService.findByUserId(userId);
    const defaultProfile =
      profiles.find((profile: any) => profile.isDefault) || profiles[0];
    return this.summarizeProfile(defaultProfile?.toObject?.() ?? defaultProfile);
  }

  async getActiveJobs(): Promise<Record<string, any>[]> {
    return this.jobModel
      .find({
        $and: [
          { active: { $ne: false } },
          { isActive: { $ne: false } },
          { status: { $nin: ['inactive', 'closed', 'archived', 'draft'] } },
        ],
      })
      .sort({ postedAt: -1, createdAt: -1 })
      .limit(50)
      .lean()
      .exec();
  }

  private ensureCompany(role?: string) {
    if (role !== 'COMPANY' && role !== 'ADMIN') {
      throw new ForbiddenException('Company account required');
    }
  }

  private ensureUser(role?: string) {
    if (role === 'COMPANY') {
      throw new ForbiddenException('Use a user account to apply for jobs');
    }
  }

  private normalizeList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    return String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private cleanJobInput(data: Record<string, any>) {
    return {
      title: String(data.title || '').trim(),
      company: String(data.company || '').trim(),
      location: String(data.location || '').trim(),
      employmentType: String(data.employmentType || '').trim(),
      workplaceType: String(data.workplaceType || '').trim(),
      experienceLevel: String(data.experienceLevel || '').trim(),
      salaryRange: String(data.salaryRange || '').trim(),
      description: String(data.description || '').trim(),
      requirements: this.normalizeList(data.requirements),
      skills: this.normalizeList(data.skills),
      applyUrl: String(data.applyUrl || '').trim(),
      active: data.active ?? true,
      isActive: data.isActive ?? true,
      status: data.status || 'active',
    };
  }

  async createCompanyJob(userId: string, role: string | undefined, data: Record<string, any>) {
    this.ensureCompany(role);
    const user = await this.usersService.findById(userId);
    const jobData = this.cleanJobInput(data);
    if (!jobData.title || !jobData.description) {
      throw new BadRequestException('Job title and description are required');
    }

    const job = new this.jobModel({
      ...jobData,
      companyUserId: new Types.ObjectId(userId),
      company: jobData.company || user?.companyName || user?.username || 'Company',
      source: 'Company',
      postedAt: new Date(),
      applications: [],
    });
    return job.save();
  }

  async getCompanyJobs(userId: string, role: string | undefined) {
    this.ensureCompany(role);
    return this.jobModel
      .find({ companyUserId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async updateCompanyJob(
    userId: string,
    role: string | undefined,
    jobId: string,
    data: Record<string, any>,
  ) {
    this.ensureCompany(role);
    if (!Types.ObjectId.isValid(jobId)) {
      throw new NotFoundException('Job not found');
    }
    const jobData = this.cleanJobInput(data);
    const updated = await this.jobModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(jobId), companyUserId: new Types.ObjectId(userId) },
        { $set: jobData },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Job not found');
    return updated;
  }

  private async buildCandidateSnapshot(userId: string) {
    const [user, profiles] = await Promise.all([
      this.usersService.findById(userId),
      this.profilesService.findByUserId(userId),
    ]);
    const profile = profiles.find((item: any) => item.isDefault) || profiles[0];
    const rawProfile = profile?.toObject?.() ?? profile ?? {};
    const personalInfo = rawProfile.personalInfo || {};
    return {
      userId,
      username: user?.username || '',
      email: user?.email || '',
      fullName: personalInfo.fullName || user?.username || '',
      title: personalInfo.title || rawProfile.title || '',
      location: personalInfo.location || '',
      contactEmail: personalInfo.contactEmail || user?.email || '',
      skills: (rawProfile.skills || []).map((skill: any) => skill?.name || skill).filter(Boolean),
      experience: (rawProfile.experience || []).slice(0, 3),
      projects: (rawProfile.projects || []).slice(0, 3),
      profileSlug: rawProfile.publicSlug || '',
    };
  }

  async applyToJob(userId: string, role: string | undefined, jobId: string, coverNote = '') {
    this.ensureUser(role);
    if (!Types.ObjectId.isValid(jobId)) {
      throw new NotFoundException('Job not found');
    }
    const job = await this.jobModel.findById(jobId).exec();
    if (!job || job.active === false || job.isActive === false || job.status === 'closed') {
      throw new NotFoundException('Job not found');
    }
    const applications = (job.applications || []) as any[];
    const existing = applications.find((application) => String(application.userId) === userId);
    if (existing) {
      throw new BadRequestException('You already applied to this job');
    }

    applications.push({
      userId: new Types.ObjectId(userId),
      status: 'APPLIED',
      coverNote: coverNote.trim(),
      candidateSnapshot: await this.buildCandidateSnapshot(userId),
    });
    job.applications = applications as any;
    await job.save();
    return applications[applications.length - 1];
  }

  async getMyApplications(userId: string) {
    const jobs = await this.jobModel
      .find({ 'applications.userId': new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    return jobs.flatMap((job: any) =>
      (job.applications || [])
        .filter((application: any) => String(application.userId) === userId)
        .map((application: any) => ({
          ...application,
          job: {
            _id: job._id,
            title: job.title,
            company: job.company,
            location: job.location,
            employmentType: job.employmentType,
            workplaceType: job.workplaceType,
          },
        })),
    );
  }

  async getCompanyApplications(userId: string, role: string | undefined, jobId: string) {
    this.ensureCompany(role);
    const job = await this.jobModel
      .findOne({ _id: new Types.ObjectId(jobId), companyUserId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    if (!job) throw new NotFoundException('Job not found');
    return {
      job: {
        _id: job._id,
        title: job.title,
        company: job.company,
        location: job.location,
      },
      applications: job.applications || [],
    };
  }

  async updateApplicationStatus(
    userId: string,
    role: string | undefined,
    jobId: string,
    applicationId: string,
    status: ApplicationStatus,
  ) {
    this.ensureCompany(role);
    if (!['ACCEPTED', 'DECLINED', 'HOLD', 'APPLIED'].includes(status)) {
      throw new BadRequestException('Invalid application status');
    }
    const job = await this.jobModel
      .findOne({ _id: new Types.ObjectId(jobId), companyUserId: new Types.ObjectId(userId) })
      .exec();
    if (!job) throw new NotFoundException('Job not found');

    const application = ((job.applications || []) as any[]).find(
      (item) => String(item._id) === applicationId,
    );
    if (!application) throw new NotFoundException('Application not found');
    application.status = status;
    await job.save();
    return application;
  }

  private heuristicMatch(profile: ProfileSummary, jobs: Record<string, any>[]): JobMatch[] {
    const skills = profile.skills.map((skill) => this.normalizeText(skill));
    const titleWords = this.normalizeText(profile.title)
      .split(/\W+/)
      .filter((word) => word.length > 2);

    return jobs
      .map((job) => {
        const jobText = this.normalizeText(this.getJobText(job));
        const matchedSkills = skills.filter((skill) => skill && jobText.includes(skill));
        const titleMatches = titleWords.filter((word) => jobText.includes(word));
        const score = Math.min(
          98,
          Math.round(
            35 +
              matchedSkills.length * 10 +
              titleMatches.length * 6 +
              (profile.location && jobText.includes(this.normalizeText(profile.location))
                ? 8
                : 0),
          ),
        );
        const required = Array.isArray(job.skills)
          ? job.skills
          : Array.isArray(job.requirements)
            ? job.requirements
            : [];
        const missingSkills = required
          .map((skill: unknown) => String(skill))
          .filter((skill) => !skills.includes(this.normalizeText(skill)))
          .slice(0, 5);

        return {
          job,
          matchScore: Math.max(20, score),
          matchReasons:
            matchedSkills.length > 0
              ? [`Matches ${matchedSkills.slice(0, 4).join(', ')}`]
              : ['Relevant to your current profile headline and experience.'],
          missingSkills,
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore);
  }

  private async aiMatch(profile: ProfileSummary, jobs: Record<string, any>[]) {
    const apiKey = this.getApiKey();
    if (!apiKey || jobs.length === 0) return null;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: this.getModelName(),
      generationConfig: { temperature: 0.25, maxOutputTokens: 4096 },
    });
    const compactJobs = jobs.slice(0, 25).map((job) => ({
      id: job._id?.toString?.() || String(job._id),
      title: job.title,
      company: job.company,
      location: job.location,
      skills: job.skills,
      requirements: job.requirements,
      description: String(job.description || '').slice(0, 700),
    }));
    const prompt = `Match this candidate profile to active jobs. Return JSON only with:
{"matches":[{"id":"job id","matchScore":0-100,"matchReasons":["short reason"],"missingSkills":["skill"]}],"externalSearches":[{"title":"search title","source":"site name","url":"https://...","why":"short reason"}]}

Candidate:
${JSON.stringify(profile)}

Active jobs:
${JSON.stringify(compactJobs)}`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim().replace(/^```json|```$/g, '').trim();
    return JSON.parse(text) as {
      matches?: Array<{
        id: string;
        matchScore: number;
        matchReasons?: string[];
        missingSkills?: string[];
      }>;
      externalSearches?: Array<{
        title: string;
        source: string;
        url: string;
        why: string;
      }>;
    };
  }

  private buildExternalSearches(profile: ProfileSummary) {
    const query = encodeURIComponent(
      [profile.title || 'developer', profile.skills.slice(0, 3).join(' '), profile.location]
        .filter(Boolean)
        .join(' '),
    );
    return [
      {
        title: 'LinkedIn jobs matching your profile',
        source: 'LinkedIn',
        url: `https://www.linkedin.com/jobs/search/?keywords=${query}`,
        why: 'Uses your headline, top skills, and location as search signals.',
      },
      {
        title: 'Indeed jobs matching your profile',
        source: 'Indeed',
        url: `https://www.indeed.com/jobs?q=${query}`,
        why: 'Broad job board search based on your strongest profile keywords.',
      },
      {
        title: 'Wellfound startup roles',
        source: 'Wellfound',
        url: `https://wellfound.com/jobs?query=${query}`,
        why: 'Good source for startup and product-focused roles.',
      },
    ];
  }

  async getMatches(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new ServiceUnavailableException('Invalid user session');
    }
    const [profile, activeJobs] = await Promise.all([
      this.getProfileSummary(userId),
      this.getActiveJobs(),
    ]);

    let matches = this.heuristicMatch(profile, activeJobs);
    let externalSearches = this.buildExternalSearches(profile);
    let aiAvailable = false;

    try {
      const ai = await this.aiMatch(profile, activeJobs);
      if (ai?.matches) {
        const byId = new Map(activeJobs.map((job) => [String(job._id), job]));
        matches = ai.matches
          .map((match) => {
            const job = byId.get(String(match.id));
            if (!job) return null;
            return {
              job,
              matchScore: Number(match.matchScore) || 0,
              matchReasons: match.matchReasons || [],
              missingSkills: match.missingSkills || [],
            };
          })
          .filter((match): match is JobMatch => Boolean(match))
          .sort((a, b) => b.matchScore - a.matchScore);
        aiAvailable = true;
      }
      if (ai?.externalSearches?.length) {
        externalSearches = ai.externalSearches.slice(0, 6);
      }
    } catch {
      aiAvailable = false;
    }

    return {
      profile,
      aiAvailable,
      activeJobsCount: activeJobs.length,
      matches,
      externalSearches,
    };
  }
}
