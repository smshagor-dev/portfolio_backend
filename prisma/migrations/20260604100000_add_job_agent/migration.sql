CREATE TABLE `cv_profiles` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(191) NOT NULL DEFAULT 'Primary CV',
  `summary` TEXT NOT NULL,
  `skills` JSON NOT NULL,
  `experience` LONGTEXT NOT NULL,
  `education` TEXT NOT NULL,
  `portfolioLinks` JSON NOT NULL,
  `resumeUrl` VARCHAR(191) NOT NULL DEFAULT '',
  `isDefault` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `job_sources` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `config` JSON NOT NULL,
  `lastSyncedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `job_sources_type_provider_idx`(`type`, `provider`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `job_posts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `sourceId` INTEGER NULL,
  `sourceType` VARCHAR(191) NOT NULL,
  `externalId` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `company` VARCHAR(191) NOT NULL,
  `location` VARCHAR(191) NOT NULL DEFAULT '',
  `sourceUrl` TEXT NOT NULL,
  `description` LONGTEXT NOT NULL,
  `rawContent` LONGTEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'new',
  `receivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `job_posts_sourceType_externalId_key`(`sourceType`, `externalId`),
  INDEX `job_posts_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `job_posts_company_idx`(`company`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `job_matches` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `jobPostId` INTEGER NOT NULL,
  `cvProfileId` INTEGER NOT NULL,
  `score` INTEGER NOT NULL,
  `matchedSkills` JSON NOT NULL,
  `missingSkills` JSON NOT NULL,
  `summary` TEXT NOT NULL,
  `aiAnalysis` JSON NOT NULL,
  `coverLetter` LONGTEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `job_matches_jobPostId_cvProfileId_key`(`jobPostId`, `cvProfileId`),
  INDEX `job_matches_score_idx`(`score`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `recruiter_contacts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `jobPostId` INTEGER NULL,
  `name` VARCHAR(191) NOT NULL DEFAULT '',
  `email` VARCHAR(191) NOT NULL,
  `source` VARCHAR(191) NOT NULL,
  `verification` VARCHAR(191) NOT NULL DEFAULT 'manual',
  `verified` BOOLEAN NOT NULL DEFAULT false,
  `publicContext` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `recruiter_contacts_email_idx`(`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `job_email_drafts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `jobPostId` INTEGER NOT NULL,
  `recruiterContactId` INTEGER NULL,
  `toEmail` VARCHAR(191) NOT NULL DEFAULT '',
  `subject` VARCHAR(191) NOT NULL,
  `body` LONGTEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `approvedAt` DATETIME(3) NULL,
  `sentAt` DATETIME(3) NULL,
  `providerMessageId` VARCHAR(191) NOT NULL DEFAULT '',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `job_email_drafts_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `job_email_drafts_sentAt_idx`(`sentAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `job_agent_settings` (
  `id` INTEGER NOT NULL,
  `gmailConnectedEmail` VARCHAR(191) NOT NULL DEFAULT '',
  `gmailRefreshToken` LONGTEXT NOT NULL,
  `gmailHistoryId` VARCHAR(191) NOT NULL DEFAULT '',
  `gmailQuery` VARCHAR(191) NOT NULL DEFAULT '(from:linkedin OR from:indeed OR subject:(job alert) OR subject:(jobs for you)) newer_than:30d',
  `dailySendLimit` INTEGER NOT NULL DEFAULT 5,
  `sendsToday` INTEGER NOT NULL DEFAULT 0,
  `sendLimitDate` DATETIME(3) NULL,
  `autoSendEnabled` BOOLEAN NOT NULL DEFAULT false,
  `defaultCvProfileId` INTEGER NULL,
  `approvedApiSources` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `job_posts` ADD CONSTRAINT `job_posts_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `job_sources`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `job_matches` ADD CONSTRAINT `job_matches_jobPostId_fkey` FOREIGN KEY (`jobPostId`) REFERENCES `job_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `job_matches` ADD CONSTRAINT `job_matches_cvProfileId_fkey` FOREIGN KEY (`cvProfileId`) REFERENCES `cv_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `recruiter_contacts` ADD CONSTRAINT `recruiter_contacts_jobPostId_fkey` FOREIGN KEY (`jobPostId`) REFERENCES `job_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `job_email_drafts` ADD CONSTRAINT `job_email_drafts_jobPostId_fkey` FOREIGN KEY (`jobPostId`) REFERENCES `job_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `job_email_drafts` ADD CONSTRAINT `job_email_drafts_recruiterContactId_fkey` FOREIGN KEY (`recruiterContactId`) REFERENCES `recruiter_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
