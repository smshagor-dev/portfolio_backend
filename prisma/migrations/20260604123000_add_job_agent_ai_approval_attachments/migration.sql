ALTER TABLE `job_email_drafts`
  ADD COLUMN `aiProvider` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `aiModel` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `emailPromptUsed` LONGTEXT NULL,
  ADD COLUMN `coverLetterPromptUsed` LONGTEXT NULL,
  ADD COLUMN `coverLetterText` LONGTEXT NULL,
  ADD COLUMN `coverLetterPdfUrl` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `cvUrl` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `adminApprovalRequired` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `approvalStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `approvedBy` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `rejectedAt` DATETIME(3) NULL,
  ADD COLUMN `rejectionReason` TEXT NULL;

UPDATE `job_email_drafts`
SET
  `emailPromptUsed` = '',
  `coverLetterPromptUsed` = '',
  `coverLetterText` = '',
  `rejectionReason` = ''
WHERE `emailPromptUsed` IS NULL
   OR `coverLetterPromptUsed` IS NULL
   OR `coverLetterText` IS NULL
   OR `rejectionReason` IS NULL;

ALTER TABLE `job_email_drafts`
  MODIFY `emailPromptUsed` LONGTEXT NOT NULL,
  MODIFY `coverLetterPromptUsed` LONGTEXT NOT NULL,
  MODIFY `coverLetterText` LONGTEXT NOT NULL,
  MODIFY `rejectionReason` TEXT NOT NULL;

CREATE TABLE `job_agent_ai_settings` (
  `id` INTEGER NOT NULL,
  `aiProvider` VARCHAR(191) NOT NULL DEFAULT 'DEEPSEEK',
  `aiModel` VARCHAR(191) NOT NULL DEFAULT 'deepseek-chat',
  `deepseekApiKeyEncrypted` LONGTEXT NULL,
  `geminiApiKeyEncrypted` LONGTEXT NULL,
  `openaiApiKeyEncrypted` LONGTEXT NULL,
  `fallbackProvider` VARCHAR(191) NULL,
  `fallbackEnabled` BOOLEAN NOT NULL DEFAULT false,
  `systemPrompt` LONGTEXT NULL,
  `recruiterEmailPrompt` LONGTEXT NULL,
  `coverLetterPrompt` LONGTEXT NULL,
  `tone` VARCHAR(191) NOT NULL DEFAULT 'professional-natural',
  `maxEmailWords` INTEGER NOT NULL DEFAULT 160,
  `maxCoverLetterWords` INTEGER NOT NULL DEFAULT 450,
  `requireAdminApproval` BOOLEAN NOT NULL DEFAULT true,
  `attachCv` BOOLEAN NOT NULL DEFAULT true,
  `attachCoverLetterPdf` BOOLEAN NOT NULL DEFAULT true,
  `autoGenerateCoverLetter` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `job_agent_ai_settings` (
  `id`,
  `aiProvider`,
  `aiModel`,
  `systemPrompt`,
  `recruiterEmailPrompt`,
  `coverLetterPrompt`,
  `updatedAt`
) VALUES (
  1,
  'DEEPSEEK',
  'deepseek-chat',
  'You are writing on behalf of Md Shahanur Islam Shagor. Write naturally, professionally, and honestly, as if Md Shahanur Islam Shagor personally wrote the message. Use only the provided portfolio profile, skills, education, projects, experience, CV link, and job details. Do not invent experience, employers, degrees, achievements, certifications, or skills. Be concise, confident, respectful, and recruiter-friendly. Avoid generic AI-sounding phrases, exaggeration, buzzwords, and robotic wording. The message should feel human, specific, and easy for a recruiter to read quickly.',
  'Create a short recruiter outreach email for the job below. The email must feel personal, natural, and written by the applicant, not by an AI. Start with a simple greeting. If recruiter name exists, use it; otherwise use ''Hello''. Mention the exact role/company if available. Connect 1-2 strongest relevant skills or projects from the provided portfolio context to the job requirements. Keep the tone professional, warm, confident, and humble. Keep it under {{maxEmailWords}} words. Include that CV and cover letter are attached if attachments are enabled. Include portfolio link only if available. Do not overpromise. Do not use fake claims. End with a polite interest in discussing the opportunity.',
  'Write a customized cover letter for this job using only the provided real portfolio context. Make it recruiter-friendly, ATS-friendly, and natural. Structure it with a clear opening, relevant skills/projects/experience, motivation for the role, and a polite closing. Avoid generic filler and AI-style language. Do not invent facts. Keep it under {{maxCoverLetterWords}} words. The letter should make the recruiter feel the applicant is relevant, honest, motivated, and worth reviewing.',
  CURRENT_TIMESTAMP(3)
);

ALTER TABLE `job_agent_ai_settings`
  MODIFY `systemPrompt` LONGTEXT NOT NULL,
  MODIFY `recruiterEmailPrompt` LONGTEXT NOT NULL,
  MODIFY `coverLetterPrompt` LONGTEXT NOT NULL;
