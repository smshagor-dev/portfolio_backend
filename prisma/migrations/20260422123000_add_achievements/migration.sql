CREATE TABLE `Achievement` (
    `id` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `issuer` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NOT NULL DEFAULT '',
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
);
