async function fetchLeverJobs(source, preferences) {
  if (!source.baseUrl || source.baseUrl.includes("{company}")) return [];
  const response = await fetch(source.baseUrl);
  if (!response.ok) throw new Error(`Lever request failed: ${response.status}`);
  const jobs = await response.json();
  return (Array.isArray(jobs) ? jobs : []).slice(0, preferences.maxJobsPerSync || 25).map((job) => ({
    title: job.text,
    company: source.sourceName,
    location: job.categories?.location || "",
    sourceUrl: job.hostedUrl || job.applyUrl,
    description: job.descriptionPlain || job.description || "",
    rawContent: job.descriptionPlain || job.description || "",
    jobType: job.categories?.commitment || "",
    workMode: /remote/i.test(`${job.categories?.location || ""}`) ? "Remote" : "",
  }));
}

module.exports = { fetchLeverJobs };
