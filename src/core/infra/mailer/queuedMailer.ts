import { createHash } from 'node:crypto';

import type { Logger, MailerPort, MailMessage } from '@core/app';

type MailDeliveryJob = {
  message: MailMessage;
};

interface MailDeliveryQueue {
  enqueue(job: MailDeliveryJob): Promise<void>;
}

const hashEmail = (email: string): string =>
  createHash('sha256').update(email.toLowerCase()).digest('hex');

class InProcessMailDeliveryQueue implements MailDeliveryQueue {
  constructor(
    private readonly mailer: MailerPort,
    private readonly logger: Logger,
  ) {}

  async enqueue(job: MailDeliveryJob): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        setImmediate(async () => {
          try {
            await this.mailer.send(job.message);
          } catch (error: unknown) {
            const payload =
              error instanceof Error
                ? { name: error.name, message: error.message }
                : { name: 'UnknownMailDeliveryError', message: 'Non-error thrown during mail delivery.' };

            this.logger.error('Queued mail delivery failed.', {
              event: 'mailer.queue.delivery_failed',
              outcome: 'error',
              emailHash: hashEmail(job.message.to.email),
              subject: job.message.subject,
              error: payload,
            });
          }
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
}

class QueueProducingMailer implements MailerPort {
  constructor(
    private readonly queue: MailDeliveryQueue,
    private readonly logger: Logger,
  ) {}

  async send(message: MailMessage): Promise<void> {
    await this.queue.enqueue({ message });

    this.logger.info('Mail enqueued for background delivery.', {
      event: 'mailer.queue.enqueued',
      outcome: 'pending',
      emailHash: hashEmail(message.to.email),
      subject: message.subject,
    });
  }
}

export const createQueuedMailer = (inner: MailerPort, logger: Logger): MailerPort => {
  const workerLogger = logger.withContext({ component: 'mailer-queue-worker' });
  const queue = new InProcessMailDeliveryQueue(inner, workerLogger);
  const producerLogger = logger.withContext({ component: 'mailer-queue-producer' });
  return new QueueProducingMailer(queue, producerLogger);
};
