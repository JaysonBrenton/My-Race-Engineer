export type MailRecipient = {
  email: string;
  name?: string;
};

export type MailMessage = {
  to: MailRecipient;
  subject: string;
  text: string;
  html?: string;
};

export interface MailerPort {
  send(message: MailMessage): Promise<void>;
}
