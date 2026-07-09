async function fetchRemotiveJobs(source, preferences) {
  const query = encodeURIComponent((preferences.rolesJson || [])[0] || "developer");
  const url = source.baseUrl || `https://remotive.com/api/remote-jobs?search=${query}`;
  const response = await fetch(url.includes("?") ? url : `${url}?search=${query}`);
  if (!response.ok) throw new Error(`Remotive request failed: ${response.status}`);
  const payload = await response.json();
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return jobs.slice(0, preferences.maxJobsPerSync || 25).map((job) => ({
    title: job.title,
    company: job.company_name,
    location: job.candidate_required_location,
    sourceUrl: job.url,
    description: job.description || "",
    rawContent: job.description || "",
    jobType: job.job_type,
    workMode: "Remote",
    searchKeywordMatched: query,
  }));
}

module.exports = { fetchRemotiveJobs };
