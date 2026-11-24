/**
 * Small SeaDex PocketBase client for a Mangayomi source adapter.
 * Map the returned records into the app's MProvider model in your adapter.
 * SeaDex indexes releases; it is not a video host or direct HTTP stream provider.
 */
const SEADEX_API = "https://releases.moe/api/collections/entries/records";

export async function fetchSeaDexEntries(aniListId, {
  page = 1,
  perPage = 100,
  signal,
  aniListField = "anilist_id",
} = {}) {
  if (!Number.isInteger(Number(aniListId)) || Number(aniListId) <= 0) {
    throw new TypeError("aniListId must be a positive integer");
  }

  const url = new URL(SEADEX_API);
  url.searchParams.set("page", String(page));
  url.searchParams.set("perPage", String(perPage));
  url.searchParams.set("expand", "trs");
  url.searchParams.set("filter", `${aniListField}=${Number(aniListId)}`);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`SeaDex request failed: HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.items)) return [];
  return payload.items.map((record) => normalizeSeaDexRecord(record, Number(aniListId)));
}

function firstString(object, keys, fallback = null) {
  for (const key of keys) {
    const value = object?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

export function normalizeSeaDexRecord(record, aniListId) {
  const tracker = Array.isArray(record?.expand?.trs) ? record.expand.trs[0] ?? {} : {};
  return {
    id: String(record?.id ?? ""),
    aniListId,
    title: firstString(record, ["title", "name"], "Untitled release"),
    edition: firstString(record, ["edition", "type", "status"], "Unknown"),
    releaseGroup: firstString(tracker, ["group", "release_group", "name"])
      ?? firstString(record, ["release_group", "group"], "Unknown group"),
    tracker: firstString(tracker, ["name", "tracker"], "SeaDex"),
    audioLanguage: firstString(record, ["audio_language", "audioLanguage"]),
    subtitleLanguage: firstString(record, ["subtitle_language", "subtitleLanguage"]),
    resolution: firstString(record, ["resolution", "quality"]),
    hdrFormat: firstString(record, ["hdr", "hdr_format", "hdrFormat"]),
    externalUrl: firstString(record, ["url", "release_url", "releaseUrl"]),
    infoHash: firstString(record, ["infohash", "info_hash", "infoHash"]),
    raw: record,
  };
}

export function rankSeaDexReleases(releases) {
  const score = (release) => {
    let value = 0;
    if (String(release.edition).toLowerCase() === "best") value += 100;
    if (String(release.edition).toLowerCase() === "alt") value += 50;
    if (/japanese/i.test(release.audioLanguage ?? "")) value += 20;
    if (/english/i.test(release.subtitleLanguage ?? "")) value += 20;
    if (/2160|4k/i.test(release.resolution ?? "")) value += 8;
    if (/1080/i.test(release.resolution ?? "")) value += 5;
    return value;
  };
  return [...releases].sort((a, b) => score(b) - score(a));
}
