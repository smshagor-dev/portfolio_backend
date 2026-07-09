ALTER TABLE `ContactMessage`
    ADD COLUMN `ticketToken` VARCHAR(191) NOT NULL DEFAULT '';

UPDATE `ContactMessage`
SET `ticketToken` = CONCAT('legacy_', `id`)
WHERE `ticketToken` = '';

ALTER TABLE `ContactMessage`
    ADD UNIQUE INDEX `ContactMessage_ticketToken_key`(`ticketToken`);

CREATE TABLE `ContactChatMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contactMessageId` INTEGER NOT NULL,
    `senderType` VARCHAR(191) NOT NULL,
    `senderName` VARCHAR(191) NOT NULL DEFAULT '',
    `message` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ContactChatMessage_contactMessageId_createdAt_idx`(`contactMessageId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ContactChatMessage`
    ADD CONSTRAINT `ContactChatMessage_contactMessageId_fkey`
    FOREIGN KEY (`contactMessageId`) REFERENCES `ContactMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `ContactChatMessage` (`contactMessageId`, `senderType`, `senderName`, `message`, `createdAt`)
SELECT `id`, 'visitor', `name`, `message`, `createdAt`
FROM `ContactMessage`;
