const prisma = require("./prisma");
const {
  getResearchSyncRuntimeState,
  syncResearchPublications: runResearchSync,
} = require("./research-sync");

const SYNC_MARKER_SLUG = "research-sync-internal-state";
let backgroundTimer = null;
let initialTimer = null;
let coordinatedSync = null;

async function getPersistedMarker() {
  try {
    return await prisma.researchPublication.findUnique({
      where: { slug: SYNC_MARKER_SLUG },
    });
  } catch (_error) {
    return null;
  }
}

async function markSuccessfulSync(orcidId) {
  const data = {
    title: "Research Sync Internal State",
    slug: SYNC_MARKER_SLUG,
    shortSummary: "Internal state used to coordinate automatic ORCID research synchronization.",
    content: "This archived record is managed by the backend and is never returned by public research APIs.",
    publicationType: "Internal",
    researchArea: "Internal",
    publisherName: "Open Research Sync",
    publishedDate: new Date(0),
    doi: null,
    publicationUrl: `https://orcid.org/${orcidId}`,
    citationUrl: null,
    authors: [],
    myAuthorRole: "",
    thumbnailImage: "",
    isFeatured: false,
    status: "archived",
  };

  return prisma.researchPublication.upsert({
    where: { slug: SYNC_MARKER_SLUG },
    update: data,
    create: data,
  });
}

async function getResearchSyncStatus() {
  const runtime = getResearchSyncRuntimeState();
  const marker = await getPersistedMarker();
  const persistedLastSuccessAt = marker?.updatedAt
    ? new Date(marker.updatedAt).toISOString()
    : null;
  const nextSyncAt = persistedLastSuccessAt
    ? new Date(new Date(persistedLastSuccessAt).getTime() + runtime.intervalMs).toISOString()
    : null;

  return {
    ...runtime,
    persistedLastSuccessAt,
    nextSyncAt,
    due: !persistedLastSuccessAt || Date.now() >= new Date(nextSyncAt).getTime(),
  };
}

async function syncResearchPublications(options = {}) {
  if (coordinatedSync) {
    return coordinatedSync;
  }

  coordinatedSync = (async () => {
    const result = await runResearchSync(options);
    if (!result?.skipped) {
      const runtime = getResearchSyncRuntimeState();
      await markSuccessfulSync(runtime.orcidId);
    }
    return result;
  })().finally(() => {
    coordinatedSync = null;
  });

  return coordinatedSync;
}

async function syncResearchPublicationsIfDue(options = {}) {
  if (coordinatedSync) {
    return coordinatedSync;
  }

  const status = await getResearchSyncStatus();
  if (!status.enabled) {
    return { skipped: true, reason: "disabled", orcidId: status.orcidId };
  }
  if (!status.due) {
    return {
      skipped: true,
      reason: "not-due",
      orcidId: status.orcidId,
      nextSyncAt: status.nextSyncAt,
    };
  }

  return syncResearchPublications(options);
}

function startResearchAutoSync() {
  const runtime = getResearchSyncRuntimeState();
  if (!runtime.enabled || backgroundTimer) {
    return runtime;
  }

  const execute = () => {
    syncResearchPublicationsIfDue({ reason: "12-hour-background" }).catch((error) => {
      console.error("Research auto sync failed:", error.message);
    });
  };

  const initialDelayMs = Math.max(
    0,
    Number.parseInt(process.env.RESEARCH_SYNC_INITIAL_DELAY_MS || "3000", 10) || 0,
  );
  initialTimer = setTimeout(execute, initialDelayMs);
  initialTimer.unref?.();

  backgroundTimer = setInterval(execute, runtime.intervalMs);
  backgroundTimer.unref?.();

  return runtime;
}

function stopResearchAutoSync() {
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
  if (backgroundTimer) {
    clearInterval(backgroundTimer);
    backgroundTimer = null;
  }
}

module.exports = {
  SYNC_MARKER_SLUG,
  getResearchSyncStatus,
  startResearchAutoSync,
  stopResearchAutoSync,
  syncResearchPublications,
  syncResearchPublicationsIfDue,
};
