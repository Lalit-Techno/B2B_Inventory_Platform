import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailDriver {
  send(msg: MailMessage): Promise<void>;
}

/** Dev driver: logs the mail and saves it as JSON, so invite/reset links are readable. */
export class ConsoleMailDriver implements MailDriver {
  private readonly logger = new Logger('Mail');

  constructor(private readonly dir: string) {}

  async send(msg: MailMessage) {
    this.logger.log(`To: ${msg.to} | ${msg.subject}\n${msg.text}`);
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(
      join(this.dir, `${Date.now()}.json`),
      JSON.stringify(msg, null, 2),
    );
  }
}

export interface SmtpOptions {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/** Deployed driver: any SMTP provider (Resend, Brevo). */
export class SmtpMailDriver implements MailDriver {
  private readonly transport: Transporter;

  constructor(private readonly opts: SmtpOptions) {
    this.transport = createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.port === 465,
      auth: { user: opts.user, pass: opts.pass },
    });
  }

  async send(msg: MailMessage) {
    await this.transport.sendMail({ from: this.opts.from, ...msg });
  }
}

/** Never call inside a DB transaction: emit an event after commit and send from a listener. */
export class MailService {
  constructor(private readonly driver: MailDriver) {}

  send(msg: MailMessage) {
    return this.driver.send(msg);
  }
}
