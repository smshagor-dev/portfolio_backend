ALTER TABLE `AdminUser`
    ADD COLUMN `twoFactorSecret` VARCHAR(191) NULL,
    ADD COLUMN `twoFactorEnabled` BOOLEAN NOT NULL DEFAULT false;
