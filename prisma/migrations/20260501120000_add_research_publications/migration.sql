CREATE TABLE IF NOT EXISTS `research_publications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `short_summary` TEXT NOT NULL,
    `publication_type` VARCHAR(191) NOT NULL,
    `research_area` VARCHAR(191) NOT NULL,
    `publisher_name` VARCHAR(191) NOT NULL,
    `published_date` DATETIME(3) NOT NULL,
    `doi` TEXT NULL,
    `publication_url` TEXT NOT NULL,
    `citation_url` TEXT NULL,
    `authors` JSON NULL,
    `my_author_role` VARCHAR(191) NULL,
    `thumbnail_image` TEXT NULL,
    `is_featured` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(191) NOT NULL DEFAULT 'published',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `research_publications_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @database_name = DATABASE();

SET @add_views_column = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = @database_name
        AND table_name = 'research_publications'
        AND column_name = 'views'
    ),
    'SELECT 1',
    'ALTER TABLE `research_publications` ADD COLUMN `views` INTEGER NOT NULL DEFAULT 0'
  )
);
PREPARE add_views_column_stmt FROM @add_views_column;
EXECUTE add_views_column_stmt;
DEALLOCATE PREPARE add_views_column_stmt;

SET @add_impression_count_column = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = @database_name
        AND table_name = 'research_publications'
        AND column_name = 'impression_count'
    ),
    'SELECT 1',
    'ALTER TABLE `research_publications` ADD COLUMN `impression_count` INTEGER NOT NULL DEFAULT 0'
  )
);
PREPARE add_impression_count_column_stmt FROM @add_impression_count_column;
EXECUTE add_impression_count_column_stmt;
DEALLOCATE PREPARE add_impression_count_column_stmt;

SET @add_share_count_column = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = @database_name
        AND table_name = 'research_publications'
        AND column_name = 'share_count'
    ),
    'SELECT 1',
    'ALTER TABLE `research_publications` ADD COLUMN `share_count` INTEGER NOT NULL DEFAULT 0'
  )
);
PREPARE add_share_count_column_stmt FROM @add_share_count_column;
EXECUTE add_share_count_column_stmt;
DEALLOCATE PREPARE add_share_count_column_stmt;

SET @create_publication_type_index = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = @database_name
        AND table_name = 'research_publications'
        AND index_name = 'research_publications_publication_type_idx'
    ),
    'SELECT 1',
    'CREATE INDEX `research_publications_publication_type_idx` ON `research_publications` (`publication_type`)'
  )
);
PREPARE create_publication_type_index_stmt FROM @create_publication_type_index;
EXECUTE create_publication_type_index_stmt;
DEALLOCATE PREPARE create_publication_type_index_stmt;

SET @create_research_area_index = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = @database_name
        AND table_name = 'research_publications'
        AND index_name = 'research_publications_research_area_idx'
    ),
    'SELECT 1',
    'CREATE INDEX `research_publications_research_area_idx` ON `research_publications` (`research_area`)'
  )
);
PREPARE create_research_area_index_stmt FROM @create_research_area_index;
EXECUTE create_research_area_index_stmt;
DEALLOCATE PREPARE create_research_area_index_stmt;

SET @create_status_index = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = @database_name
        AND table_name = 'research_publications'
        AND index_name = 'research_publications_status_idx'
    ),
    'SELECT 1',
    'CREATE INDEX `research_publications_status_idx` ON `research_publications` (`status`)'
  )
);
PREPARE create_status_index_stmt FROM @create_status_index;
EXECUTE create_status_index_stmt;
DEALLOCATE PREPARE create_status_index_stmt;

SET @create_is_featured_index = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = @database_name
        AND table_name = 'research_publications'
        AND index_name = 'research_publications_is_featured_idx'
    ),
    'SELECT 1',
    'CREATE INDEX `research_publications_is_featured_idx` ON `research_publications` (`is_featured`)'
  )
);
PREPARE create_is_featured_index_stmt FROM @create_is_featured_index;
EXECUTE create_is_featured_index_stmt;
DEALLOCATE PREPARE create_is_featured_index_stmt;

SET @create_published_date_index = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = @database_name
        AND table_name = 'research_publications'
        AND index_name = 'research_publications_published_date_idx'
    ),
    'SELECT 1',
    'CREATE INDEX `research_publications_published_date_idx` ON `research_publications` (`published_date`)'
  )
);
PREPARE create_published_date_index_stmt FROM @create_published_date_index;
EXECUTE create_published_date_index_stmt;
DEALLOCATE PREPARE create_published_date_index_stmt;
