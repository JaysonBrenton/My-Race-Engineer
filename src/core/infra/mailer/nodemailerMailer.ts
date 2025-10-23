import type { MailerPort, MailMessage, Logger } from '@core/app';
/*
 * Nodemailer exposes `sendMail` with loose typings that rely on `any` under the
 * hood. We wrap the transporter in a Promise-based helper so the rest of the
 * module can stay fully typed.
 */
import { createTransport } from 'nodemailer';
import type SMTPPool from 'nodemailer/lib/smtp-pool';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

const formatRecipient = (message: MailMessage) =>
  message.to.name ? `${message.to.name} <${message.to.email}>` : message.to.email;

export type NodemailerMailerOptions = {
  from: string;
};

type NodemailerSendInfo = SMTPTransport.SentMessageInfo | SMTPPool.SentMessageInfo;

type SafeTransporter = {
  sendMail: (options: SMTPTransport.Options) => Promise<NodemailerSendInfo>;
};

const createSafeTransporter = (connectionUrl: string): SafeTransporter => {
  const transporter = createTransport(connectionUrl);

  return {
    sendMail: (options) =>
      new Promise<NodemailerSendInfo>((resolve, reject) => {
        transporter.sendMail(options, (error: Error | null, info: NodemailerSendInfo) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(info);
        });
      }),
  };
};

export class NodemailerMailer implements MailerPort {
  constructor(
    private readonly transporter: SafeTransporter,
    private readonly options: NodemailerMailerOptions,
    private readonly logger: Logger,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const sendResult = await this.transporter.sendMail({
      from: this.options.from,
      to: formatRecipient(message),
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    void sendResult;

    this.logger.info('Nodemailer message dispatched.', {
      event: 'mailer.smtp.send',
      outcome: 'success',
      to: message.to.email,
      subject: message.subject,
    });
  }
}

export const createNodemailerMailer = (
  connectionUrl: string,
  options: NodemailerMailerOptions,
  logger: Logger,
): NodemailerMailer => {
  const transporter = createSafeTransporter(connectionUrl);
  return new NodemailerMailer(transporter, options, logger);
};
