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
  version: "1.2.3",
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

function parseJson(body, serviceName) {
  try { return JSON.parse(body); }
  catch (_) { throw new Error(serviceName + " returned invalid JSON."); }
}
function ensureSuccess(response, serviceName) {
  if (!response || response.statusCode < 200 || response.statusCode >= 300) {
    const code = response && response.statusCode ? response.statusCode : "unknown";
    throw new Error(serviceName + " returned HTTP " + code + ".");
  }
}
function ensureGraphQLSuccess(payload) {
  if (payload && Array.isArray(payload.errors) && payload.errors.length) {
    const message = payload.errors.map(error => error && error.message || "GraphQL error").join("; ");
    throw new Error("AniList: " + message);
  }
}
function text(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
async function anilistSearch(query, page) {
  const gql = "query ($search: String, $page: Int) { Page(page: $page, perPage: 20) { media(search: $search, type: ANIME, sort: SEARCH_MATCH) { id title { romaji english native } coverImage { large } description format status episodes seasonYear } } }";
  const response = await client.post(ANILIST_API, {
    "Content-Type": "application/json", "Accept": "application/json"
  }, { query: gql, variables: { search: query, page: page } });
  ensureSuccess(response, "AniList");
  const payload = parseJson(response.body, "AniList");
  ensureGraphQLSuccess(payload);
  const media = payload && payload.data && payload.data.Page && payload.data.Page.media;
  return Array.isArray(media) ? media : [];
}
function animeName(media) {
  const title = media.title || {};
  return text(title.english || title.romaji || title.native, "Unknown anime");
}
function animeLink(id) { return "anilist:" + Number(id); }
function animeStatus(status) {
  switch (status) {
    case "RELEASING":
    case "NOT_YET_RELEASED": return 0;
    case "FINISHED": return 1;
    case "CANCELLED": return 3;
    case "HIATUS": return 2;
    default: return 4;
  }
}
function cleanDescription(value) {
  let html = String(value || "");
  html = html.split("<br>").join("\n");
  html = html.split("<br/>").join("\n");
  html = html.split("<br />").join("\n");
  let output = "";
  let insideTag = false;
  for (let i = 0; i < html.length; i++) {
    const ch = html.charAt(i);
    if (ch === "<") {
      insideTag = true;
    } else if (ch === ">") {
      insideTag = false;
      output += " ";
    } else if (!insideTag) {
      output += ch;
    }
  }
  return output.split("&amp;").join("&")
    .split("&lt;").join("<")
    .split("&gt;").join(">")
    .split("&quot;").join('"')
    .split("&#39;").join("'")
    .trim();
}
function idFromLink(link) {
  const value = String(link || "");
  const prefix = "anilist:";
  if (value.indexOf(prefix) !== 0) return 0;
  const id = value.substring(prefix.length);
  if (!id) return 0;
  for (let i = 0; i < id.length; i++) {
    const code = id.charCodeAt(i);
    if (code < 48 || code > 57) return 0;
  }
  return Number(id);
}
async function getSeaDexTorrents(aniListId) {
  const releases = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = SEADEX_API + "?page=" + page +
      "&perPage=100&skipTotal=false&expand=trs&filter=" +
      encodeURIComponent("alID=" + Number(aniListId));
    const response = await client.get(url, { "Accept": "application/json" });
    ensureSuccess(response, "SeaDex");
    const payload = parseJson(response.body, "SeaDex");
    if (Number.isInteger(payload.totalPages) && payload.totalPages > 0) {
      totalPages = payload.totalPages;
    }
    const entries = payload && Array.isArray(payload.items) ? payload.items : [];
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
    page++;
  } while (page <= totalPages);
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
  }, { query: query, variables: { id: id } });
  ensureSuccess(response, "AniList");
  const payload = parseJson(response.body, "AniList");
  ensureGraphQLSuccess(payload);
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
      link: link,
      imageUrl: media.coverImage && media.coverImage.large || "",
      description: cleanDescription(media.description) +
        (releases.length ? "\n\nSeaDex indexed " + releases.length + " torrent entries. These are release records, not direct video streams." : "\n\nNo SeaDex releases found."),
      genre: [],
      status: animeStatus(media.status),
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

  async getPageList(url) { return []; }

  async getVideoList(url) {
    // A SeaDex torrent record is metadata, not a playable video URL.
    // Never feed a magnet or tracker page to MVideo as if it were an HTTP stream.
    return [];
  }

  getFilterList() { return []; }
  getSourcePreferences() { return []; }
}
