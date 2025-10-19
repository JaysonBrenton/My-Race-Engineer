/**
 * Filename: src/core/app/services/auth/templates/verificationEmail.ts
 * Purpose: Render the verification email subject, HTML, and text bodies with localisation support.
 * Author: OpenAI ChatGPT (gpt-5-codex)
 * Date: 2025-10-31
 * License: MIT
 */

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });

type SupportedLocale = 'en' | 'es';

const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'es'];

type TemplateInput = {
  recipientName: string;
  verificationUrl: string;
  expiresAt: Date;
  appName: string;
  locale?: string | null;
};

type TemplateOutput = {
  subject: string;
  text: string;
  html: string;
};

type LocaleDictionary = {
  subject: (appName: string) => string;
  greeting: (name: string) => string;
  intro: (appName: string) => string;
  ctaLabel: string;
  expiryNotice: (formattedDate: string) => string;
  footer: string;
  buttonAriaLabel: string;
  fallbackLabel: string;
};

const DICTIONARY: Record<SupportedLocale, LocaleDictionary> = {
  en: {
    subject: (appName) => `Verify your ${appName} account`,
    greeting: (name) => `Hi ${name},`,
    intro: (appName) =>
      `Thanks for creating a ${appName} account. Confirm your email to unlock telemetry dashboards and team tools.`,
    ctaLabel: 'Verify email',
    expiryNotice: (formattedDate) => `This link expires on ${formattedDate}.`,
    footer: 'If you did not create this account you can safely ignore this email.',
    buttonAriaLabel: 'Verify your email address',
    fallbackLabel: "If the button doesn't work, copy and paste this link into your browser:",
  },
  es: {
    subject: (appName) => `Confirma tu cuenta de ${appName}`,
    greeting: (name) => `Hola ${name},`,
    intro: (appName) =>
      `Gracias por crear una cuenta de ${appName}. Confirma tu correo para acceder a los paneles de telemetría y las herramientas del equipo.`,
    ctaLabel: 'Confirmar correo',
    expiryNotice: (formattedDate) => `Este enlace caduca el ${formattedDate}.`,
    footer: 'Si no creaste esta cuenta, puedes ignorar este correo.',
    buttonAriaLabel: 'Confirma tu dirección de correo',
    fallbackLabel: 'Si el botón no funciona, copia y pega este enlace en tu navegador:',
  },
};

const normaliseLocale = (locale: string | null | undefined): SupportedLocale => {
  if (!locale) {
    return 'en';
  }

  const lower = locale.toLowerCase();
  const direct = SUPPORTED_LOCALES.find((entry) => entry === lower);
  if (direct) {
    return direct;
  }

  const base = lower.split('-')[0] as SupportedLocale;
  return SUPPORTED_LOCALES.includes(base) ? base : 'en';
};

const formatExpiry = (locale: SupportedLocale, expiresAt: Date): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(expiresAt);

const buildHtml = (
  locale: SupportedLocale,
  dictionary: LocaleDictionary,
  input: TemplateInput,
  formattedExpiry: string,
): string => {
  const escapedName = escapeHtml(input.recipientName);
  const escapedUrl = escapeHtml(input.verificationUrl);
  const escapedAppName = escapeHtml(input.appName);
  const subject = escapeHtml(dictionary.subject(input.appName));

  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <title>${subject}</title>
    <meta name="color-scheme" content="light" />
    <style>
      body { margin: 0; padding: 0; background-color: #0f172a; font-family: 'Helvetica Neue', Arial, sans-serif; }
      .wrapper { width: 100%; padding: 32px 0; }
      .container { width: min(600px, 92%); margin: 0 auto; background-color: #0b1120; border-radius: 18px; border: 1px solid rgba(148, 163, 184, 0.35); overflow: hidden; box-shadow: 0 24px 48px rgba(15, 23, 42, 0.45); }
      .header { padding: 32px 32px 12px; color: #e2e8f0; }
      .brand { margin: 0; font-size: 24px; letter-spacing: -0.02em; }
      .content { padding: 0 32px 32px; color: #e2e8f0; line-height: 1.6; }
      .button { display: inline-block; padding: 14px 28px; margin: 24px 0 16px; border-radius: 999px; background: linear-gradient(135deg, #38bdf8, #6366f1); color: #0f172a; font-weight: 600; text-decoration: none; }
      .footer { padding: 24px 32px 32px; color: rgba(148, 163, 184, 0.9); font-size: 14px; line-height: 1.5; }
      .fallback { word-break: break-all; font-size: 14px; color: rgba(148, 163, 184, 0.9); }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <header class="header">
          <p class="brand">${escapedAppName}</p>
        </header>
        <main class="content">
          <p>${dictionary.greeting(escapedName)}</p>
          <p>${escapeHtml(dictionary.intro(input.appName))}</p>
          <a
            class="button"
            href="${escapedUrl}"
            target="_blank"
            rel="noopener"
            aria-label="${escapeHtml(dictionary.buttonAriaLabel)}"
          >${escapeHtml(dictionary.ctaLabel)}</a>
          <p>${escapeHtml(dictionary.expiryNotice(formattedExpiry))}</p>
          <p class="fallback">
            ${escapeHtml(dictionary.fallbackLabel)}<br />
            <a href="${escapedUrl}" style="color: #38bdf8; text-decoration: none;">${escapedUrl}</a>
          </p>
        </main>
        <footer class="footer">
          <p>${escapeHtml(dictionary.footer)}</p>
        </footer>
      </div>
    </div>
  </body>
</html>`;
};

const buildText = (
  dictionary: LocaleDictionary,
  input: TemplateInput,
  formattedExpiry: string,
): string => {
  const lines = [
    dictionary.greeting(input.recipientName),
    '',
    dictionary.intro(input.appName),
    '',
    `${dictionary.ctaLabel}: ${input.verificationUrl}`,
    '',
    dictionary.expiryNotice(formattedExpiry),
    '',
    dictionary.fallbackLabel,
    input.verificationUrl,
    '',
    dictionary.footer,
  ];

  return lines.join('\n');
};

export const renderVerificationEmail = (input: TemplateInput): TemplateOutput => {
  const locale = normaliseLocale(input.locale);
  const dictionary = DICTIONARY[locale];
  const formattedExpiry = formatExpiry(locale, input.expiresAt);

  const subject = dictionary.subject(input.appName);
  const text = buildText(dictionary, input, formattedExpiry);
  const html = buildHtml(locale, dictionary, input, formattedExpiry);

  return { subject, text, html };
};

export const __private__ = {
  normaliseLocale,
  formatExpiry,
};
