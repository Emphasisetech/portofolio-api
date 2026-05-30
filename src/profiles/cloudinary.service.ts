import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHash } from 'crypto';

interface CloudinaryUploadResponse {
  secure_url?: string;
  public_id?: string;
  error?: { message?: string };
}

@Injectable()
export class CloudinaryService {
  private readonly cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  private readonly apiKey = process.env.CLOUDINARY_API_KEY;
  private readonly apiSecret = process.env.CLOUDINARY_API_SECRET;
  private readonly uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  private readonly folder = process.env.CLOUDINARY_PROFILE_FOLDER || 'portfolio/profile-images';

  async uploadProfileImage(file: Express.Multer.File): Promise<string> {
    if (!file) {
      throw new BadRequestException('Please upload an image file.');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are supported.');
    }
    if (!this.cloudName) {
      throw new InternalServerErrorException('Cloudinary is not configured.');
    }

    const form = new FormData();
    const imageBytes = file.buffer.buffer.slice(
      file.buffer.byteOffset,
      file.buffer.byteOffset + file.buffer.byteLength,
    ) as ArrayBuffer;
    form.append('file', new Blob([imageBytes], { type: file.mimetype }), file.originalname);
    form.append('folder', this.folder);

    if (this.uploadPreset) {
      form.append('upload_preset', this.uploadPreset);
    } else {
      if (!this.apiKey || !this.apiSecret) {
        throw new InternalServerErrorException('Cloudinary credentials are not configured.');
      }
      const timestamp = Math.round(Date.now() / 1000).toString();
      form.append('api_key', this.apiKey);
      form.append('timestamp', timestamp);
      form.append('signature', this.sign({ folder: this.folder, timestamp }));
    }

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      { method: 'POST', body: form },
    );
    const result = (await response.json()) as CloudinaryUploadResponse;

    if (!response.ok || !result.secure_url) {
      throw new InternalServerErrorException(
        result.error?.message || 'Cloudinary image upload failed.',
      );
    }

    return result.secure_url;
  }

  private sign(params: Record<string, string>): string {
    const payload = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');
    return createHash('sha1')
      .update(`${payload}${this.apiSecret}`)
      .digest('hex');
  }
}
