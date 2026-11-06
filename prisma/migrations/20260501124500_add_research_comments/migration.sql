CREATE TABLE IF NOT EXISTS `researchcomment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `publication_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `comment` TEXT NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `researchcomment_publication_id_idx`(`publication_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `researchcomment_publication_id_fkey`
      FOREIGN KEY (`publication_id`) REFERENCES `research_publications`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `researchreply` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `comment_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `reply` TEXT NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `researchreply_comment_id_idx`(`comment_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `researchreply_comment_id_fkey`
      FOREIGN KEY (`comment_id`) REFERENCES `researchcomment`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
