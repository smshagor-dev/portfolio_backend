require("../lib/config");

const prisma = require("../lib/prisma");
const { signAdminToken } = require("../lib/auth");
const {
  isNoReplyEmail,
  isPlatformDomain,
  validateRecruiterEmail,
} = require("../services/job-agent-email-validation");
const { parseGmailJobAlert } = require("../services/job-agent-gmail");

function encodeBody(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function buildFakeGmailAlert() {
  return {
    id: "gmail-safety-smoke",
    payload: {
      headers: [
        { name: "From", value: "LinkedIn Jobs <jobs-noreply@linkedin.com>" },
        { name: "Subject", value: "Job alert: Backend Engineer at Example Labs" },
        { name: "Date", value: new Date().toUTCString() },
      ],
      mimeType: "text/plain",
      body: {
        data: encodeBody([
          "Backend Engineer at Example Labs",
          "Apply: https://www.linkedin.com/jobs/view/123456",
          "Company: https://example.com/careers",
          "Tracking: https://linkedin.com/some/track?trk=abc",
          "Unsubscribe: https://linkedin.com/unsubscribe",
          "Contact looking text: jobs-noreply@linkedin.com and hr@example.com",
        ].join("\n")),
      },
    },
  };
}

async function main() {
  const token = signAdminToken({ id: 1, email: "admin@example.com" });
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const base = "http://127.0.0.1:5000";

  async function request(pathname, options = {}) {
    const response = await fetch(`${base}${pathname}`, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(`${pathname} ${response.status}: ${data.message || text}`);
    }

    return data;
  }

  const parsedAlert = parseGmailJobAlert(buildFakeGmailAlert());
  if (parsedAlert.source !== "linkedin" || parsedAlert.company !== "Example Labs") {
    throw new Error("Gmail alert parsing did not classify the job source/company.");
  }
  if (!isNoReplyEmail("jobs-noreply@linkedin.com") || !isPlatformDomain("linkedin.com")) {
    throw new Error("Platform/no-reply sender validation failed.");
  }
  if (validateRecruiterEmail("alerts@indeed.com").accepted || validateRecruiterEmail("notification@glassdoor.com").accepted) {
    throw new Error("Indeed/Glassdoor platform sender was accepted.");
  }
  const sameDomain = validateRecruiterEmail("hr@example.com", { companyDomain: "example.com" });
  const otherDomain = validateRecruiterEmail("hr@other-example.com", { companyDomain: "example.com" });
  if (!sameDomain.accepted || sameDomain.confidenceScore <= otherDomain.confidenceScore) {
    throw new Error("Company-domain contact did not score higher.");
  }

  const saved = await request("/api/admin/job-agent/email/settings", {
    method: "PUT",
    body: JSON.stringify({
      fromName: "Job Agent",
      fromEmail: "agent@example.com",
      smtpUsername: "agent@example.com",
      smtpPassword: "fake-app-password",
      smtpPort: 465,
      smtpSecure: true,
      dailySendLimit: 1,
      isEnabled: true,
      openTrackingEnabled: true,
      clickTrackingEnabled: true,
    }),
  });

  if (saved.setting.smtpPassword || saved.setting.smtpPasswordEncrypted || !saved.setting.hasPassword) {
    throw new Error("SMTP password serialization is unsafe.");
  }

  const loaded = await request("/api/admin/job-agent/email/settings");
  if (loaded.setting.smtpPassword || loaded.setting.smtpPasswordEncrypted) {
    throw new Error("SMTP password leaked in settings response.");
  }

  await request("/api/admin/job-agent/email/test", {
    method: "POST",
    body: JSON.stringify({ mock: true, toEmail: "agent@example.com" }),
  });

  await prisma.jobAgentEmailSetting.update({
    where: { id: 1 },
    data: { smtpPasswordEncrypted: "", isEnabled: true },
  });
  const missingSmtp = await fetch(`${base}/api/admin/job-agent/email/test`, {
    method: "POST",
    headers,
    body: JSON.stringify({ toEmail: "agent@example.com", mock: false }),
  });
  const missingSmtpPayload = await missingSmtp.json().catch(() => ({}));
  if (missingSmtp.status !== 400 || !String(missingSmtpPayload.message || "").includes("SMTP is not configured")) {
    throw new Error("Missing SMTP did not return the clear configuration error.");
  }
  await request("/api/admin/job-agent/email/settings", {
    method: "PUT",
    body: JSON.stringify({
      fromName: "Job Agent",
      fromEmail: "agent@example.com",
      smtpUsername: "agent@example.com",
      smtpPassword: "fake-app-password",
      smtpPort: 465,
      smtpSecure: true,
      dailySendLimit: 1,
      isEnabled: true,
      openTrackingEnabled: true,
      clickTrackingEnabled: true,
    }),
  });

  const previousAiSetting = await prisma.jobAgentAiSetting.findUnique({ where: { id: 1 } });
  await prisma.jobAgentAiSetting.update({
    where: { id: 1 },
    data: { requireAdminApproval: false },
  });

  const job = await prisma.jobPost.create({
    data: {
      sourceType: "manual",
      title: "Smoke Email Job",
      company: "Smoke Co",
      location: "Remote",
      sourceUrl: "",
      description: "Node role",
      rawContent: "Node role",
      status: "new",
      sourcePlatform: "manual",
      applyUrl: "https://example.com/jobs/smoke",
      companyUrl: "https://example.com",
      extractedUrls: [{ url: "https://example.com/jobs/smoke", type: "companyUrl" }],
      contactDiscoveryStatus: "pending",
      contactDiscoveryError: "",
    },
  });
  const contact = await prisma.recruiterContact.create({
    data: {
      jobPostId: job.id,
      email: "recruiter@example.com",
      companyName: "Smoke Co",
      companyDomain: "example.com",
      source: "manual",
      sourceUrl: "https://example.com/contact",
      discoveryMethod: "manual_admin_entry",
      validationStatus: "approved",
      contactEmailStatus: "approved",
      confidenceScore: 95,
      isRecruiter: true,
      isHiringManager: true,
      evidence: { smoke: true },
      lastVerifiedAt: new Date(),
      errorMessage: "",
      verification: "manual",
      verified: true,
      publicContext: "smoke",
    },
  });
  const draft = await prisma.jobEmailDraft.create({
    data: {
      jobPostId: job.id,
      recruiterContactId: contact.id,
      toEmail: contact.email,
      subject: "Smoke",
      body: "Hello https://example.com",
      aiProvider: "DEEPSEEK",
      aiModel: "deepseek-chat",
      emailPromptUsed: "smoke email prompt",
      coverLetterPromptUsed: "smoke cover letter prompt",
      coverLetterText: "Smoke cover letter",
      coverLetterPdfUrl: "",
      cvUrl: "",
      adminApprovalRequired: false,
      approvalStatus: "NOT_REQUIRED",
      rejectionReason: "",
      status: "READY",
      sendStatus: "pending",
      skipReason: "",
      errorMessage: "",
    },
  });
  const gmailJob = await prisma.jobPost.create({
    data: {
      sourceType: "gmail",
      sourcePlatform: "linkedin",
      sourceEmail: "jobs-noreply@linkedin.com",
      sourceSubject: "Job alert: Backend Engineer at Example Labs",
      emailSubject: "Job alert: Backend Engineer at Example Labs",
      title: "Backend Engineer",
      company: "Example Labs",
      location: "Remote",
      sourceUrl: "https://www.linkedin.com/jobs/view/123456",
      applyUrl: "https://www.linkedin.com/jobs/view/123456",
      companyUrl: "https://example.com/careers",
      extractedUrls: [
        { url: "https://www.linkedin.com/jobs/view/123456", type: "applyUrl" },
        { url: "https://example.com/careers", type: "companyUrl" },
        { url: "https://linkedin.com/some/track?trk=abc", type: "trackingUrl" },
        { url: "https://linkedin.com/unsubscribe", type: "unsubscribeUrl" },
      ],
      description: "",
      rawContent: "hr@example.com appears as raw evidence only.",
      sourceName: "Gmail Job Alerts",
      importMethod: "EMAIL_ALERT",
      descriptionStatus: "DESCRIPTION_REQUIRED",
      status: "DESCRIPTION_REQUIRED",
      contactDiscoveryStatus: "pending",
      contactDiscoveryError: "",
    },
  });
  const gmailContacts = await prisma.recruiterContact.findMany({ where: { jobPostId: gmailJob.id } });
  if (gmailContacts.length) {
    throw new Error("Gmail alert body created RecruiterContact records.");
  }
  const classifiedUrls = Array.isArray(gmailJob.extractedUrls) ? gmailJob.extractedUrls : [];
  if (!classifiedUrls.some((item) => item.type === "companyUrl") || !classifiedUrls.some((item) => item.type === "unsubscribeUrl")) {
    throw new Error("Multiple URL classification smoke data is invalid.");
  }

  try {
    const noRecipientDraft = await prisma.jobEmailDraft.create({
      data: {
        jobPostId: job.id,
        subject: "No recipient",
        body: "Hello",
        aiProvider: "DEEPSEEK",
        aiModel: "deepseek-chat",
        emailPromptUsed: "smoke",
        coverLetterPromptUsed: "smoke",
        coverLetterText: "",
        cvUrl: "",
        adminApprovalRequired: false,
        approvalStatus: "NOT_REQUIRED",
        approvedBy: "",
        rejectionReason: "",
        status: "DRAFT",
        sendStatus: "pending",
        skipReason: "",
        errorMessage: "",
      },
    });
    const noRecipientSend = await fetch(`${base}/api/admin/job-agent/email/send/${noRecipientDraft.id}`, {
      method: "POST",
      headers,
      body: "{}",
    });
    if (noRecipientSend.status !== 400) {
      throw new Error("Send without valid recipient was not skipped.");
    }
    const noRecipientAfter = await prisma.jobEmailDraft.findUnique({ where: { id: noRecipientDraft.id } });
    if (noRecipientAfter.sendStatus !== "skipped" || !noRecipientAfter.skipReason) {
      throw new Error("Skip reason was not stored for missing recipient.");
    }

    const noReplyDraft = await prisma.jobEmailDraft.create({
      data: {
        jobPostId: job.id,
        toEmail: "no-reply@example.com",
        subject: "No reply recipient",
        body: "Hello",
        aiProvider: "DEEPSEEK",
        aiModel: "deepseek-chat",
        emailPromptUsed: "smoke",
        coverLetterPromptUsed: "smoke",
        coverLetterText: "",
        cvUrl: "",
        adminApprovalRequired: false,
        approvalStatus: "NOT_REQUIRED",
        approvedBy: "",
        rejectionReason: "",
        status: "READY",
        sendStatus: "pending",
        skipReason: "",
        errorMessage: "",
      },
    });
    const noReplySend = await fetch(`${base}/api/admin/job-agent/email/send/${noReplyDraft.id}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ toEmail: "no-reply@example.com" }),
    });
    if (noReplySend.status !== 400) {
      throw new Error("No-reply recipient was not blocked.");
    }
    const noReplyAfter = await prisma.jobEmailDraft.findUnique({ where: { id: noReplyDraft.id } });
    if (noReplyAfter.sendStatus !== "skipped" || !noReplyAfter.skipReason) {
      throw new Error("Skip reason was not stored for no-reply recipient.");
    }

    await prisma.jobAgentEmailEvent.create({
      data: {
        draftId: draft.id,
        jobPostId: job.id,
        recipientEmail: contact.email,
        eventType: "SENT",
        trackingId: draft.trackingId,
        url: "",
        userAgent: "smoke",
        ipHash: "",
      },
    });

    const limited = await fetch(`${base}/api/admin/job-agent/email/send/${draft.id}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ toEmail: contact.email }),
    });

    if (limited.status !== 429) {
      throw new Error(`Expected daily limit 429, got ${limited.status}.`);
    }
    const limitedAfter = await prisma.jobEmailDraft.findUnique({ where: { id: draft.id } });
    if (limitedAfter.sendStatus !== "skipped" || !limitedAfter.skipReason) {
      throw new Error("Daily-limit skip reason was not stored.");
    }

    const pixel = await fetch(`${base}/api/job-agent/track/open/${draft.trackingId}.png`, {
      headers: { "User-Agent": "smoke-open" },
    });
    if (pixel.status !== 200 || !String(pixel.headers.get("content-type")).includes("image/png")) {
      throw new Error("Tracking pixel did not return PNG.");
    }

    const click = await fetch(
      `${base}/api/job-agent/track/click/${draft.trackingId}?url=${encodeURIComponent("https://example.com/path")}`,
      {
        redirect: "manual",
        headers: { "User-Agent": "smoke-click" },
      },
    );
    if (![301, 302, 303, 307, 308].includes(click.status)) {
      throw new Error(`Click endpoint did not redirect: ${click.status}.`);
    }

    const refreshed = await prisma.jobEmailDraft.findUnique({ where: { id: draft.id } });
    if (refreshed.openCount < 1 || refreshed.clickCount < 1) {
      throw new Error("Tracking counters did not increment.");
    }

    const eventWithHash = await prisma.jobAgentEmailEvent.findFirst({
      where: { draftId: draft.id, eventType: "OPENED" },
    });
    if (!eventWithHash?.ipHash) {
      throw new Error("Tracking event missing hashed IP.");
    }
  } finally {
    await prisma.jobPost.deleteMany({ where: { id: { in: [job.id, gmailJob.id] } } });
    await prisma.jobAgentEmailSetting.update({
      where: { id: 1 },
      data: {
        isEnabled: false,
        smtpPasswordEncrypted: "",
        fromName: "",
        fromEmail: "",
        smtpUsername: "",
        openTrackingEnabled: false,
        clickTrackingEnabled: false,
      },
    });
    if (previousAiSetting) {
      await prisma.jobAgentAiSetting.update({
        where: { id: 1 },
        data: { requireAdminApproval: previousAiSetting.requireAdminApproval },
      });
    }
  }

  console.log("Job Agent email smoke checks passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
