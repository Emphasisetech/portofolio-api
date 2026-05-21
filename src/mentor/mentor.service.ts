import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
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
  private openai: OpenAI | null = null;

  constructor(
    @InjectModel(ChatSession.name)
    private chatModel: Model<ChatSession>,
    private profilesService: ProfilesService,
    private configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  private ensureOpenAI(): OpenAI {
    if (!this.openai) {
      throw new ServiceUnavailableException(
        'OpenAI is not configured. Add OPENAI_API_KEY to your API .env file.',
      );
    }
    return this.openai;
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

  private buildOpenAIMessages(
    systemPrompt: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    userMessage: string,
  ) {
    return [
      { role: 'system' as const, content: systemPrompt },
      ...history.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];
  }

  async streamMessage(
    chatId: string,
    userId: string,
    userMessage: string,
    res: Response,
  ) {
    const chat = await this.getChat(chatId, userId);
    const openai = this.ensureOpenAI();
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

    if (chat.title === 'New Chat' && chat.messages.filter((m) => m.role === 'user').length === 1) {
      chat.title = deriveChatTitle(userMessage);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const model =
      this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    let fullAssistant = '';

    try {
      const stream = await openai.chat.completions.create({
        model,
        messages: this.buildOpenAIMessages(systemPrompt, history, userMessage),
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullAssistant += delta;
          res.write(`data: ${JSON.stringify({ type: 'token', content: delta })}\n\n`);
        }
      }

      chat.messages.push({
        role: 'assistant',
        content: fullAssistant,
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
      const msg =
        err?.message || 'Failed to generate AI response';
      res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
      res.end();
    }
  }

  async sendMessage(chatId: string, userId: string, userMessage: string) {
    const chat = await this.getChat(chatId, userId);
    const openai = this.ensureOpenAI();
    const profileContext = await this.getProfileContext(userId);
    const systemPrompt = buildMentorSystemPrompt(profileContext);

    const history = chat.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const model =
      this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    const completion = await openai.chat.completions.create({
      model,
      messages: this.buildOpenAIMessages(systemPrompt, history, userMessage),
      temperature: 0.7,
      max_tokens: 2048,
    });

    const assistantContent =
      completion.choices[0]?.message?.content?.trim() ||
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
