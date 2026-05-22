import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import mammoth from 'mammoth';
import type { ParsedResumeData } from './resume-import.types';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

const ALLOWED_EXT = /\.(pdf|docx|doc)$/i;

@Injectable()
export class ResumeImportService {
  constructor(private configService: ConfigService) {}

  validateFile(file: Express.Multer.File | undefined): Express.Multer.File {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Please upload a PDF or Word document.');
    }
    const name = file.originalname || '';
    if (!ALLOWED_EXT.test(name) && !ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        'Unsupported file type. Upload a .pdf or .docx resume.',
      );
    }
    if (/\.doc$/i.test(name) && !/docx/i.test(file.mimetype)) {
      throw new BadRequestException(
        'Legacy .doc files are not supported. Please save as .docx or PDF and upload again.',
      );
    }
    return file;
  }

  async extractText(file: Express.Multer.File): Promise<string> {
    const name = (file.originalname || '').toLowerCase();

    if (name.endsWith('.pdf') || file.mimetype === 'application/pdf') {
      return this.extractPdfText(file.buffer);
    }

    if (name.endsWith('.docx') || file.mimetype.includes('wordprocessingml')) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      const text = (result.value || '').trim();
      if (!text || text.length < 30) {
        throw new BadRequestException('Could not read text from this document.');
      }
      return text;
    }

    throw new BadRequestException('Upload a .pdf or .docx file.');
  }

  /** pdf-parse v2 API — v1-style `pdf(buffer)` no longer works. */
  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        const text = (result.text || '').trim();
        if (!text || text.length < 30) {
          throw new BadRequestException(
            'Could not read text from this PDF. Try a text-based PDF (not a scanned image).',
          );
        }
        return text;
      } finally {
        await parser.destroy();
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : 'PDF read failed';
      throw new BadRequestException(`Could not read PDF: ${msg}`);
    }
  }

  private getGeminiModel() {
    const apiKey =
      this.configService.get<string>('GOOGLE_AI_API_KEY') ||
      this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Google AI is not configured. Add GOOGLE_AI_API_KEY to parse uploaded resumes.',
      );
    }
    const configured =
      this.configService.get<string>('GOOGLE_AI_MODEL') ||
      this.configService.get<string>('GEMINI_MODEL') ||
      'gemini-2.5-flash';
    const aliases: Record<string, string> = {
      'gemini-1.5-flash': 'gemini-2.5-flash',
      'gemini-1.5-pro': 'gemini-2.5-flash',
      'gemini-2.0-flash': 'gemini-2.5-flash',
      'gemini-2.0-flash-lite': 'gemini-2.5-flash',
    };
    const model = aliases[configured] || configured;
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    });
  }

  async parseResumeText(rawText: string): Promise<ParsedResumeData> {
    const model = this.getGeminiModel();
    const truncated = rawText.slice(0, 28000);

    const prompt = `You are a resume parser. Extract structured data from the resume text below.
Return ONLY valid JSON matching this schema (use empty arrays/strings when missing):
{
  "personalInfo": {
    "fullName": "string",
    "title": "string (job headline)",
    "bio": "string (summary/objective)",
    "contactEmail": "string",
    "location": "string",
    "phone": "string"
  },
  "experience": [{ "company": "", "position": "", "startDate": "", "endDate": "", "description": "" }],
  "education": [{ "school": "", "degree": "", "fieldOfStudy": "", "startDate": "", "endDate": "" }],
  "skills": [{ "name": "", "level": 80 }],
  "projects": [{ "title": "", "description": "", "link": "", "githubLink": "", "techStack": [] }],
  "suggestedTitle": "short resume name e.g. Software Engineer Resume"
}
Infer reasonable skill levels 50-95. Do not invent employers or degrees not in the text.

RESUME TEXT:
${truncated}`;

    try {
      const result = await model.generateContent(prompt);
      const jsonText = result.response.text()?.trim();
      if (!jsonText) {
        throw new BadRequestException('Could not parse resume content.');
      }

      try {
        const parsed = JSON.parse(jsonText) as ParsedResumeData;
        return this.normalizeParsed(parsed);
      } catch {
        const match = jsonText.match(/\{[\s\S]*\}/);
        if (match) {
          return this.normalizeParsed(JSON.parse(match[0]) as ParsedResumeData);
        }
        throw new BadRequestException(
          'Failed to structure resume data. Try a clearer file.',
        );
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : 'AI parse failed';
      if (/429|quota|rate.?limit|exceeded/i.test(msg)) {
        throw new ServiceUnavailableException(
          'Google AI quota exceeded for this model. Set GOOGLE_AI_MODEL=gemini-2.5-flash in .env or enable billing at https://aistudio.google.com',
        );
      }
      if (/api key|403|401|invalid/i.test(msg)) {
        throw new ServiceUnavailableException(
          'Invalid Google AI API key. Check GOOGLE_AI_API_KEY in portofolio-api/.env',
        );
      }
      if (/404|not found/i.test(msg)) {
        throw new BadRequestException(
          'Gemini model not found. Set GOOGLE_AI_MODEL=gemini-2.5-flash in .env',
        );
      }
      throw new BadRequestException(`Resume parsing failed: ${msg}`);
    }
  }

  private normalizeParsed(data: ParsedResumeData): ParsedResumeData {
    return {
      personalInfo: {
        fullName: data.personalInfo?.fullName || '',
        title: data.personalInfo?.title || '',
        bio: data.personalInfo?.bio || '',
        contactEmail: data.personalInfo?.contactEmail || '',
        location: data.personalInfo?.location || '',
        phone: data.personalInfo?.phone || '',
      },
      experience: (data.experience || []).map((e) => ({
        company: e.company || '',
        position: e.position || '',
        startDate: e.startDate || '',
        endDate: e.endDate || '',
        description: e.description || '',
      })),
      education: (data.education || []).map((e) => ({
        school: e.school || '',
        degree: e.degree || '',
        fieldOfStudy: e.fieldOfStudy || '',
        startDate: e.startDate || '',
        endDate: e.endDate || '',
      })),
      skills: (data.skills || [])
        .filter((s) => s.name?.trim())
        .map((s) => ({
          name: s.name!.trim(),
          level: Math.min(100, Math.max(0, Number(s.level) || 75)),
        })),
      projects: (data.projects || []).map((p) => ({
        title: p.title || '',
        description: p.description || '',
        link: p.link || '',
        githubLink: p.githubLink || '',
        techStack: Array.isArray(p.techStack) ? p.techStack : [],
      })),
      suggestedTitle: data.suggestedTitle?.trim() || 'Imported Resume',
    };
  }
}
