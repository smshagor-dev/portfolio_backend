ALTER TABLE `Education`
    ADD COLUMN `department` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `achievement` LONGTEXT NULL;

UPDATE `Education`
SET `achievement` = ''
WHERE `achievement` IS NULL;

ALTER TABLE `Education`
    MODIFY `achievement` LONGTEXT NOT NULL;
