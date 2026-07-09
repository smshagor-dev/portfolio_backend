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
