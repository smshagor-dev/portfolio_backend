ALTER TABLE `job_board_sources`
  ADD COLUMN `companyName` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `careersUrl` TEXT NULL,
  ADD COLUMN `detectedProvider` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `extractionStatus` VARCHAR(191) NOT NULL DEFAULT 'UNSUPPORTED',
  ADD COLUMN `extractionMessage` TEXT NULL,
  ADD COLUMN `selectorConfigJson` JSON NULL,
  ADD COLUMN `lastImportStatsJson` JSON NULL;

UPDATE `job_board_sources`
SET
  `companyName` = CASE WHEN `companyName` = '' THEN `sourceName` ELSE `companyName` END,
  `careersUrl` = CASE WHEN `careersUrl` IS NULL THEN `baseUrl` ELSE `careersUrl` END,
  `extractionStatus` = CASE
    WHEN `status` LIKE '%Ready%' THEN 'READY'
    WHEN `status` LIKE '%Manual%' THEN 'NEEDS_MANUAL_DESCRIPTION'
    ELSE 'UNSUPPORTED'
  END,
  `extractionMessage` = CASE WHEN `extractionMessage` IS NULL THEN `notes` ELSE `extractionMessage` END;

ALTER TABLE `job_board_sources`
  MODIFY `careersUrl` TEXT NOT NULL,
  MODIFY `extractionMessage` TEXT NOT NULL;

CREATE TABLE `job_source_import_runs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `sourceId` INTEGER NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `startedAt` DATETIME(3) NOT NULL,
  `finishedAt` DATETIME(3) NULL,
  `importedCount` INTEGER NOT NULL DEFAULT 0,
  `duplicateCount` INTEGER NOT NULL DEFAULT 0,
  `needsDescriptionCount` INTEGER NOT NULL DEFAULT 0,
  `errorMessage` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `job_source_import_runs_sourceId_createdAt_idx`(`sourceId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `job_source_import_runs`
  ADD CONSTRAINT `job_source_import_runs_sourceId_fkey`
  FOREIGN KEY (`sourceId`) REFERENCES `job_board_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
