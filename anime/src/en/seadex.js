const mangayomiSources = [{
  name: "SeaDex",
  id: 987654321,
  baseUrl: "https://releases.moe",
  lang: "en",
  typeSource: "single",
  iconUrl: "https://releases.moe/favicon.ico",
  isNsfw: false,
  hasCloudflare: false,
  apiUrl: "https://releases.moe/api/collections/entries/records",
  version: "1.1.0",
  isManga: false,
  itemType: 1,
  isFullData: false,
  appMinVerReq: "0.5.0",
  sourceCodeLanguage: 1,
  notes: "SeaDex release index; Japanese audio / English subtitles preferred"
}];

const ANILIST_API = "https://graphql.anilist.co";
const SEADEX_API = "https://releases.moe/api/collections/entries/records";
const client = new Client();

function parseJson(body) {
  try { return JSON.parse(body); } catch (_) { return {}; }
}
function text(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function recordTracker(record) {
  const expanded = record && record.expand;
  const trs = expanded && Array.isArray(expanded.trs) ? expanded.trs : [];
  return trs.length ? trs[0] : {};
}
function normalizeRelease(record) {
  const tracker = recordTracker(record);
  return {
    id: String(record.id || ""),
    edition: text(record.edition || record.type || record.status, "Unknown"),
    title: text(record.title || record.name, "SeaDex release"),
    group: text(tracker.group || tracker.release_group || tracker.name ||
      record.release_group || record.group, "Unknown group"),
    tracker: text(tracker.name || tracker.tracker, "SeaDex"),
    audio: text(record.audio_language || record.audioLanguage, ""),
    subtitles: text(record.subtitle_language || record.subtitleLanguage, ""),
    resolution: text(record.resolution || record.quality, ""),
    hdr: text(record.hdr || record.hdr_format || record.hdrFormat, ""),
    url: text(record.url || record.release_url || record.releaseUrl, ""),
    infoHash: text(record.infohash || record.info_hash || record.infoHash, ""),
    raw: record
  };
}
function releaseScore(release) {
  let score = release.edition.toLowerCase() === "best" ? 100 :
    release.edition.toLowerCase() === "alt" ? 50 : 0;
  if (/japanese/i.test(release.audio)) score += 20;
  if (/english/i.test(release.subtitles)) score += 20;
  if (/2160|4k/i.test(release.resolution)) score += 8;
  else if (/1080/i.test(release.resolution)) score += 5;
  return score;
}
async function anilistSearch(query, page) {
  const gql = "query ($search: String, $page: Int) { Page(page: $page, perPage: 20) { media(search: $search, type: ANIME, sort: SEARCH_MATCH) { id title { romaji english native } coverImage { large } description format status episodes seasonYear } } }";
  const response = await client.post(ANILIST_API, {
    "Content-Type": "application/json",
    "Accept": "application/json"
  }, JSON.stringify({ query: gql, variables: { search: query, page: page } }));
  const payload = parseJson(response.body);
  const media = payload && payload.data && payload.data.Page && payload.data.Page.media;
  return Array.isArray(media) ? media : [];
}
async function seaDexByAniListId(id) {
  const url = SEADEX_API + "?perPage=100&expand=trs&filter=" +
    encodeURIComponent("anilist_id=" + Number(id));
  const response = await client.get(url, { "Accept": "application/json" });
  const payload = parseJson(response.body);
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  return items.map(normalizeRelease).sort((a, b) => releaseScore(b) - releaseScore(a));
}
function animeName(media) {
  const title = media.title || {};
  return text(title.english || title.romaji || title.native, "Unknown anime");
}
function detailLink(media) {
  return "anilist:" + media.id;
}
function mediaFromLink(link) {
  const match = String(link).match(/^anilist:(\d+)$/);
  return match ? Number(match[1]) : 0;
}

class DefaultExtension extends MProvider {
  getHeaders() { return { "Accept": "application/json" }; }
  get supportsLatest() { return false; }
  async getPopular(page) { return { list: [], hasNextPage: false }; }
  async getLatestUpdates(page) { return { list: [], hasNextPage: false }; }

  async search(query, page, filters) {
    if (!query || !query.trim()) return { list: [], hasNextPage: false };
    const results = await anilistSearch(query.trim(), page);
    return {
      list: results.map(media => ({
        name: animeName(media),
        link: detailLink(media),
        imageUrl: media.coverImage && media.coverImage.large || ""
      })),
      hasNextPage: results.length === 20
    };
  }

  async getDetail(link) {
    const id = mediaFromLink(link);
    if (!id) throw new Error("Invalid AniList entry link.");
    const query = "query ($id: Int) { Media(id: $id, type: ANIME) { id title { romaji english native } coverImage { large } description format status episodes seasonYear } }";
    const response = await client.post(ANILIST_API, {
      "Content-Type": "application/json",
      "Accept": "application/json"
    }, JSON.stringify({ query: query, variables: { id: id } }));
    const payload = parseJson(response.body);
    const media = payload && payload.data && payload.data.Media;
    if (!media) throw new Error("AniList title could not be loaded.");

    const releases = await seaDexByAniListId(id);
    return {
      name: animeName(media),
      imageUrl: media.coverImage && media.coverImage.large || "",
      description: (media.description || "").replace(/<[^>]*>/g, " "),
      genre: [],
      status: 1,
      chapters: releases.map((release, index) => ({
        name: (release.edition + " · " + release.group + " · " + release.title +
          (release.resolution ? " · " + release.resolution : "") +
          (release.hdr ? " · " + release.hdr : "")),
        url: "seadex:" + release.id,
        scanlator: release.group
      }))
    };
  }

  async getVideoList(url) {
    // SeaDex release pages, magnets and infohashes are not direct video streams.
    // Returning them as MVideo URLs would falsely advertise them as playable.
    return [];
  }

  getFilterList() { return []; }
  getSourcePreferences() { return []; }
}

