ALTER TABLE `Project`
    ADD COLUMN `slug` VARCHAR(191) NULL,
    ADD COLUMN `content` LONGTEXT NULL;

UPDATE `Project`
SET
    `slug` = CASE
        WHEN `slug` IS NOT NULL AND `slug` <> '' THEN `slug`
        ELSE REGEXP_REPLACE(
            REGEXP_REPLACE(LOWER(TRIM(`name`)), '[^a-z0-9]+', '-'),
            '(^-+|-+$)',
            ''
        )
    END,
    `content` = COALESCE(NULLIF(`content`, ''), `description`);

ALTER TABLE `Project`
    MODIFY `slug` VARCHAR(191) NOT NULL,
    MODIFY `content` LONGTEXT NOT NULL;

CREATE UNIQUE INDEX `Project_slug_key` ON `Project`(`slug`);
