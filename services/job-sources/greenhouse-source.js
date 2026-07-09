async function fetchGreenhouseJobs(source, preferences) {
  if (!source.baseUrl || source.baseUrl.includes("{boardToken}")) return [];
  const response = await fetch(source.baseUrl);
  if (!response.ok) throw new Error(`Greenhouse request failed: ${response.status}`);
  const payload = await response.json();
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return jobs.slice(0, preferences.maxJobsPerSync || 25).map((job) => ({
    title: job.title,
    company: payload?.name || source.sourceName,
    location: job.location?.name || "",
    sourceUrl: job.absolute_url,
    description: job.content || "",
    rawContent: job.content || "",
  }));
}

module.exports = { fetchGreenhouseJobs };
