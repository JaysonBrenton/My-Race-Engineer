import type { MailerPort, MailMessage, Logger } from '@core/app';

export class ConsoleMailer implements MailerPort {
  constructor(private readonly logger: Logger) {}

  send(message: MailMessage): Promise<void> {
    this.logger.info('Console mailer dispatched message.', {
      event: 'mailer.console.send',
      outcome: 'success',
      to: message.to.email,
      subject: message.subject,
    });

    return Promise.resolve();
  }
}
