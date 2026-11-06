ALTER TABLE `job_posts`
  ADD COLUMN `sourceEmail` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `sourceSubject` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `sourcePlatform` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `applyUrl` TEXT NULL,
  ADD COLUMN `companyUrl` TEXT NULL,
  ADD COLUMN `extractedUrls` JSON NULL,
  ADD COLUMN `contactDiscoveryStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
  ADD COLUMN `contactDiscoveryError` TEXT NULL,
  ADD COLUMN `lastContactDiscoveryAt` DATETIME(3) NULL;

UPDATE `job_posts`
SET
  `sourceSubject` = CASE WHEN `sourceSubject` = '' THEN `emailSubject` ELSE `sourceSubject` END,
  `sourcePlatform` = CASE WHEN `sourcePlatform` = '' THEN `sourceType` ELSE `sourcePlatform` END,
  `applyUrl` = CASE WHEN `applyUrl` IS NULL THEN `sourceUrl` ELSE `applyUrl` END,
  `companyUrl` = CASE WHEN `companyUrl` IS NULL THEN '' ELSE `companyUrl` END,
  `extractedUrls` = CASE WHEN `extractedUrls` IS NULL THEN JSON_ARRAY() ELSE `extractedUrls` END,
  `contactDiscoveryError` = CASE WHEN `contactDiscoveryError` IS NULL THEN '' ELSE `contactDiscoveryError` END;

ALTER TABLE `job_posts`
  MODIFY `applyUrl` TEXT NOT NULL,
  MODIFY `companyUrl` TEXT NOT NULL,
  MODIFY `extractedUrls` JSON NOT NULL,
  MODIFY `contactDiscoveryError` TEXT NOT NULL;

ALTER TABLE `recruiter_contacts`
  ADD COLUMN `companyName` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `companyDomain` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `sourceUrl` TEXT NULL,
  ADD COLUMN `discoveryMethod` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `validationStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
  ADD COLUMN `contactEmailStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
  ADD COLUMN `confidenceScore` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `isRecruiter` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `isHiringManager` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `evidence` JSON NULL,
  ADD COLUMN `lastVerifiedAt` DATETIME(3) NULL,
  ADD COLUMN `errorMessage` TEXT NULL;

UPDATE `recruiter_contacts`
SET
  `sourceUrl` = CASE WHEN `sourceUrl` IS NULL THEN '' ELSE `sourceUrl` END,
  `evidence` = CASE WHEN `evidence` IS NULL THEN JSON_OBJECT('legacy', true, 'publicContext', `publicContext`) ELSE `evidence` END,
  `errorMessage` = CASE WHEN `errorMessage` IS NULL THEN '' ELSE `errorMessage` END,
  `validationStatus` = CASE
    WHEN `verified` = true AND `source` IN ('manual', 'admin') THEN 'approved'
    WHEN `verified` = true THEN 'needs_review'
    ELSE `validationStatus`
  END,
  `contactEmailStatus` = CASE
    WHEN `verified` = true AND `source` IN ('manual', 'admin') THEN 'approved'
    WHEN `verified` = true THEN 'needs_review'
    ELSE `contactEmailStatus`
  END,
  `confidenceScore` = CASE
    WHEN `verified` = true AND `source` IN ('manual', 'admin') THEN 90
    WHEN `verified` = true THEN 40
    ELSE `confidenceScore`
  END,
  `discoveryMethod` = CASE WHEN `discoveryMethod` = '' THEN `source` ELSE `discoveryMethod` END;

ALTER TABLE `recruiter_contacts`
  MODIFY `sourceUrl` TEXT NOT NULL,
  MODIFY `evidence` JSON NOT NULL,
  MODIFY `errorMessage` TEXT NOT NULL;

ALTER TABLE `job_email_drafts`
  ADD COLUMN `sendStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
  ADD COLUMN `skipReason` TEXT NULL,
  ADD COLUMN `errorMessage` TEXT NULL,
  ADD COLUMN `lastSendAttemptAt` DATETIME(3) NULL;

UPDATE `job_email_drafts`
SET
  `sendStatus` = CASE
    WHEN `status` IN ('SENT', 'OPENED', 'CLICKED') THEN 'sent'
    WHEN `status` = 'FAILED' THEN 'failed'
    ELSE `sendStatus`
  END,
  `skipReason` = CASE WHEN `skipReason` IS NULL THEN '' ELSE `skipReason` END,
  `errorMessage` = CASE WHEN `errorMessage` IS NULL THEN '' ELSE `errorMessage` END;

ALTER TABLE `job_email_drafts`
  MODIFY `skipReason` TEXT NOT NULL,
  MODIFY `errorMessage` TEXT NOT NULL;
