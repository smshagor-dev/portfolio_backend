<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('service_comments', function (Blueprint $table): void {
            $table->foreign('serviceId', 'fk_0_service_comments_serviceId')->references('id')->on('services')->onDelete('cascade');
        });
        Schema::table('service_replies', function (Blueprint $table): void {
            $table->foreign('commentId', 'fk_1_service_replies_commentId')->references('id')->on('service_comments')->onDelete('cascade');
        });
        Schema::table('project_comments', function (Blueprint $table): void {
            $table->foreign('projectId', 'fk_2_project_comments_projectId')->references('id')->on('projects')->onDelete('cascade');
        });
        Schema::table('project_replies', function (Blueprint $table): void {
            $table->foreign('commentId', 'fk_3_project_replies_commentId')->references('id')->on('project_comments')->onDelete('cascade');
        });
        Schema::table('research_comments', function (Blueprint $table): void {
            $table->foreign('publicationId', 'fk_4_research_comments_publicationId')->references('id')->on('research_publications')->onDelete('cascade');
        });
        Schema::table('research_replies', function (Blueprint $table): void {
            $table->foreign('commentId', 'fk_5_research_replies_commentId')->references('id')->on('research_comments')->onDelete('cascade');
        });
        Schema::table('article_comments', function (Blueprint $table): void {
            $table->foreign('articleId', 'fk_6_article_comments_articleId')->references('id')->on('articles')->onDelete('cascade');
        });
        Schema::table('article_replies', function (Blueprint $table): void {
            $table->foreign('commentId', 'fk_7_article_replies_commentId')->references('id')->on('article_comments')->onDelete('cascade');
        });
        Schema::table('article_category_assignments', function (Blueprint $table): void {
            $table->foreign('articleId', 'fk_8_article_category_a_articleId')->references('id')->on('articles')->onDelete('cascade');
        });
        Schema::table('article_category_assignments', function (Blueprint $table): void {
            $table->foreign('categoryId', 'fk_9_article_category_a_categoryId')->references('id')->on('article_categories')->onDelete('cascade');
        });
        Schema::table('contact_chat_messages', function (Blueprint $table): void {
            $table->foreign('contactMessageId', 'fk_10_contact_chat_messa_contactMessageI')->references('id')->on('contact_messages')->onDelete('cascade');
        });
        Schema::table('analytics_daily_visits', function (Blueprint $table): void {
            $table->foreign('sessionRef', 'fk_11_analytics_daily_vi_sessionRef')->references('id')->on('analytics_sessions')->onDelete('cascade');
        });
        Schema::table('analytics_page_views', function (Blueprint $table): void {
            $table->foreign('sessionRef', 'fk_12_analytics_page_vie_sessionRef')->references('id')->on('analytics_sessions')->onDelete('cascade');
        });
        Schema::table('job_posts', function (Blueprint $table): void {
            $table->foreign('sourceId', 'fk_13_job_posts_sourceId')->references('id')->on('job_sources')->onDelete('set null');
        });
        Schema::table('job_source_import_runs', function (Blueprint $table): void {
            $table->foreign('sourceId', 'fk_14_job_source_import__sourceId')->references('id')->on('job_board_sources')->onDelete('cascade');
        });
        Schema::table('job_matches', function (Blueprint $table): void {
            $table->foreign('jobPostId', 'fk_15_job_matches_jobPostId')->references('id')->on('job_posts')->onDelete('cascade');
        });
        Schema::table('job_matches', function (Blueprint $table): void {
            $table->foreign('cvProfileId', 'fk_16_job_matches_cvProfileId')->references('id')->on('cv_profiles')->onDelete('set null');
        });
        Schema::table('recruiter_contacts', function (Blueprint $table): void {
            $table->foreign('jobPostId', 'fk_17_recruiter_contacts_jobPostId')->references('id')->on('job_posts')->onDelete('cascade');
        });
        Schema::table('job_email_drafts', function (Blueprint $table): void {
            $table->foreign('jobPostId', 'fk_18_job_email_drafts_jobPostId')->references('id')->on('job_posts')->onDelete('cascade');
        });
        Schema::table('job_email_drafts', function (Blueprint $table): void {
            $table->foreign('recruiterContactId', 'fk_19_job_email_drafts_recruiterContac')->references('id')->on('recruiter_contacts')->onDelete('set null');
        });
        Schema::table('job_agent_email_events', function (Blueprint $table): void {
            $table->foreign('draftId', 'fk_20_job_agent_email_ev_draftId')->references('id')->on('job_email_drafts')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('job_agent_email_events', function (Blueprint $table): void { $table->dropForeign('fk_20_job_agent_email_ev_draftId'); });
        Schema::table('job_email_drafts', function (Blueprint $table): void { $table->dropForeign('fk_19_job_email_drafts_recruiterContac'); });
        Schema::table('job_email_drafts', function (Blueprint $table): void { $table->dropForeign('fk_18_job_email_drafts_jobPostId'); });
        Schema::table('recruiter_contacts', function (Blueprint $table): void { $table->dropForeign('fk_17_recruiter_contacts_jobPostId'); });
        Schema::table('job_matches', function (Blueprint $table): void { $table->dropForeign('fk_16_job_matches_cvProfileId'); });
        Schema::table('job_matches', function (Blueprint $table): void { $table->dropForeign('fk_15_job_matches_jobPostId'); });
        Schema::table('job_source_import_runs', function (Blueprint $table): void { $table->dropForeign('fk_14_job_source_import__sourceId'); });
        Schema::table('job_posts', function (Blueprint $table): void { $table->dropForeign('fk_13_job_posts_sourceId'); });
        Schema::table('analytics_page_views', function (Blueprint $table): void { $table->dropForeign('fk_12_analytics_page_vie_sessionRef'); });
        Schema::table('analytics_daily_visits', function (Blueprint $table): void { $table->dropForeign('fk_11_analytics_daily_vi_sessionRef'); });
        Schema::table('contact_chat_messages', function (Blueprint $table): void { $table->dropForeign('fk_10_contact_chat_messa_contactMessageI'); });
        Schema::table('article_category_assignments', function (Blueprint $table): void { $table->dropForeign('fk_9_article_category_a_categoryId'); });
        Schema::table('article_category_assignments', function (Blueprint $table): void { $table->dropForeign('fk_8_article_category_a_articleId'); });
        Schema::table('article_replies', function (Blueprint $table): void { $table->dropForeign('fk_7_article_replies_commentId'); });
        Schema::table('article_comments', function (Blueprint $table): void { $table->dropForeign('fk_6_article_comments_articleId'); });
        Schema::table('research_replies', function (Blueprint $table): void { $table->dropForeign('fk_5_research_replies_commentId'); });
        Schema::table('research_comments', function (Blueprint $table): void { $table->dropForeign('fk_4_research_comments_publicationId'); });
        Schema::table('project_replies', function (Blueprint $table): void { $table->dropForeign('fk_3_project_replies_commentId'); });
        Schema::table('project_comments', function (Blueprint $table): void { $table->dropForeign('fk_2_project_comments_projectId'); });
        Schema::table('service_replies', function (Blueprint $table): void { $table->dropForeign('fk_1_service_replies_commentId'); });
        Schema::table('service_comments', function (Blueprint $table): void { $table->dropForeign('fk_0_service_comments_serviceId'); });
    }
};
