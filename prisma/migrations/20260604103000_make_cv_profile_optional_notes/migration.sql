ALTER TABLE `job_matches` DROP FOREIGN KEY `job_matches_cvProfileId_fkey`;
ALTER TABLE `job_matches` DROP FOREIGN KEY `job_matches_jobPostId_fkey`;
DROP INDEX `job_matches_jobPostId_cvProfileId_key` ON `job_matches`;

ALTER TABLE `cv_profiles`
  ADD COLUMN `extraNotes` LONGTEXT NULL,
  ADD COLUMN `targetRoles` JSON NULL,
  ADD COLUMN `preferredCountries` JSON NULL,
  ADD COLUMN `resumeFileName` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `resumeUpdatedAt` DATETIME(3) NULL;

UPDATE `cv_profiles`
SET
  `extraNotes` = '',
  `targetRoles` = JSON_ARRAY(),
  `preferredCountries` = JSON_ARRAY(),
  `resumeFileName` = ''
WHERE `extraNotes` IS NULL OR `extraNotes` = '';

UPDATE `cv_profiles`
SET
  `extraNotes` = COALESCE(`extraNotes`, ''),
  `targetRoles` = COALESCE(`targetRoles`, JSON_ARRAY()),
  `preferredCountries` = COALESCE(`preferredCountries`, JSON_ARRAY());

ALTER TABLE `cv_profiles`
  DROP COLUMN `summary`,
  DROP COLUMN `skills`,
  DROP COLUMN `experience`,
  DROP COLUMN `education`,
  DROP COLUMN `portfolioLinks`;

ALTER TABLE `cv_profiles`
  MODIFY `extraNotes` LONGTEXT NOT NULL,
  MODIFY `targetRoles` JSON NOT NULL,
  MODIFY `preferredCountries` JSON NOT NULL;

ALTER TABLE `job_matches` MODIFY `cvProfileId` INTEGER NULL;
CREATE INDEX `job_matches_jobPostId_cvProfileId_idx` ON `job_matches`(`jobPostId`, `cvProfileId`);
ALTER TABLE `job_matches` ADD CONSTRAINT `job_matches_jobPostId_fkey` FOREIGN KEY (`jobPostId`) REFERENCES `job_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `job_matches` ADD CONSTRAINT `job_matches_cvProfileId_fkey` FOREIGN KEY (`cvProfileId`) REFERENCES `cv_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
