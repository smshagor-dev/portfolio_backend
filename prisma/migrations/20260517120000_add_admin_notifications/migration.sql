CREATE TABLE `AdminNotification` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('NEW_MESSAGE', 'MESSAGE_REPLY') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NULL,
    `visitorName` VARCHAR(191) NULL,
    `visitorEmail` VARCHAR(191) NULL,
    `visitorPhone` VARCHAR(191) NULL,
    `messageId` INTEGER NULL,
    `conversationId` INTEGER NULL,
    `preview` TEXT NULL,
    `actionUrl` VARCHAR(191) NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `AdminNotification_isRead_createdAt_idx` ON `AdminNotification`(`isRead`, `createdAt`);
CREATE INDEX `AdminNotification_messageId_conversationId_idx` ON `AdminNotification`(`messageId`, `conversationId`);
