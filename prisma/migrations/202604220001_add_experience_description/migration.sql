ALTER TABLE `Experience`
    ADD COLUMN `description` LONGTEXT NULL;

UPDATE `Experience`
SET `description` = ''
WHERE `description` IS NULL;

ALTER TABLE `Experience`
    MODIFY `description` LONGTEXT NOT NULL;
