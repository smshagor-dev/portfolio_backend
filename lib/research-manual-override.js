const MANUAL_OVERRIDE_MARKER = "<!-- portfolio:research-manual-override -->";

function hasManualResearchOverride(content) {
  return String(content || "").includes(MANUAL_OVERRIDE_MARKER);
}

function markManualResearchOverride(content) {
  const normalized = String(content || "").trim();
  if (hasManualResearchOverride(normalized)) {
    return normalized;
  }

  return normalized
    ? `${MANUAL_OVERRIDE_MARKER}\n${normalized}`
    : MANUAL_OVERRIDE_MARKER;
}

function stripManualResearchOverride(content) {
  return String(content || "")
    .replace(MANUAL_OVERRIDE_MARKER, "")
    .replace(/^\s+/, "");
}

module.exports = {
  MANUAL_OVERRIDE_MARKER,
  hasManualResearchOverride,
  markManualResearchOverride,
  stripManualResearchOverride,
};
