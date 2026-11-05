const prisma = require("./prisma");
const { enrichResearchAbstracts } = require("./research-abstracts");
const {
  getResearchSyncRuntimeState,
  syncResearchPublications: runResearchSync,
} = require("./research-sync");

const SYNC_MARKER_SLUG = "research-sync-internal-state";
const SYNC_SCHEMA_VERSION = "orcid-crossref-openalex-publisher-abstracts-v2";
const AUTO_METADATA_MARKER = "Metadata sources: ORCID public record";
let backgroundTimer = null;
let initialTimer = null;
let coordinatedSync = null;

function classifySyncedResearchArea(publication) {
  const text = `${publication?.title || ""} ${publication?.shortSummary || ""}`.toLowerCase();

  if (/photonic|surface plasmon|\bspr\b|optical sensor|fiber sensor|refractive index|plasmonic/.test(text)) {
    return "Photonics & Optical Sensing";
  }

  if (/assistive vision|vision assistance|vision-aid|vision aid|blind|low-vision|low vision|wearable vision|esp32-cam/.test(text)) {
    return "Computer Vision & Edge AI";
  }

  if (/federated learning|\bfedavg\b|\bfedprox\b|\bscaffold\b|differential privacy|byzantine.*aggregat|model poisoning/.test(text)) {
    return "Federated Learning & Trustworthy AI";
  }

  if (/\bv2x\b|vehicle-to-everything|vehicular|automotive|smart vehicle|connected vehicle/.test(text)) {
    return "Intelligent Transportation & V2X";
  }

  if (/cyber|security|secure communication|zero[- ]trust|replay|spoof|firmware trust|anti[- ]rollback|authorization|authentication|cryptograph|blockchain-assisted/.test(text)) {
    return "Cybersecurity & Resilient Systems";
  }

  if (/\buav\b|\bdrone\b|\bswarm\b|gps[- ]denied|autonomous system|robotic|navigation|localization/.test(text)) {
    return "Autonomous Systems & Robotics";
  }

  if (/artificial intelligence|machine learning|deep learning|neural|agentic|multimodal|large language model|\bllm\b/.test(text)) {
    return "Artificial Intelligence & Machine Learning";
  }

  return "Computer Science & Engineering";
}

function rewriteResearchAreaInContent(content, researchArea) {
  const normalizedContent = String(content || "");
  if (!normalizedContent) {
    return normalizedContent;
  }

  if (/Research area:[^\n]*/i.test(normalizedContent)) {
    return normalizedContent.replace(
      /Research area:[^\n]*/i,
      `Research area: ${researchArea}`,
    );
  }

  return normalizedContent;
}

async function normalizeSyncedResearchAreas() {
  const publications = await prisma.researchPublication.findMany({
    where: {
      status: "published",
    },
    select: {
      id: true,
      title: true,
      shortSummary: true,
      content: true,
      researchArea: true,
    },
  });

  let updated = 0;

  for (const publication of publications) {
    const currentContent = String(publication.content || "");
    if (!currentContent.includes(AUTO_METADATA_MARKER)) {
      continue;
    }

    const researchArea = classifySyncedResearchArea(publication);
    if (!researchArea) {
      continue;
    }

    const content = rewriteResearchAreaInContent(currentContent, researchArea);
    if (researchArea === publication.researchArea && content === currentContent) {
      continue;
    }

    await prisma.researchPublication.update({
      where: { id: publication.id },
      data: {
        researchArea,
        content,
      },
    });
    updated += 1;
  }

  return updated;
}

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
    content: `This archived record is managed by the backend and is never returned by public research APIs. Sync schema: ${SYNC_SCHEMA_VERSION}.`,
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
  const syncSchemaCurrent = String(marker?.content || "").includes(SYNC_SCHEMA_VERSION);

  return {
    ...runtime,
    syncSchemaVersion: SYNC_SCHEMA_VERSION,
    syncSchemaCurrent,
    persistedLastSuccessAt,
    nextSyncAt,
    due:
      !persistedLastSuccessAt ||
      !syncSchemaCurrent ||
      Date.now() >= new Date(nextSyncAt).getTime(),
  };
}

async function syncResearchPublications(options = {}) {
  if (coordinatedSync) {
    return coordinatedSync;
  }

  coordinatedSync = (async () => {
    const result = await runResearchSync(options);
    if (!result?.skipped) {
      try {
        result.abstracts = await enrichResearchAbstracts({
          reason: options.reason || result.reason || "research-sync",
        });
      } catch (error) {
        console.warn("Research abstract enrichment failed:", error.message);
        result.abstracts = {
          source: "OpenAlex + publisher metadata",
          failed: true,
          error: error.message,
        };
      }

      // Abstract enrichment can improve keyword classification, so normalize
      // research areas after the abstract/summary data has been updated.
      result.researchAreasUpdated = await normalizeSyncedResearchAreas();
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

  const researchAreasUpdated = await normalizeSyncedResearchAreas();
  const status = await getResearchSyncStatus();
  if (!status.enabled) {
    return {
      skipped: true,
      reason: "disabled",
      orcidId: status.orcidId,
      researchAreasUpdated,
    };
  }
  if (!status.due) {
    return {
      skipped: true,
      reason: "not-due",
      orcidId: status.orcidId,
      nextSyncAt: status.nextSyncAt,
      researchAreasUpdated,
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
  SYNC_SCHEMA_VERSION,
  classifySyncedResearchArea,
  getResearchSyncStatus,
  normalizeSyncedResearchAreas,
  rewriteResearchAreaInContent,
  startResearchAutoSync,
  stopResearchAutoSync,
  syncResearchPublications,
  syncResearchPublicationsIfDue,
};
