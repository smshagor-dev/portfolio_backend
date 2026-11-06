ALTER TABLE `SiteSettings`
    ADD COLUMN `adsenseHeadCode` LONGTEXT NULL,
    ADD COLUMN `adsensePageTopCode` LONGTEXT NULL,
    ADD COLUMN `adsenseBetweenSectionsCode` LONGTEXT NULL,
    ADD COLUMN `adsensePageBottomCode` LONGTEXT NULL;

UPDATE `SiteSettings`
SET
    `adsenseHeadCode` = COALESCE(`adsenseHeadCode`, ''),
    `adsensePageTopCode` = COALESCE(`adsensePageTopCode`, ''),
    `adsenseBetweenSectionsCode` = COALESCE(`adsenseBetweenSectionsCode`, ''),
    `adsensePageBottomCode` = COALESCE(`adsensePageBottomCode`, '');

ALTER TABLE `SiteSettings`
    MODIFY `adsenseHeadCode` LONGTEXT NOT NULL,
    MODIFY `adsensePageTopCode` LONGTEXT NOT NULL,
    MODIFY `adsenseBetweenSectionsCode` LONGTEXT NOT NULL,
    MODIFY `adsensePageBottomCode` LONGTEXT NOT NULL;
