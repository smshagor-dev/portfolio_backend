function buildManualJob(body) {
  return {
    title: body.title,
    company: body.company,
    location: body.location,
    sourceUrl: body.sourceUrl,
    description: body.description,
    rawContent: body.description,
    jobType: body.jobType,
    workMode: body.workMode,
    region: body.region,
    experienceLevel: body.experienceLevel,
    sourceName: body.sourceName || "Manual Import",
    sourceType: "MANUAL",
    importMethod: "MANUAL",
    descriptionStatus: body.description ? "READY" : "DESCRIPTION_REQUIRED",
  };
}

module.exports = { buildManualJob };
