import "server-only";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const from = process.env.EMAIL_FROM ?? "Fountline Digital <login@fountlinedigital.com>";

export async function sendEmail(to: string, subject: string, html: string) {
  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) throw new Error(`Email to ${to} failed: ${error.message}`);
}

export function magicLinkEmail(url: string) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
    <h2 style="margin:0 0 16px">Sign in to Fountline Digital</h2>
    <p style="margin:0 0 24px">Click the button below to sign in. This link expires in 10 minutes and can only be used once.</p>
    <p style="margin:0 0 24px">
      <a href="${url}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Sign in</a>
    </p>
    <p style="margin:0;color:#666;font-size:13px">If you didn't ask to sign in, you can ignore this email.</p>
  </div>`;
}
