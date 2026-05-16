import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Template } from './schemas/template.schema';

@Injectable()
export class TemplatesService implements OnModuleInit {
  constructor(@InjectModel(Template.name) private templateModel: Model<Template>) {}

  async onModuleInit() {
    const count = await this.templateModel.countDocuments();
    if (count === 0) {
      await this.seedTemplates();
    }
  }

  async seedTemplates() {
    const templates = [
      { name: 'Minimal Developer', previewImage: '/templates/minimal.png', configSchema: {} },
      { name: 'Creative Designer', previewImage: '/templates/creative.png', configSchema: {} },
      { name: 'Dark Mode Hacker', previewImage: '/templates/hacker.png', configSchema: {} },
      { name: 'Startup Founder', previewImage: '/templates/startup.png', configSchema: {} },
      { name: 'Timeline Portfolio', previewImage: '/templates/timeline.png', configSchema: {} },
    ];
    await this.templateModel.insertMany(templates);
  }

  async findAll() {
    return this.templateModel.find({ isActive: true }).exec();
  }
}
