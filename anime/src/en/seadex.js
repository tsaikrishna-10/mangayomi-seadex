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
  version: "1.2.0",
  isManga: false,
  itemType: 1,
  isFullData: false,
  appMinVerReq: "0.5.0",
  sourceCodeLanguage: 1,
  notes: "SeaDex release index. Searches AniList and lists Best/Alt torrent metadata."
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
async function anilistSearch(query, page) {
  const gql = "query ($search: String, $page: Int) { Page(page: $page, perPage: 20) { media(search: $search, type: ANIME, sort: SEARCH_MATCH) { id title { romaji english native } coverImage { large } description format status episodes seasonYear } } }";
  const response = await client.post(ANILIST_API, {
    "Content-Type": "application/json", "Accept": "application/json"
  }, JSON.stringify({ query: gql, variables: { search: query, page: page } }));
  const payload = parseJson(response.body);
  const media = payload && payload.data && payload.data.Page && payload.data.Page.media;
  return Array.isArray(media) ? media : [];
}
function animeName(media) {
  const title = media.title || {};
  return text(title.english || title.romaji || title.native, "Unknown anime");
}
function animeLink(id) { return "anilist:" + Number(id); }
function idFromLink(link) {
  const match = String(link).match(/^anilist:(\d+)$/);
  return match ? Number(match[1]) : 0;
}
async function getSeaDexTorrents(aniListId) {
  const url = SEADEX_API + "?page=1&perPage=100&skipTotal=false&expand=trs&filter=" +
    encodeURIComponent("alID=" + Number(aniListId));
  const response = await client.get(url, { "Accept": "application/json" });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error("SeaDex API returned HTTP " + response.statusCode);
  }
  const payload = parseJson(response.body);
  const entries = payload && Array.isArray(payload.items) ? payload.items : [];
  const releases = [];
  for (const entry of entries) {
    const expanded = entry && entry.expand;
    const torrents = expanded && Array.isArray(expanded.trs) ? expanded.trs : [];
    for (const torrent of torrents) {
      const hash = text(torrent.infoHash, "");
      releases.push({
        entryId: String(entry.id || ""),
        aniListId: Number(entry.alID || aniListId),
        releaseGroup: text(torrent.releaseGroup, "Unknown group"),
        tracker: text(torrent.tracker, "Unknown tracker"),
        isBest: torrent.isBest === true,
        url: text(torrent.url, ""),
        infoHash: hash && hash !== "<redacted>" ? hash : "",
        dualAudio: typeof torrent.dualAudio === "boolean" ? torrent.dualAudio : null
      });
    }
  }
  releases.sort((a, b) => {
    if (a.isBest !== b.isBest) return a.isBest ? -1 : 1;
    return a.releaseGroup.localeCompare(b.releaseGroup);
  });
  return releases;
}
async function getAniListMedia(id) {
  const query = "query ($id: Int) { Media(id: $id, type: ANIME) { id title { romaji english native } coverImage { large } description format status episodes seasonYear } }";
  const response = await client.post(ANILIST_API, {
    "Content-Type": "application/json", "Accept": "application/json"
  }, JSON.stringify({ query: query, variables: { id: id } }));
  const payload = parseJson(response.body);
  return payload && payload.data && payload.data.Media || null;
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
        link: animeLink(media.id),
        imageUrl: media.coverImage && media.coverImage.large || ""
      })),
      hasNextPage: results.length === 20
    };
  }

  async getDetail(link) {
    const id = idFromLink(link);
    if (!id) throw new Error("Invalid AniList entry link.");
    const media = await getAniListMedia(id);
    if (!media) throw new Error("AniList title could not be loaded.");
    const releases = await getSeaDexTorrents(id);

    return {
      name: animeName(media),
      imageUrl: media.coverImage && media.coverImage.large || "",
      description: (media.description || "").replace(/<[^>]*>/g, " ") +
        (releases.length ? "\n\nSeaDex indexed " + releases.length + " torrent entries. Open the release link externally; these are not direct video streams." : "\n\nNo SeaDex releases found."),
      genre: [],
      status: 1,
      chapters: releases.map((release, index) => ({
        name: (release.isBest ? "BEST" : "ALT") + " · " +
          release.releaseGroup + " · " + release.tracker +
          (release.dualAudio === true ? " · Dual audio" : "") +
          (release.infoHash ? " · Infohash available" : " · Private/hidden hash"),
        url: "seadex:" + id + ":" + index,
        scanlator: release.releaseGroup
      }))
    };
  }

  async getVideoList(url) {
    // A SeaDex torrent record is metadata, not a playable video URL.
    // Never feed a magnet or tracker page to MVideo as if it were an HTTP stream.
    return [];
  }

  getFilterList() { return []; }
  getSourcePreferences() { return []; }
}
