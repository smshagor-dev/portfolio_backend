-- CreateTable
CREATE TABLE `AnalyticsSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` VARCHAR(191) NOT NULL,
    `firstPath` VARCHAR(191) NOT NULL DEFAULT '/',
    `lastPath` VARCHAR(191) NOT NULL DEFAULT '/',
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AnalyticsSession_sessionId_key`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalyticsDailyVisit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionRef` INTEGER NOT NULL,
    `visitDate` DATE NOT NULL,
    `path` VARCHAR(191) NOT NULL DEFAULT '/',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AnalyticsDailyVisit_visitDate_idx`(`visitDate`),
    UNIQUE INDEX `AnalyticsDailyVisit_sessionRef_visitDate_key`(`sessionRef`, `visitDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AnalyticsDailyVisit` ADD CONSTRAINT `AnalyticsDailyVisit_sessionRef_fkey` FOREIGN KEY (`sessionRef`) REFERENCES `AnalyticsSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
