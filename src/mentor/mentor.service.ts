import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  type Content,
} from '@google/generative-ai';
import { Response } from 'express';
import { ChatSession } from './schemas/chat.schema';
import { ProfilesService } from '../profiles/profiles.service';
import {
  buildMentorSystemPrompt,
  deriveChatTitle,
  summarizeProfileForContext,
} from './mentor.context';

@Injectable()
export class MentorService {
  constructor(
    @InjectModel(ChatSession.name)
    private chatModel: Model<ChatSession>,
    private profilesService: ProfilesService,
    private configService: ConfigService,
  ) {}

  private getApiKey(): string {
    const apiKey =
      this.configService.get<string>('GOOGLE_AI_API_KEY') ||
      this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Google AI is not configured. Add GOOGLE_AI_API_KEY from Google AI Studio to your API .env file.',
      );
    }
    return apiKey;
  }

  /** Maps retired model IDs to current Google AI Studio names. */
  private static readonly MODEL_ALIASES: Record<string, string> = {
    'gemini-1.5-flash': 'gemini-2.5-flash',
    'gemini-1.5-flash-latest': 'gemini-2.5-flash',
    'gemini-1.5-flash-8b': 'gemini-2.5-flash',
    'gemini-1.5-pro': 'gemini-2.5-flash',
    'gemini-1.5-pro-latest': 'gemini-2.5-flash',
    'gemini-pro': 'gemini-2.5-flash',
    'gemini-2.0-flash': 'gemini-2.5-flash',
    'gemini-2.0-flash-lite': 'gemini-2.5-flash',
  };

  private getModelName(): string {
    const configured =
      this.configService.get<string>('GOOGLE_AI_MODEL') ||
      this.configService.get<string>('GEMINI_MODEL') ||
      'gemini-2.5-flash';
    return MentorService.MODEL_ALIASES[configured] || configured;
  }

  private createGenerativeModel(systemPrompt: string) {
    const genAI = new GoogleGenerativeAI(this.getApiKey());
    return genAI.getGenerativeModel({
      model: this.getModelName(),
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });
  }

  private buildGeminiHistory(
    history: { role: 'user' | 'assistant'; content: string }[],
  ): Content[] {
    return history.slice(-20).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  }

  private async getProfileContext(userId: string): Promise<string> {
    const profiles = await this.profilesService.findByUserId(userId);
    const initialData = await this.profilesService.getInitialData(userId);
    return summarizeProfileForContext(
      profiles.map((p) => p.toObject?.() ?? p),
      initialData,
    );
  }

  async listChats(userId: string) {
    return this.chatModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .select('_id title messages createdAt updatedAt')
      .lean()
      .exec();
  }

  async createChat(userId: string) {
    const chat = new this.chatModel({
      userId: new Types.ObjectId(userId),
      title: 'New Chat',
      messages: [],
    });
    return chat.save();
  }

  async getChat(chatId: string, userId: string) {
    const chat = await this.chatModel.findOne({
      _id: new Types.ObjectId(chatId),
      userId: new Types.ObjectId(userId),
    });
    if (!chat) throw new NotFoundException('Chat not found');
    return chat;
  }

  async deleteChat(chatId: string, userId: string) {
    const result = await this.chatModel.deleteOne({
      _id: new Types.ObjectId(chatId),
      userId: new Types.ObjectId(userId),
    });
    if (result.deletedCount === 0) throw new NotFoundException('Chat not found');
    return { success: true };
  }

  async streamMessage(
    chatId: string,
    userId: string,
    userMessage: string,
    res: Response,
  ) {
    const chat = await this.getChat(chatId, userId);
    const profileContext = await this.getProfileContext(userId);
    const systemPrompt = buildMentorSystemPrompt(profileContext);

    const history = chat.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    chat.messages.push({
      role: 'user',
      content: userMessage,
      createdAt: new Date(),
    });

    if (
      chat.title === 'New Chat' &&
      chat.messages.filter((m) => m.role === 'user').length === 1
    ) {
      chat.title = deriveChatTitle(userMessage);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const model = this.createGenerativeModel(systemPrompt);
    const geminiChat = model.startChat({
      history: this.buildGeminiHistory(history),
    });

    let fullAssistant = '';

    try {
      const result = await geminiChat.sendMessageStream(userMessage);

      for await (const chunk of result.stream) {
        const delta = chunk.text();
        if (delta) {
          fullAssistant += delta;
          res.write(
            `data: ${JSON.stringify({ type: 'token', content: delta })}\n\n`,
          );
        }
      }

      chat.messages.push({
        role: 'assistant',
        content: fullAssistant || 'I could not generate a response.',
        createdAt: new Date(),
      });
      await chat.save();

      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          chatId: chat._id,
          title: chat.title,
        })}\n\n`,
      );
      res.end();
    } catch (err: any) {
      const msg = err?.message || 'Failed to generate AI response';
      res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
      res.end();
    }
  }

  async sendMessage(chatId: string, userId: string, userMessage: string) {
    const chat = await this.getChat(chatId, userId);
    const profileContext = await this.getProfileContext(userId);
    const systemPrompt = buildMentorSystemPrompt(profileContext);

    const history = chat.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const model = this.createGenerativeModel(systemPrompt);
    const geminiChat = model.startChat({
      history: this.buildGeminiHistory(history),
    });

    const result = await geminiChat.sendMessage(userMessage);
    const assistantContent =
      result.response.text()?.trim() ||
      'I could not generate a response. Please try again.';

    chat.messages.push(
      { role: 'user', content: userMessage, createdAt: new Date() },
      { role: 'assistant', content: assistantContent, createdAt: new Date() },
    );

    if (chat.title === 'New Chat') {
      chat.title = deriveChatTitle(userMessage);
    }

    await chat.save();
    return chat;
  }
}
