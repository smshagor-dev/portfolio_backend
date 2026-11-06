ALTER TABLE `job_posts`
  ADD COLUMN `jobType` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `workMode` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `region` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `experienceLevel` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `sourceName` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `importMethod` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `descriptionStatus` VARCHAR(191) NOT NULL DEFAULT 'READY',
  ADD COLUMN `searchKeywordMatched` VARCHAR(191) NOT NULL DEFAULT '';

UPDATE `job_posts`
SET
  `sourceName` = CASE WHEN `sourceName` = '' THEN `sourceType` ELSE `sourceName` END,
  `importMethod` = CASE
    WHEN `sourceType` = 'gmail' THEN 'EMAIL_ALERT'
    WHEN `sourceType` = 'manual' THEN 'MANUAL'
    ELSE `sourceType`
  END,
  `descriptionStatus` = CASE
    WHEN COALESCE(`description`, '') = '' THEN 'DESCRIPTION_REQUIRED'
    ELSE 'READY'
  END;

CREATE INDEX `job_posts_descriptionStatus_idx` ON `job_posts`(`descriptionStatus`);
CREATE INDEX `job_posts_importMethod_idx` ON `job_posts`(`importMethod`);

CREATE TABLE `job_search_preferences` (
  `id` INTEGER NOT NULL,
  `rolesJson` JSON NOT NULL,
  `customKeywordsJson` JSON NOT NULL,
  `jobTypesJson` JSON NOT NULL,
  `workModesJson` JSON NOT NULL,
  `regionsJson` JSON NOT NULL,
  `experienceLevelsJson` JSON NOT NULL,
  `preferredLanguagesJson` JSON NOT NULL,
  `maxJobsPerSync` INTEGER NOT NULL DEFAULT 25,
  `minimumMatchScoreToDraft` INTEGER NOT NULL DEFAULT 60,
  `autoDraftEnabled` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `job_board_sources` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `sourceName` VARCHAR(191) NOT NULL,
  `region` VARCHAR(191) NOT NULL,
  `sourceType` VARCHAR(191) NOT NULL,
  `baseUrl` TEXT NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT false,
  `notes` TEXT NOT NULL,
  `requiresApiKey` BOOLEAN NOT NULL DEFAULT false,
  `apiKeyEncrypted` LONGTEXT NULL,
  `lastSyncAt` DATETIME(3) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'Planned',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `job_board_sources_sourceName_region_key`(`sourceName`, `region`),
  INDEX `job_board_sources_enabled_sourceType_idx`(`enabled`, `sourceType`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
