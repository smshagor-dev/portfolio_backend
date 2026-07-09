async function fetchRemoteOkJobs(source, preferences) {
  const response = await fetch(source.baseUrl || "https://remoteok.com/api", {
    headers: { "User-Agent": "JobAgent/1.0 safe public API sync" },
  });
  if (!response.ok) throw new Error(`RemoteOK request failed: ${response.status}`);
  const payload = await response.json();
  const jobs = Array.isArray(payload) ? payload.filter((item) => item && item.position) : [];
  return jobs.slice(0, preferences.maxJobsPerSync || 25).map((job) => ({
    title: job.position,
    company: job.company,
    location: job.location || "Remote",
    sourceUrl: job.url,
    description: job.description || "",
    rawContent: job.description || "",
    jobType: "",
    workMode: "Remote",
    searchKeywordMatched: "",
  }));
}

module.exports = { fetchRemoteOkJobs };
