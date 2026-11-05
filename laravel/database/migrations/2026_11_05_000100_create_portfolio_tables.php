<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('profiles', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('name', 255);
            $table->string('profile', 255);
            $table->string('designation', 255);
            $table->longText('description')->nullable();
            $table->string('email', 255);
            $table->string('phone', 255);
            $table->string('address', 255);
            $table->string('github', 255);
            $table->string('facebook', 255);
            $table->string('linkedIn', 255);
            $table->string('twitter', 255);
            $table->string('stackOverflow', 255);
            $table->string('leetcode', 255);
            $table->json('socialLinks')->nullable();
            $table->string('devUsername', 255);
            $table->string('resume', 255);
            $table->json('heroSkills')->nullable();
            $table->boolean('hardWorker')->default(true);
            $table->boolean('quickLearner')->default(true);
            $table->boolean('problemSolver')->default(true);
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('skills', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('name', 191);
            $table->unique('name', 'skills_name_u');
            $table->string('image', 255)->default('');
            $table->integer('percentage')->default(0);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('experiences', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('title', 255);
            $table->string('company', 255);
            $table->string('location', 255);
            $table->string('duration', 255);
            $table->longText('description')->nullable();
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('educations', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('title', 255);
            $table->string('duration', 255);
            $table->string('institution', 255);
            $table->string('department', 255);
            $table->string('achievement', 255);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('stats_counters', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('label', 255);
            $table->string('highlight', 255);
            $table->string('count', 255);
            $table->string('icon', 255);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('achievements', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('title', 255);
            $table->string('issuer', 255);
            $table->string('date', 255);
            $table->string('type', 255);
            $table->string('image', 255)->default('');
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('service_sections', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('title', 255);
            $table->string('subtitle', 255);
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('services', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('slug', 191);
            $table->unique('slug', 'services_slug_u');
            $table->string('name', 255);
            $table->string('impression', 255);
            $table->integer('impressionCount')->default(0);
            $table->longText('description')->nullable();
            $table->longText('content')->nullable();
            $table->boolean('isFeatured')->default(false);
            $table->string('icon', 255);
            $table->boolean('status')->default(true);
            $table->integer('views')->default(0);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('service_comments', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('serviceId');
            $table->string('photo', 255);
            $table->string('comment', 255);
            $table->string('impression', 255);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('service_replies', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('commentId');
            $table->string('reply', 255);
            $table->string('impression', 255);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('projects', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('slug', 191);
            $table->unique('slug', 'projects_slug_u');
            $table->string('name', 255);
            $table->longText('description')->nullable();
            $table->longText('content')->nullable();
            $table->json('tools')->nullable();
            $table->string('role', 255);
            $table->string('code', 255);
            $table->string('demo', 255);
            $table->string('image', 255)->default('');
            $table->integer('views')->default(0);
            $table->integer('impressionCount')->default(0);
            $table->json('buttons')->nullable();
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('project_comments', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('projectId');
            $table->string('name', 255);
            $table->string('comment', 255);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('project_replies', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('commentId');
            $table->string('name', 255);
            $table->string('reply', 255);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('pricings', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('slug', 191);
            $table->unique('slug', 'pricings_slug_u');
            $table->string('name', 255);
            $table->longText('description')->nullable();
            $table->double('price');
            $table->string('duration', 255);
            $table->longText('content')->nullable();
            $table->json('features')->nullable();
            $table->boolean('status')->default(true);
            $table->boolean('isPopular')->default(false);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('faqs', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('question', 255);
            $table->string('answer', 255);
            $table->boolean('status')->default(true);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('testimonials', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('name', 255);
            $table->longText('content')->nullable();
            $table->string('image', 255)->default('');
            $table->string('company', 255);
            $table->string('position', 255)->default('');
            $table->integer('stars')->default(5);
            $table->boolean('status')->default(true);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('articles', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('title', 255);
            $table->string('slug', 191);
            $table->unique('slug', 'articles_slug_u');
            $table->longText('shortDescription')->nullable();
            $table->longText('content')->nullable();
            $table->string('category', 191);
            $table->json('tags')->nullable();
            $table->string('featuredImage', 255)->default('');
            $table->string('metaTitle', 255)->default('');
            $table->longText('metaDescription')->nullable();
            $table->string('author', 255);
            $table->string('status', 191)->default('draft');
            $table->dateTime('publishDate')->nullable();
            $table->boolean('commentsEnabled')->default(true);
            $table->boolean('isFeatured')->default(false);
            $table->integer('views')->default(0);
            $table->integer('impressionCount')->default(0);
            $table->integer('shareCount')->default(0);
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
            $table->index(['status', 'publishDate'], 'articles_status_publishate_i');
            $table->index(['category'], 'articles_category_i');
        });

        Schema::create('research_publications', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('title', 255);
            $table->string('slug', 191);
            $table->unique('slug', 'research_publications_slug_u');
            $table->longText('shortSummary')->nullable();
            $table->longText('content')->nullable();
            $table->string('publicationType', 191);
            $table->string('researchArea', 191);
            $table->string('publisherName', 255);
            $table->dateTime('publishedDate');
            $table->string('doi', 255)->nullable();
            $table->string('publicationUrl', 255);
            $table->string('citationUrl', 255)->nullable();
            $table->json('authors')->nullable();
            $table->string('myAuthorRole', 255)->nullable();
            $table->string('thumbnailImage', 255)->nullable();
            $table->integer('views')->default(0);
            $table->integer('impressionCount')->default(0);
            $table->integer('shareCount')->default(0);
            $table->boolean('isFeatured')->default(false);
            $table->string('status', 191)->default('published');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
            $table->index(['publicationType'], 'research_publicat_publicationype_i');
            $table->index(['researchArea'], 'research_publicat_researchrea_i');
            $table->index(['status'], 'research_publicat_status_i');
            $table->index(['isFeatured'], 'research_publicat_iseatured_i');
            $table->index(['publishedDate'], 'research_publicat_publishedate_i');
        });

        Schema::create('research_comments', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('publicationId');
            $table->string('name', 255);
            $table->string('comment', 255);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
            $table->index(['publicationId'], 'research_comments_publicationd_i');
        });

        Schema::create('research_replies', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('commentId');
            $table->string('name', 255);
            $table->string('reply', 255);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
            $table->index(['commentId'], 'research_replies_commentd_i');
        });

        Schema::create('article_comments', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('articleId');
            $table->string('name', 255);
            $table->string('comment', 255);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('article_replies', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('commentId');
            $table->string('name', 255);
            $table->string('reply', 255);
            $table->integer('sortOrder');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('article_categories', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('name', 191);
            $table->unique('name', 'article_categories_name_u');
            $table->string('slug', 191);
            $table->unique('slug', 'article_categories_slug_u');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('article_category_assignments', function (Blueprint $table): void {
            $table->string('id', 64)->primary();
            $table->unsignedBigInteger('articleId');
            $table->unsignedBigInteger('categoryId');
            $table->unique(['articleId', 'categoryId'], 'article_category__articled_categoryd_u');
            $table->index(['categoryId'], 'article_category__categoryd_i');
        });

        Schema::create('contact_messages', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('name', 255);
            $table->string('email', 255);
            $table->string('subject', 255)->default('');
            $table->longText('message')->nullable();
            $table->string('photo', 255)->default('');
            $table->string('file', 255)->default('');
            $table->string('status', 255)->default('not_solved');
            $table->string('ticketToken', 191);
            $table->unique('ticketToken', 'contact_messages_ticketToken_u');
            $table->dateTime('createdAt')->useCurrent();
        });

        Schema::create('contact_chat_messages', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('contactMessageId');
            $table->string('senderType', 255);
            $table->string('senderName', 255)->default('');
            $table->longText('message')->nullable();
            $table->string('photo', 255)->default('');
            $table->string('file', 255)->default('');
            $table->dateTime('createdAt')->useCurrent();
            $table->index(['contactMessageId', 'createdAt'], 'contact_chat_mess_contactessaged_created_i');
        });

        Schema::create('admin_notifications', function (Blueprint $table): void {
            $table->string('id', 64)->primary();
            $table->string('type', 255);
            $table->string('title', 255);
            $table->longText('body')->nullable();
            $table->string('visitorName', 255)->nullable();
            $table->string('visitorEmail', 255)->nullable();
            $table->string('visitorPhone', 255)->nullable();
            $table->integer('messageId')->nullable();
            $table->integer('conversationId')->nullable();
            $table->string('preview', 255)->nullable();
            $table->string('actionUrl', 255)->nullable();
            $table->boolean('isRead')->default(false);
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
            $table->index(['isRead', 'createdAt'], 'admin_notificatio_isead_createdt_i');
            $table->index(['messageId', 'conversationId'], 'admin_notificatio_messaged_conversationd_i');
        });

        Schema::create('emergency_contacts', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('label', 255);
            $table->string('name', 255);
            $table->string('icon', 255);
            $table->string('link', 255);
            $table->integer('sortOrder')->default(1);
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('admin_users', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('name', 255);
            $table->string('email', 191);
            $table->unique('email', 'admin_users_email_u');
            $table->string('passwordHash', 255);
            $table->string('twoFactorSecret', 255)->nullable();
            $table->boolean('twoFactorEnabled')->default(false);
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('ai_providers', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('name', 191);
            $table->unique('name', 'ai_providers_name_u');
            $table->string('apiKey', 255);
            $table->string('baseUrl', 255)->default('');
            $table->boolean('isActive')->default(false);
            $table->dateTime('createdAt')->useCurrent();
        });

        Schema::create('ai_settingses', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('activeProvider', 255);
            $table->string('modelName', 255);
            $table->dateTime('createdAt')->useCurrent();
        });

        Schema::create('ai_training_entries', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('question', 255);
            $table->string('answer', 255);
            $table->boolean('isActive')->default(true);
            $table->dateTime('createdAt')->useCurrent();
        });

        Schema::create('site_settingses', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('websiteTitle', 255);
            $table->longText('websiteDescription')->nullable();
            $table->string('navTitle', 255);
            $table->string('navSubtitle', 255);
            $table->string('seoTitle', 255);
            $table->longText('seoDescription')->nullable();
            $table->string('seoKeywords', 255);
            $table->string('seoImage', 255);
            $table->string('websiteIcon', 255);
            $table->longText('heroHeaderText')->nullable();
            $table->longText('heroDescription')->nullable();
            $table->string('heroImage', 255);
            $table->string('contactEmail', 255);
            $table->string('mobileNumber', 255);
            $table->longText('footerText')->nullable();
            $table->longText('privacyPolicyHtml')->nullable();
            $table->longText('termsConditionsHtml')->nullable();
            $table->string('canonicalUrl', 255);
            $table->string('googleSiteVerification', 255);
            $table->string('googleVerificationFilePath', 255);
            $table->string('googleAnalyticsId', 255);
            $table->string('googleTagManagerId', 255);
            $table->string('adsenseHeadCode', 255);
            $table->string('adsensePageTopCode', 255);
            $table->string('adsenseBetweenSectionsCode', 255);
            $table->string('adsensePageBottomCode', 255);
            $table->boolean('robotsIndexingEnabled')->default(true);
            $table->boolean('robotsFollowEnabled')->default(true);
            $table->string('smtpHost', 255);
            $table->integer('smtpPort')->default(587);
            $table->string('smtpUser', 255);
            $table->string('smtpPass', 255);
            $table->boolean('smtpSecure')->default(false);
            $table->string('smtpFromEmail', 255);
            $table->string('smtpFromName', 255);
            $table->string('smtpReplyToEmail', 255);
            $table->string('smtpToEmail', 255);
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('analytics_sessions', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('sessionId', 191);
            $table->unique('sessionId', 'analytics_sessions_sessionId_u');
            $table->string('firstPath', 255)->default('/');
            $table->string('lastPath', 255)->default('/');
            $table->string('ipAddress', 255)->default('');
            $table->string('country', 255)->default('');
            $table->string('region', 255)->default('');
            $table->string('city', 255)->default('');
            $table->string('userAgent', 255)->nullable();
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('lastSeenAt')->useCurrent();
        });

        Schema::create('analytics_daily_visits', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('sessionRef');
            $table->dateTime('visitDate');
            $table->string('path', 255)->default('/');
            $table->dateTime('createdAt')->useCurrent();
            $table->unique(['sessionRef', 'visitDate'], 'analytics_daily_v_sessionef_visitate_u');
            $table->index(['visitDate'], 'analytics_daily_v_visitate_i');
        });

        Schema::create('analytics_page_views', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('sessionRef');
            $table->string('path', 191)->default('/');
            $table->dateTime('firstViewedAt')->useCurrent();
            $table->dateTime('lastViewedAt')->useCurrent();
            $table->integer('viewCount')->default(1);
            $table->unique(['sessionRef', 'path'], 'analytics_page_vi_sessionef_path_u');
            $table->index(['lastViewedAt'], 'analytics_page_vi_lastiewedt_i');
        });

        Schema::create('cv_profiles', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('title', 255)->default('Optional CV Notes');
            $table->longText('extraNotes')->nullable();
            $table->json('targetRoles')->nullable();
            $table->json('preferredCountries')->nullable();
            $table->string('resumeUrl', 255)->default('');
            $table->string('resumeFileName', 255)->default('');
            $table->dateTime('resumeUpdatedAt')->nullable();
            $table->boolean('isDefault')->default(true);
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('job_sources', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('name', 255);
            $table->string('type', 191);
            $table->string('provider', 191);
            $table->string('status', 255)->default('active');
            $table->json('config')->nullable();
            $table->dateTime('lastSyncedAt')->nullable();
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
            $table->index(['type', 'provider'], 'job_sources_type_provider_i');
        });

        Schema::create('job_posts', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('sourceId')->nullable();
            $table->string('sourceType', 191);
            $table->string('externalId', 191)->nullable();
            $table->string('sourceEmail', 255)->default('');
            $table->string('sourceSubject', 255)->default('');
            $table->string('sourcePlatform', 255)->default('');
            $table->string('emailSubject', 255)->default('');
            $table->string('title', 255);
            $table->string('company', 191);
            $table->string('location', 255)->default('');
            $table->string('sourceUrl', 255);
            $table->string('applyUrl', 255);
            $table->string('companyUrl', 255);
            $table->json('extractedUrls')->nullable();
            $table->string('jobType', 255)->default('');
            $table->string('workMode', 255)->default('');
            $table->string('region', 255)->default('');
            $table->longText('experienceLevel')->nullable();
            $table->string('sourceName', 255)->default('');
            $table->string('importMethod', 191)->default('');
            $table->string('descriptionStatus', 191)->default('READY');
            $table->string('searchKeywordMatched', 255)->default('');
            $table->longText('description')->nullable();
            $table->longText('rawContent')->nullable();
            $table->string('status', 191)->default('new');
            $table->string('contactDiscoveryStatus', 255)->default('pending');
            $table->string('contactDiscoveryError', 255)->default('');
            $table->dateTime('lastContactDiscoveryAt')->nullable();
            $table->dateTime('receivedAt')->nullable();
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
            $table->index(['sourceType', 'externalId'], 'job_posts_sourceype_externald_i');
            $table->index(['status', 'createdAt'], 'job_posts_status_createdt_i');
            $table->index(['company'], 'job_posts_company_i');
            $table->index(['descriptionStatus'], 'job_posts_descriptiontatus_i');
            $table->index(['importMethod'], 'job_posts_importethod_i');
        });

        Schema::create('job_search_preferences', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->json('rolesJson')->nullable();
            $table->json('customKeywordsJson')->nullable();
            $table->json('jobTypesJson')->nullable();
            $table->json('workModesJson')->nullable();
            $table->json('regionsJson')->nullable();
            $table->json('experienceLevelsJson')->nullable();
            $table->json('preferredLanguagesJson')->nullable();
            $table->integer('maxJobsPerSync')->default(25);
            $table->integer('minimumMatchScoreToDraft')->default(60);
            $table->boolean('autoDraftEnabled')->default(false);
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('job_board_sources', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('sourceName', 191);
            $table->string('companyName', 255)->default('');
            $table->string('region', 191);
            $table->string('sourceType', 191);
            $table->string('baseUrl', 255);
            $table->string('careersUrl', 255);
            $table->string('detectedProvider', 255)->default('');
            $table->string('extractionStatus', 255)->default('UNSUPPORTED');
            $table->longText('extractionMessage')->nullable();
            $table->json('selectorConfigJson')->nullable();
            $table->json('lastImportStatsJson')->nullable();
            $table->boolean('enabled')->default(false);
            $table->longText('notes')->nullable();
            $table->boolean('requiresApiKey')->default(false);
            $table->string('apiKeyEncrypted', 255)->nullable();
            $table->dateTime('lastSyncAt')->nullable();
            $table->string('status', 255)->default('Planned');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
            $table->unique(['sourceName', 'region'], 'job_board_sources_sourceame_region_u');
            $table->index(['enabled', 'sourceType'], 'job_board_sources_enabled_sourceype_i');
        });

        Schema::create('job_source_import_runs', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('sourceId');
            $table->string('status', 255);
            $table->dateTime('startedAt');
            $table->dateTime('finishedAt')->nullable();
            $table->integer('importedCount')->default(0);
            $table->integer('duplicateCount')->default(0);
            $table->integer('needsDescriptionCount')->default(0);
            $table->longText('errorMessage')->nullable();
            $table->dateTime('createdAt')->useCurrent();
            $table->index(['sourceId', 'createdAt'], 'job_source_import_sourced_createdt_i');
        });

        Schema::create('job_matchs', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('jobPostId');
            $table->unsignedBigInteger('cvProfileId')->nullable();
            $table->integer('score');
            $table->json('matchedSkills')->nullable();
            $table->json('missingSkills')->nullable();
            $table->longText('summary')->nullable();
            $table->json('aiAnalysis')->nullable();
            $table->longText('coverLetter')->nullable();
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
            $table->index(['jobPostId', 'cvProfileId'], 'job_matchs_jobostd_cvrofiled_i');
            $table->index(['score'], 'job_matchs_score_i');
        });

        Schema::create('recruiter_contacts', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('jobPostId')->nullable();
            $table->string('name', 255)->default('');
            $table->string('email', 191);
            $table->string('companyName', 255)->default('');
            $table->string('companyDomain', 255)->default('');
            $table->string('source', 255);
            $table->string('sourceUrl', 255);
            $table->string('discoveryMethod', 255)->default('');
            $table->string('validationStatus', 255)->default('pending');
            $table->string('contactEmailStatus', 255)->default('pending');
            $table->integer('confidenceScore')->default(0);
            $table->boolean('isRecruiter')->default(false);
            $table->boolean('isHiringManager')->default(false);
            $table->json('evidence')->nullable();
            $table->dateTime('lastVerifiedAt')->nullable();
            $table->longText('errorMessage')->nullable();
            $table->string('verification', 255)->default('manual');
            $table->boolean('verified')->default(false);
            $table->longText('publicContext')->nullable();
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
            $table->index(['email'], 'recruiter_contact_email_i');
        });

        Schema::create('job_email_drafts', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('jobPostId');
            $table->unsignedBigInteger('recruiterContactId')->nullable();
            $table->string('toEmail', 255)->default('');
            $table->string('subject', 255);
            $table->longText('body')->nullable();
            $table->string('trackingId', 191);
            $table->unique('trackingId', 'job_email_drafts_trackingId_u');
            $table->string('aiProvider', 255)->default('');
            $table->string('aiModel', 255)->default('');
            $table->longText('emailPromptUsed')->nullable();
            $table->longText('coverLetterPromptUsed')->nullable();
            $table->longText('coverLetterText')->nullable();
            $table->longText('coverLetterPdfUrl')->nullable();
            $table->string('cvUrl', 255)->default('');
            $table->boolean('adminApprovalRequired')->default(true);
            $table->string('approvalStatus', 255)->default('PENDING');
            $table->string('status', 191)->default('DRAFT');
            $table->dateTime('approvedAt')->nullable();
            $table->string('approvedBy', 255)->default('');
            $table->dateTime('rejectedAt')->nullable();
            $table->longText('rejectionReason')->nullable();
            $table->dateTime('sentAt')->nullable();
            $table->dateTime('openedAt')->nullable();
            $table->dateTime('lastOpenedAt')->nullable();
            $table->integer('openCount')->default(0);
            $table->dateTime('clickedAt')->nullable();
            $table->integer('clickCount')->default(0);
            $table->longText('providerMessageId')->nullable();
            $table->string('sendStatus', 255)->default('pending');
            $table->longText('skipReason')->nullable();
            $table->longText('errorMessage')->nullable();
            $table->dateTime('lastSendAttemptAt')->nullable();
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
            $table->index(['status', 'createdAt'], 'job_email_drafts_status_createdt_i');
            $table->index(['sentAt'], 'job_email_drafts_sentt_i');
        });

        Schema::create('job_agent_settingses', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('gmailConnectedEmail', 255)->default('');
            $table->string('gmailRefreshToken', 255)->default('');
            $table->string('gmailHistoryId', 255)->default('');
            $table->string('gmailQuery', 255)->default('(from:linkedin OR from:indeed OR subject:(job alert) OR subject:(jobs for you)) newer_than:30d');
            $table->integer('dailySendLimit')->default(5);
            $table->integer('sendsToday')->default(0);
            $table->dateTime('sendLimitDate')->nullable();
            $table->boolean('autoSendEnabled')->default(false);
            $table->integer('defaultCvProfileId')->nullable();
            $table->json('approvedApiSources')->nullable();
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('job_agent_email_settings', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->integer('adminId')->nullable();
            $table->string('fromName', 255)->default('');
            $table->string('fromEmail', 255)->default('');
            $table->string('smtpHost', 255)->default('smtp.gmail.com');
            $table->integer('smtpPort')->default(465);
            $table->boolean('smtpSecure')->default(true);
            $table->string('smtpUsername', 255)->default('');
            $table->string('smtpPasswordEncrypted', 255)->default('');
            $table->integer('dailySendLimit')->default(5);
            $table->boolean('isEnabled')->default(false);
            $table->boolean('openTrackingEnabled')->default(false);
            $table->boolean('clickTrackingEnabled')->default(false);
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });

        Schema::create('job_agent_email_events', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('draftId');
            $table->integer('jobPostId');
            $table->longText('recipientEmail')->nullable();
            $table->string('eventType', 191);
            $table->string('trackingId', 191);
            $table->string('url', 255);
            $table->string('userAgent', 255);
            $table->string('ipHash', 255)->default('');
            $table->dateTime('createdAt')->useCurrent();
            $table->index(['draftId', 'eventType', 'createdAt'], 'job_agent_email_e_draftd_eventype_create_i');
            $table->index(['trackingId'], 'job_agent_email_e_trackingd_i');
            $table->index(['jobPostId'], 'job_agent_email_e_jobostd_i');
        });

        Schema::create('job_agent_ai_settings', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('aiProvider', 255)->default('DEEPSEEK');
            $table->string('aiModel', 255)->default('deepseek-chat');
            $table->string('deepseekApiKeyEncrypted', 255)->nullable();
            $table->string('geminiApiKeyEncrypted', 255)->nullable();
            $table->string('openaiApiKeyEncrypted', 255)->nullable();
            $table->string('fallbackProvider', 255)->nullable();
            $table->boolean('fallbackEnabled')->default(false);
            $table->longText('systemPrompt')->nullable();
            $table->longText('recruiterEmailPrompt')->nullable();
            $table->longText('coverLetterPrompt')->nullable();
            $table->string('tone', 255)->default('professional-natural');
            $table->integer('maxEmailWords')->default(160);
            $table->integer('maxCoverLetterWords')->default(450);
            $table->boolean('requireAdminApproval')->default(true);
            $table->boolean('attachCv')->default(true);
            $table->boolean('attachCoverLetterPdf')->default(true);
            $table->boolean('autoGenerateCoverLetter')->default(true);
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_agent_ai_settings');
        Schema::dropIfExists('job_agent_email_events');
        Schema::dropIfExists('job_agent_email_settings');
        Schema::dropIfExists('job_agent_settingses');
        Schema::dropIfExists('job_email_drafts');
        Schema::dropIfExists('recruiter_contacts');
        Schema::dropIfExists('job_matchs');
        Schema::dropIfExists('job_source_import_runs');
        Schema::dropIfExists('job_board_sources');
        Schema::dropIfExists('job_search_preferences');
        Schema::dropIfExists('job_posts');
        Schema::dropIfExists('job_sources');
        Schema::dropIfExists('cv_profiles');
        Schema::dropIfExists('analytics_page_views');
        Schema::dropIfExists('analytics_daily_visits');
        Schema::dropIfExists('analytics_sessions');
        Schema::dropIfExists('site_settingses');
        Schema::dropIfExists('ai_training_entries');
        Schema::dropIfExists('ai_settingses');
        Schema::dropIfExists('ai_providers');
        Schema::dropIfExists('admin_users');
        Schema::dropIfExists('emergency_contacts');
        Schema::dropIfExists('admin_notifications');
        Schema::dropIfExists('contact_chat_messages');
        Schema::dropIfExists('contact_messages');
        Schema::dropIfExists('article_category_assignments');
        Schema::dropIfExists('article_categories');
        Schema::dropIfExists('article_replies');
        Schema::dropIfExists('article_comments');
        Schema::dropIfExists('research_replies');
        Schema::dropIfExists('research_comments');
        Schema::dropIfExists('research_publications');
        Schema::dropIfExists('articles');
        Schema::dropIfExists('testimonials');
        Schema::dropIfExists('faqs');
        Schema::dropIfExists('pricings');
        Schema::dropIfExists('project_replies');
        Schema::dropIfExists('project_comments');
        Schema::dropIfExists('projects');
        Schema::dropIfExists('service_replies');
        Schema::dropIfExists('service_comments');
        Schema::dropIfExists('services');
        Schema::dropIfExists('service_sections');
        Schema::dropIfExists('achievements');
        Schema::dropIfExists('stats_counters');
        Schema::dropIfExists('educations');
        Schema::dropIfExists('experiences');
        Schema::dropIfExists('skills');
        Schema::dropIfExists('profiles');
    }
};
