async function fetchArbeitnowJobs(source, preferences) {
  const response = await fetch(source.baseUrl || "https://www.arbeitnow.com/api/job-board-api");
  if (!response.ok) throw new Error(`Arbeitnow request failed: ${response.status}`);
  const payload = await response.json();
  const jobs = Array.isArray(payload?.data) ? payload.data : [];
  return jobs.slice(0, preferences.maxJobsPerSync || 25).map((job) => ({
    title: job.title,
    company: job.company_name,
    location: job.location,
    sourceUrl: job.url,
    description: job.description || "",
    rawContent: job.description || "",
    jobType: "",
    workMode: /remote/i.test(`${job.location} ${job.title}`) ? "Remote" : "",
    searchKeywordMatched: "",
  }));
}

module.exports = { fetchArbeitnowJobs };
