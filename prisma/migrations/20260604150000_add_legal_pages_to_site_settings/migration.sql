ALTER TABLE `SiteSettings`
  ADD COLUMN `privacyPolicyHtml` LONGTEXT NULL,
  ADD COLUMN `termsConditionsHtml` LONGTEXT NULL;

UPDATE `SiteSettings`
SET
  `privacyPolicyHtml` = '<p>This privacy policy explains how this portfolio website handles visitor information, contact form submissions, analytics, and communication data.</p>',
  `termsConditionsHtml` = '<p>These terms and conditions explain the acceptable use of this portfolio website, its content, contact forms, and services information.</p>';

ALTER TABLE `SiteSettings`
  MODIFY COLUMN `privacyPolicyHtml` LONGTEXT NOT NULL,
  MODIFY COLUMN `termsConditionsHtml` LONGTEXT NOT NULL;
