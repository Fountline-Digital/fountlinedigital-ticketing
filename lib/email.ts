import "server-only";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const from = process.env.EMAIL_FROM ?? "Fountline Digital <login@fountlinedigital.com>";

export async function sendEmail(to: string, subject: string, html: string, opts: { senderName?: string; replyTo?: string } = {}) {
  // A custom sender name keeps the verified address: "Fountline Projects <login@...>"
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  const sender = opts.senderName ? `${opts.senderName.replace(/[<>"]/g, "")} <${address}>` : from;
  const { error } = await resend.emails.send({ from: sender, to, subject, html, ...(opts.replyTo ? { replyTo: opts.replyTo } : {}) });
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

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inviteEmail(opts: { orgName: string; inviterName: string; roleLabel: string; signInUrl: string; usesGoogle: boolean; expiresText: string }) {
  const how = opts.usesGoogle
    ? "Click the button, then choose <b>Continue with Google</b> and sign in with your work account."
    : "Click the button, then enter this email address. We'll email you a sign-in link.";
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
    <h2 style="margin:0 0 16px">You're invited to ${esc(opts.orgName)}</h2>
    <p style="margin:0 0 12px">${esc(opts.inviterName)} invited you to join as <b>${esc(opts.roleLabel)}</b>.</p>
    <p style="margin:0 0 24px">${how} You'll also set up two-factor sign-in with an authenticator app.</p>
    <p style="margin:0 0 24px">
      <a href="${esc(opts.signInUrl)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Accept invite</a>
    </p>
    <p style="margin:0;color:#666;font-size:13px">This invite expires ${esc(opts.expiresText)}. If you weren't expecting it, you can ignore this email.</p>
  </div>`;
}

export function notificationEmail(opts: { orgName: string; title: string; body: string | null; link: string; preferencesLink: string }) {
  const body = opts.body ? esc(opts.body).replace(/\n/g, "<br>") : "";
  return `
  <div style="background:#000;padding:24px 0">
    <div style="font-family:Montserrat,Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#000;color:#fff;border:1px solid #333;border-radius:8px">
      <p style="margin:0 0 20px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#c0c0c0">${esc(opts.orgName)}</p>
      <h2 style="margin:0 0 12px;font-size:18px;color:#fff">${esc(opts.title)}</h2>
      ${body ? `<p style="margin:0 0 24px;color:#ddd;line-height:1.5">${body}</p>` : ""}
      <p style="margin:0 0 24px">
        <a href="${esc(opts.link)}" style="background:#c0c0c0;color:#000;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Open in portal</a>
      </p>
      <p style="margin:0;color:#888;font-size:12px">You're getting this because of your notification settings. <a href="${esc(opts.preferencesLink)}" style="color:#c0c0c0">Change them</a>.</p>
    </div>
  </div>`;
}
