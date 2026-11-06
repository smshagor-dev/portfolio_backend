-- AlterTable
ALTER TABLE `Pricing`
    ADD COLUMN `slug` VARCHAR(191) NULL,
    ADD COLUMN `content` LONGTEXT NULL;

-- Backfill existing rows
UPDATE `Pricing`
SET
    `slug` = LOWER(REPLACE(`name`, ' ', '-')),
    `content` = CONCAT(
        '<h2>',
        `name`,
        ' overview</h2><p>',
        `description`,
        '</p><ul><li>Tailored delivery scope</li><li>Clear milestone planning</li><li>Reliable communication</li><li>Launch support</li></ul>'
    )
WHERE `slug` IS NULL OR `content` IS NULL;

-- Finalize constraints
ALTER TABLE `Pricing`
    MODIFY `slug` VARCHAR(191) NOT NULL,
    MODIFY `content` LONGTEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Pricing_slug_key` ON `Pricing`(`slug`);
