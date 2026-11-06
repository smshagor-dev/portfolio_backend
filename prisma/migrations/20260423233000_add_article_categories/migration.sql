CREATE TABLE `ArticleCategory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ArticleCategory_name_key`(`name`),
    UNIQUE INDEX `ArticleCategory_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ArticleCategoryAssignment` (
    `articleId` INTEGER NOT NULL,
    `categoryId` INTEGER NOT NULL,

    INDEX `ArticleCategoryAssignment_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`articleId`, `categoryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ArticleCategoryAssignment`
ADD CONSTRAINT `ArticleCategoryAssignment_articleId_fkey`
FOREIGN KEY (`articleId`) REFERENCES `Article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ArticleCategoryAssignment`
ADD CONSTRAINT `ArticleCategoryAssignment_categoryId_fkey`
FOREIGN KEY (`categoryId`) REFERENCES `ArticleCategory`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
