ALTER TABLE `SiteSettings`
    ADD COLUMN `navTitle` VARCHAR(191) NOT NULL DEFAULT 'Portfolio Website',
    ADD COLUMN `navSubtitle` VARCHAR(191) NOT NULL DEFAULT 'Software Developer';

UPDATE `SiteSettings`
SET
    `navTitle` = CASE
        WHEN TRIM(COALESCE(`websiteTitle`, '')) <> '' THEN `websiteTitle`
        ELSE 'Portfolio Website'
    END,
    `navSubtitle` = 'Software Developer'
WHERE `id` = 1;
