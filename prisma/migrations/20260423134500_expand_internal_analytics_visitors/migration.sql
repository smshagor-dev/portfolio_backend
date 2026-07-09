-- AlterTable
ALTER TABLE `AnalyticsSession`
    ADD COLUMN `ipAddress` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `country` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `region` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `city` VARCHAR(191) NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE `AnalyticsPageView` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionRef` INTEGER NOT NULL,
    `path` VARCHAR(191) NOT NULL DEFAULT '/',
    `firstViewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastViewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `viewCount` INTEGER NOT NULL DEFAULT 1,

    INDEX `AnalyticsPageView_lastViewedAt_idx`(`lastViewedAt`),
    UNIQUE INDEX `AnalyticsPageView_sessionRef_path_key`(`sessionRef`, `path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AnalyticsPageView` ADD CONSTRAINT `AnalyticsPageView_sessionRef_fkey` FOREIGN KEY (`sessionRef`) REFERENCES `AnalyticsSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
