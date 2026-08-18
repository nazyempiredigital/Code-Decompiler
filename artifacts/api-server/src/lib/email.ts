import nodemailer from "nodemailer";
import { logger } from "./logger.js";

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const FROM_EMAIL = process.env.FROM_EMAIL ?? process.env.SMTP_USER ?? "hello@nazyempire.com";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "hello@nazyempire.com";
const APP_URL = process.env.APP_URL ?? "https://nazyempire.com";

async function sendMail(to: string, subject: string, html: string) {
  const transporter = createTransporter();
  if (!transporter) {
    logger.info({ to, subject }, "Email not configured — skipping send");
    return;
  }
  try {
    await transporter.sendMail({ from: `"Nazy Empire" <${FROM_EMAIL}>`, to, subject, html });
    logger.info({ to, subject }, "Email sent");
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to send email");
  }
}

export async function sendProjectSubmissionEmail(
  projectId: string,
  clientName: string,
  clientEmail: string,
  websiteType: string,
  totalAmount: string,
) {
  const clientHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">Project Request Received — ${projectId}</h2>
      <p>Dear ${clientName},</p>
      <p>Thank you for choosing Nazy Empire! Your project request has been received and is under review.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Project ID</strong></td><td style="padding:8px;border:1px solid #ddd">${projectId}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Website Type</strong></td><td style="padding:8px;border:1px solid #ddd">${websiteType}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Total Amount</strong></td><td style="padding:8px;border:1px solid #ddd">$${totalAmount}</td></tr>
      </table>
      <p><a href="${APP_URL}/dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px">View Dashboard</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  const adminHtml = `
    <div style="font-family:sans-serif">
      <h2>New Project Submission — ${projectId}</h2>
      <p><strong>Client:</strong> ${clientName} (${clientEmail})</p>
      <p><strong>Website Type:</strong> ${websiteType}</p>
      <p><strong>Total:</strong> $${totalAmount}</p>
      <p><a href="${APP_URL}/admin">View in Admin</a></p>
    </div>`;
  await Promise.all([
    sendMail(clientEmail, `Project Request Received — ${projectId}`, clientHtml),
    sendMail(ADMIN_EMAIL, `New Project — ${projectId} | ${websiteType} | $${totalAmount}`, adminHtml),
  ]);
}

export async function sendPaymentConfirmationEmail(
  projectId: string,
  clientName: string,
  clientEmail: string,
  amount: string,
) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">Payment Confirmed — ${projectId}</h2>
      <p>Dear ${clientName},</p>
      <p>Your payment of <strong>$${amount}</strong> has been confirmed. Your project is now <strong>In Progress</strong>.</p>
      <p><a href="${APP_URL}/dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px">Track Your Project</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  await Promise.all([
    sendMail(clientEmail, `Payment Confirmed — ${projectId}`, html),
    sendMail(ADMIN_EMAIL, `Payment Received — ${projectId} ($${amount})`, html),
  ]);
}

// ── User welcome ──────────────────────────────────────────────────────────
export async function sendWelcomeEmail(name: string, email: string) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">Welcome to Nazy Empire, ${name}!</h2>
      <p>We're glad you're here. Your account is ready — you can now explore our services, submit projects, and manage your work all in one place.</p>
      <p><a href="${APP_URL}/dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">Go to Dashboard</a></p>
      <p>If you have any questions, our support team is always available.</p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  await sendMail(email, "Welcome to Nazy Empire!", html);
}

// ── Artist applications ────────────────────────────────────────────────────
export async function sendArtistApplicationReceivedEmail(name: string, email: string, stageName: string) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">Artist Application Received</h2>
      <p>Hi ${name},</p>
      <p>We've received your artist application for <strong>${stageName}</strong>. Our team will review it and get back to you as soon as possible.</p>
      <p><a href="${APP_URL}/artist-dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">View Application</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  const adminHtml = `
    <div style="font-family:sans-serif">
      <h2>New Artist Application</h2>
      <p><strong>Artist:</strong> ${name} (${email})</p>
      <p><strong>Stage Name:</strong> ${stageName}</p>
      <p><a href="${APP_URL}/admin">Review in Admin</a></p>
    </div>`;
  await Promise.all([
    sendMail(email, "Artist Application Received — Nazy Empire", html),
    sendMail(ADMIN_EMAIL, `New Artist Application — ${stageName}`, adminHtml),
  ]);
}

export async function sendArtistApplicationDecisionEmail(
  name: string,
  email: string,
  stageName: string,
  status: "approved" | "rejected",
  adminNotes?: string | null,
) {
  const approved = status === "approved";
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">Artist Application ${approved ? "Approved" : "Not Approved"}</h2>
      <p>Hi ${name},</p>
      ${approved
        ? `<p>Great news! Your artist application for <strong>${stageName}</strong> has been <strong>approved</strong>. You can now upload and distribute your music on Nazy Empire.</p>`
        : `<p>Thank you for applying. Unfortunately, your artist application for <strong>${stageName}</strong> was not approved at this time.</p>`
      }
      ${adminNotes ? `<p><strong>Notes from our team:</strong> ${adminNotes}</p>` : ""}
      <p><a href="${APP_URL}/artist-dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">${approved ? "Start Distributing" : "View Dashboard"}</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  await sendMail(email, `Artist Application ${approved ? "Approved" : "Update"} — Nazy Empire`, html);
}

// ── Music releases ─────────────────────────────────────────────────────────
export async function sendReleaseSubmittedEmail(name: string, email: string, releaseTitle: string) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">Release Submitted for Review</h2>
      <p>Hi ${name},</p>
      <p>Your release <strong>${releaseTitle}</strong> has been submitted and is now under review. We'll notify you once it's been processed.</p>
      <p><a href="${APP_URL}/artist-dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">View Release</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  const adminHtml = `
    <div style="font-family:sans-serif">
      <h2>New Release Submitted for Review</h2>
      <p><strong>Artist:</strong> ${name} (${email})</p>
      <p><strong>Release:</strong> ${releaseTitle}</p>
      <p><a href="${APP_URL}/admin">Review in Admin</a></p>
    </div>`;
  await Promise.all([
    sendMail(email, `Release Submitted — ${releaseTitle}`, html),
    sendMail(ADMIN_EMAIL, `New Release for Review — ${releaseTitle} by ${name}`, adminHtml),
  ]);
}

export async function sendReleaseStatusEmail(
  name: string,
  email: string,
  releaseTitle: string,
  status: string,
  adminNotes?: string | null,
) {
  const messages: Record<string, { subject: string; body: string }> = {
    approved: {
      subject: `Release Approved — ${releaseTitle}`,
      body: `Your release <strong>${releaseTitle}</strong> has been <strong>approved</strong> and is being prepared for distribution.`,
    },
    distributed: {
      subject: `Release Live — ${releaseTitle}`,
      body: `Your release <strong>${releaseTitle}</strong> is now <strong>live</strong> and distributed across streaming platforms.`,
    },
    rejected: {
      subject: `Release Update — ${releaseTitle}`,
      body: `Your release <strong>${releaseTitle}</strong> could not be approved at this time.`,
    },
    changes_requested: {
      subject: `Changes Requested — ${releaseTitle}`,
      body: `Our team has requested changes to your release <strong>${releaseTitle}</strong>. Please review the notes and resubmit.`,
    },
  };
  const entry = messages[status];
  if (!entry) return;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">${entry.subject}</h2>
      <p>Hi ${name},</p>
      <p>${entry.body}</p>
      ${adminNotes ? `<p><strong>Notes:</strong> ${adminNotes}</p>` : ""}
      <p><a href="${APP_URL}/artist-dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">View Release</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  await sendMail(email, entry.subject, html);
}

// ── Support tickets ────────────────────────────────────────────────────────
export async function sendSupportTicketCreatedEmail(name: string, email: string, subject: string, ticketId: number) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">Support Ticket Received — #${ticketId}</h2>
      <p>Hi ${name},</p>
      <p>We've received your support request: <strong>${subject}</strong>.</p>
      <p>Our team will get back to you as soon as possible. You can track the conversation in your dashboard.</p>
      <p><a href="${APP_URL}/dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">View Ticket</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  const adminHtml = `
    <div style="font-family:sans-serif">
      <h2>New Support Ticket #${ticketId}</h2>
      <p><strong>From:</strong> ${name} (${email})</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><a href="${APP_URL}/admin">View in Admin</a></p>
    </div>`;
  await Promise.all([
    sendMail(email, `Support Ticket Received — #${ticketId}`, html),
    sendMail(ADMIN_EMAIL, `New Support Ticket #${ticketId} — ${subject}`, adminHtml),
  ]);
}

export async function sendSupportTicketReplyEmail(
  name: string,
  email: string,
  subject: string,
  ticketId: number,
  replyMessage: string,
) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">New Reply on Ticket #${ticketId}</h2>
      <p>Hi ${name},</p>
      <p>Our support team has replied to your ticket: <strong>${subject}</strong>.</p>
      <blockquote style="border-left:3px solid #d4a017;padding-left:12px;color:#555;margin:16px 0">${replyMessage}</blockquote>
      <p><a href="${APP_URL}/dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">View Conversation</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  await sendMail(email, `Reply on Ticket #${ticketId} — ${subject}`, html);
}

// ── Withdrawal requests ────────────────────────────────────────────────────
export async function sendWithdrawalRequestEmail(name: string, email: string, amountNgn: number) {
  const formatted = `₦${amountNgn.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">Withdrawal Request Received</h2>
      <p>Hi ${name},</p>
      <p>Your withdrawal request of <strong>${formatted}</strong> has been received and is being processed. We'll notify you once the payment has been sent.</p>
      <p><a href="${APP_URL}/artist-dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">View Request</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  const adminHtml = `
    <div style="font-family:sans-serif">
      <h2>New Withdrawal Request</h2>
      <p><strong>Artist:</strong> ${name} (${email})</p>
      <p><strong>Amount:</strong> ${formatted}</p>
      <p><a href="${APP_URL}/admin">Process in Admin</a></p>
    </div>`;
  await Promise.all([
    sendMail(email, "Withdrawal Request Received — Nazy Empire", html),
    sendMail(ADMIN_EMAIL, `New Withdrawal Request — ${formatted} from ${name}`, adminHtml),
  ]);
}

export async function sendWithdrawalPaidEmail(name: string, email: string, amountNgn: number) {
  const formatted = `₦${amountNgn.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">Payment Sent!</h2>
      <p>Hi ${name},</p>
      <p>Your withdrawal of <strong>${formatted}</strong> has been processed and the payment has been sent to your account on file.</p>
      <p>Please allow 1–3 business days for the funds to reflect depending on your bank.</p>
      <p><a href="${APP_URL}/artist-dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">View Earnings</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  await sendMail(email, `Payment Sent — ${formatted}`, html);
}

// ── Affiliate emails ───────────────────────────────────────────────────────
export async function sendAffiliateApplicationReceivedEmail(name: string, email: string) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">Affiliate Application Received</h2>
      <p>Hi ${name},</p>
      <p>We've received your application to join the Nazy Empire Affiliate Programme. Our team will review it and notify you of the outcome.</p>
      <p><a href="${APP_URL}/dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">View Dashboard</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  const adminHtml = `
    <div style="font-family:sans-serif">
      <h2>New Affiliate Application</h2>
      <p><strong>From:</strong> ${name} (${email})</p>
      <p><a href="${APP_URL}/admin">Review in Admin</a></p>
    </div>`;
  await Promise.all([
    sendMail(email, "Affiliate Application Received — Nazy Empire", html),
    sendMail(ADMIN_EMAIL, `New Affiliate Application — ${name}`, adminHtml),
  ]);
}

export async function sendAffiliateApplicationDecisionEmail(
  name: string,
  email: string,
  status: "approved" | "rejected",
  adminNotes?: string | null,
) {
  const approved = status === "approved";
  const body = approved
    ? "Congratulations! Your affiliate application has been <strong>approved</strong>. You can now find your unique referral link in your dashboard and start earning 5% commission on every completed project you refer."
    : "Thank you for applying. Unfortunately, your affiliate application was not approved at this time.";
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">Affiliate Application ${approved ? "Approved 🎉" : "Update"}</h2>
      <p>Hi ${name},</p>
      <p>${body}</p>
      ${adminNotes ? `<p><strong>Notes from our team:</strong> ${adminNotes}</p>` : ""}
      <p><a href="${APP_URL}/dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">${approved ? "Get My Referral Link" : "View Dashboard"}</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  await sendMail(email, `Affiliate Application ${approved ? "Approved" : "Update"} — Nazy Empire`, html);
}

export async function sendAffiliateWithdrawalRequestedEmail(name: string, email: string, amount: number) {
  const fmt = `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">Affiliate Withdrawal Request Received</h2>
      <p>Hi ${name},</p>
      <p>Your withdrawal request of <strong>${fmt}</strong> has been received and is being reviewed.</p>
      <p><a href="${APP_URL}/dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">View Dashboard</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  const adminHtml = `
    <div style="font-family:sans-serif">
      <h2>New Affiliate Withdrawal Request</h2>
      <p><strong>From:</strong> ${name} (${email})</p>
      <p><strong>Amount:</strong> ${fmt}</p>
      <p><a href="${APP_URL}/admin">Process in Admin</a></p>
    </div>`;
  await Promise.all([
    sendMail(email, "Affiliate Withdrawal Request — Nazy Empire", html),
    sendMail(ADMIN_EMAIL, `Affiliate Withdrawal Request — ${fmt} from ${name}`, adminHtml),
  ]);
}

export async function sendAffiliateWithdrawalPaidEmail(name: string, email: string, amount: number) {
  const fmt = `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">Affiliate Payment Sent!</h2>
      <p>Hi ${name},</p>
      <p>Your affiliate withdrawal of <strong>${fmt}</strong> has been processed and sent to your account.</p>
      <p>Please allow 1–3 business days for the funds to reflect.</p>
      <p><a href="${APP_URL}/dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">View Dashboard</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  await sendMail(email, `Affiliate Payment Sent — ${fmt}`, html);
}

// ── Project status updates (existing) ─────────────────────────────────────
export async function sendStatusUpdateEmail(
  projectId: string,
  clientName: string,
  clientEmail: string,
  newStatus: string,
) {
  const statusLabels: Record<string, string> = {
    pending_review: "Pending Review",
    awaiting_payment: "Awaiting Payment",
    in_progress: "In Progress",
    waiting_for_client_feedback: "Waiting for Client Feedback",
    completed: "Completed",
    delivered: "Delivered",
  };
  const label = statusLabels[newStatus] ?? newStatus;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d4a017">Project Update — ${projectId}</h2>
      <p>Dear ${clientName},</p>
      <p>Your project status has been updated to: <strong>${label}</strong></p>
      <p><a href="${APP_URL}/dashboard" style="background:#d4a017;color:#000;padding:10px 20px;text-decoration:none;border-radius:4px">View Dashboard</a></p>
      <p>Best regards,<br/>Nazy Empire Team</p>
    </div>`;
  await sendMail(clientEmail, `Project Update — ${projectId}: ${label}`, html);
}
