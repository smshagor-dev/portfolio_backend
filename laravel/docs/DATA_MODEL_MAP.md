# Prisma to MySQL mapping

This schema mirrors 49 Prisma models using Laravel Eloquent. Properties use original camelCase names in SQL columns, with new snake_case plural table names. The old MongoDB `_id` and `@@map` names are **not** applied automatically; this is a new database requiring a dedicated import script. All schema changes are additive on a new empty MySQL database.

| Prisma model | New MySQL table | Fields |
|---|---|---:|
| Profile | `profiles` | 23 |
| Skill | `skills` | 7 |
| Experience | `experiences` | 9 |
| Education | `educations` | 9 |
| StatsCounter | `stats_counters` | 8 |
| Achievement | `achievements` | 9 |
| ServiceSection | `service_sections` | 5 |
| Service | `services` | 14 |
| ServiceComment | `service_comments` | 8 |
| ServiceReply | `service_replies` | 7 |
| Project | `projects` | 16 |
| ProjectComment | `project_comments` | 7 |
| ProjectReply | `project_replies` | 7 |
| Pricing | `pricings` | 13 |
| Faq | `faqs` | 7 |
| Testimonial | `testimonials` | 11 |
| Article | `articles` | 20 |
| ResearchPublication | `research_publications` | 22 |
| ResearchComment | `research_comments` | 7 |
| ResearchReply | `research_replies` | 7 |
| ArticleComment | `article_comments` | 7 |
| ArticleReply | `article_replies` | 7 |
| ArticleCategory | `article_categories` | 5 |
| ArticleCategoryAssignment | `article_category_assignments` | 3 |
| ContactMessage | `contact_messages` | 10 |
| ContactChatMessage | `contact_chat_messages` | 8 |
| AdminNotification | `admin_notifications` | 14 |
| EmergencyContact | `emergency_contacts` | 8 |
| AdminUser | `admin_users` | 8 |
| AiProvider | `ai_providers` | 6 |
| AiSettings | `ai_settings` | 4 |
| AiTrainingEntry | `ai_training_entries` | 5 |
| SiteSettings | `site_settings` | 40 |
| AnalyticsSession | `analytics_sessions` | 11 |
| AnalyticsDailyVisit | `analytics_daily_visits` | 5 |
| AnalyticsPageView | `analytics_page_views` | 6 |
| CvProfile | `cv_profiles` | 11 |
| JobSource | `job_sources` | 9 |
| JobPost | `job_posts` | 32 |
| JobSearchPreference | `job_search_preferences` | 13 |
| JobBoardSource | `job_board_sources` | 20 |
| JobSourceImportRun | `job_source_import_runs` | 10 |
| JobMatch | `job_matches` | 11 |
| RecruiterContact | `recruiter_contacts` | 22 |
| JobEmailDraft | `job_email_drafts` | 34 |
| JobAgentSettings | `job_agent_settings` | 13 |
| JobAgentEmailSetting | `job_agent_email_settings` | 15 |
| JobAgentEmailEvent | `job_agent_email_events` | 10 |
| JobAgentAiSetting | `job_agent_ai_settings` | 20 |

**Note:** The migrations create new empty tables; they do not transfer existing production data or copy credentials. Numeric IDs are now auto-incremented. Existing numeric values can be explicitly preserved during a validated import.
