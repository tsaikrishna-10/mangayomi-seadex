# Mangayomi SeaDex integration

A two-layer integration workspace for SeaDex:

- `lib/services/seadex_service.dart`: native Dart HTTP client and release model.
- `anime/src/en/seadex.js`: JavaScript SeaDex client/normalizer for a Mangayomi source adapter.

## What it does

- Queries the SeaDex PocketBase entries collection and expands the `trs` relation.
- Keeps all returned entries instead of silently selecting only the first entry.
- Ranks Best ahead of Alt, then prefers Japanese audio, English subtitles, and higher resolution **only when those fields are explicitly present**.
- Preserves the raw record so the adapter can expose additional release metadata.

## Important limitations

SeaDex is a release index, not a video host. An infohash, magnet, or external release page is not a direct playable HTTP stream. The Mangayomi adapter must hand those links to a compatible torrent client/provider; it must not label them as direct streams.

PocketBase field names can change. The Dart and JS clients default to the AniList field `anilist_id`; change `aniListField` if the live collection uses a different field. Verify the collection schema before shipping. The adapter deliberately does not infer Japanese audio or English subtitles from `dualAudio == false`.

## Integration status

These files provide the API/model layer. The final `MProvider` adapter and native app wiring still need to be matched to the exact Mangayomi version and its current extension interfaces. Do not copy this folder into an extension repository without checking that repository's required source layout and index format.
