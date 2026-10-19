import nodemailer from 'nodemailer';
import type { Logger } from '../logger';

/** One plain-text email. */
export interface Mail {
  subject: string;
  text: string;
}

/** Sends email; the app runs without one when no SMTP login is set. */
export interface Mailer {
  send: (mail: Mail & { to: string[] }) => Promise<void>;
}

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  password: string;
}

/** Email through an SMTP server (Gmail with an app password, by default), from its own login. */
export function smtpMailer(settings: SmtpSettings, logger: Logger): Mailer {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    // 465 speaks TLS from the start; other ports upgrade with STARTTLS.
    secure: settings.port === 465,
    auth: { user: settings.user, pass: settings.password },
  });
  return {
    send: async ({ to, subject, text }) => {
      await transport.sendMail({ from: `Logis <${settings.user}>`, to, subject, text });
      logger.info({ to, subject }, 'Sent an email');
    },
  };
}
