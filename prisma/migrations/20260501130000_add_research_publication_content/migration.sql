SET @database_name = DATABASE();

SET @add_content_column = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = @database_name
        AND table_name = 'research_publications'
        AND column_name = 'content'
    ),
    'SELECT 1',
    'ALTER TABLE `research_publications` ADD COLUMN `content` LONGTEXT NULL'
  )
);
PREPARE add_content_column_stmt FROM @add_content_column;
EXECUTE add_content_column_stmt;
DEALLOCATE PREPARE add_content_column_stmt;
