ALTER TABLE `job_email_drafts`
  ADD COLUMN `trackingId` VARCHAR(191) NULL,
  ADD COLUMN `openedAt` DATETIME(3) NULL,
  ADD COLUMN `lastOpenedAt` DATETIME(3) NULL,
  ADD COLUMN `openCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `clickedAt` DATETIME(3) NULL,
  ADD COLUMN `clickCount` INTEGER NOT NULL DEFAULT 0;

UPDATE `job_email_drafts`
SET
  `trackingId` = REPLACE(UUID(), '-', ''),
  `status` = CASE
    WHEN LOWER(`status`) = 'draft' THEN 'DRAFT'
    WHEN LOWER(`status`) = 'approved' THEN 'READY'
    WHEN LOWER(`status`) = 'sent' THEN 'SENT'
    WHEN LOWER(`status`) = 'failed' THEN 'FAILED'
    ELSE UPPER(`status`)
  END
WHERE `trackingId` IS NULL OR `trackingId` = '';

ALTER TABLE `job_email_drafts` MODIFY `trackingId` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `job_email_drafts_trackingId_key` ON `job_email_drafts`(`trackingId`);

CREATE TABLE `job_agent_email_settings` (
  `id` INTEGER NOT NULL,
  `adminId` INTEGER NULL,
  `fromName` VARCHAR(191) NOT NULL DEFAULT '',
  `fromEmail` VARCHAR(191) NOT NULL DEFAULT '',
  `smtpHost` VARCHAR(191) NOT NULL DEFAULT 'smtp.gmail.com',
  `smtpPort` INTEGER NOT NULL DEFAULT 465,
  `smtpSecure` BOOLEAN NOT NULL DEFAULT true,
  `smtpUsername` VARCHAR(191) NOT NULL DEFAULT '',
  `smtpPasswordEncrypted` LONGTEXT NOT NULL,
  `dailySendLimit` INTEGER NOT NULL DEFAULT 5,
  `isEnabled` BOOLEAN NOT NULL DEFAULT false,
  `openTrackingEnabled` BOOLEAN NOT NULL DEFAULT false,
  `clickTrackingEnabled` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `job_agent_email_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `draftId` INTEGER NOT NULL,
  `jobPostId` INTEGER NOT NULL,
  `recipientEmail` VARCHAR(191) NOT NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `trackingId` VARCHAR(191) NOT NULL,
  `url` TEXT NOT NULL,
  `userAgent` TEXT NOT NULL,
  `ipHash` VARCHAR(191) NOT NULL DEFAULT '',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `job_agent_email_events_draftId_eventType_createdAt_idx`(`draftId`, `eventType`, `createdAt`),
  INDEX `job_agent_email_events_trackingId_idx`(`trackingId`),
  INDEX `job_agent_email_events_jobPostId_idx`(`jobPostId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `job_agent_email_events` ADD CONSTRAINT `job_agent_email_events_draftId_fkey` FOREIGN KEY (`draftId`) REFERENCES `job_email_drafts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
