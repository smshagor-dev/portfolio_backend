-- AlterTable
ALTER TABLE `Service`
    ADD COLUMN `slug` VARCHAR(191) NULL,
    ADD COLUMN `impression` VARCHAR(191) NULL;

UPDATE `Service`
SET
    `slug` = CASE
        WHEN LOWER(TRIM(`name`)) = 'full-stack product development' THEN 'full-stack-product-development'
        WHEN LOWER(TRIM(`name`)) = 'backend systems and api engineering' THEN 'backend-systems-and-api-engineering'
        WHEN LOWER(TRIM(`name`)) = 'performance, deployment, and support' THEN 'performance-deployment-and-support'
        ELSE CONCAT('service-', `id`)
    END,
    `impression` = CASE
        WHEN LOWER(TRIM(`name`)) = 'full-stack product development' THEN 'Fast, scalable delivery for modern digital products.'
        WHEN LOWER(TRIM(`name`)) = 'backend systems and api engineering' THEN 'Reliable API architecture built for long-term growth.'
        WHEN LOWER(TRIM(`name`)) = 'performance, deployment, and support' THEN 'Launch support that stays useful after day one.'
        ELSE COALESCE(NULLIF(SUBSTRING(`description`, 1, 191), ''), 'Service impression')
    END;

ALTER TABLE `Service`
    MODIFY `slug` VARCHAR(191) NOT NULL,
    MODIFY `impression` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `ServiceComment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serviceId` INTEGER NOT NULL,
    `photo` VARCHAR(191) NOT NULL,
    `comment` TEXT NOT NULL,
    `impression` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceReply` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `commentId` INTEGER NOT NULL,
    `reply` TEXT NOT NULL,
    `impression` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Service_slug_key` ON `Service`(`slug`);

-- AddForeignKey
ALTER TABLE `ServiceComment` ADD CONSTRAINT `ServiceComment_serviceId_fkey`
    FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceReply` ADD CONSTRAINT `ServiceReply_commentId_fkey`
    FOREIGN KEY (`commentId`) REFERENCES `ServiceComment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
