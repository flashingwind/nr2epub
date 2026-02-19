import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { Readable } from "stream";

export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface SendMailOptions {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer | Readable;
    contentType?: string;
  }>;
}

export class MailSender {
  private transporter: Transporter;

  constructor(config: MailConfig) {
    this.transporter = nodemailer.createTransport(config);
  }

  async send(options: SendMailOptions): Promise<void> {
    await this.transporter.sendMail(options);
  }

  async sendEpub(to: string, title: string, epubStream: Readable, author?: string): Promise<void> {
    const fromAddr = (this.transporter.options as any).auth?.user || "noreply@example.com";
    const filename = author && author.trim() ? `[${sanitizeFilename(author)}]${sanitizeFilename(title)}.epub` : `${sanitizeFilename(title)}.epub`;
    await this.send({
      from: fromAddr,
      to,
      subject: `[EPUB] ${title}`,
      text: `EPUBファイルを添付しました:\n\n${title}`,
      attachments: [
        {
          filename,
          content: epubStream,
          contentType: "application/epub+zip"
        }
      ]
    });
  }
}

function sanitizeFilename(name: string): string {
  // ファイルシステムで許可されていない文字のみ除去（日本語を保持）
  // 除去: \ / : * ? " < > |
  return name.replace(/[\\/:"*?<>|]/g, "").trim().substring(0, 200);
}

export { sanitizeFilename };
