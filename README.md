# Mangayomi SeaDex

Repository for a SeaDex integration prototype.

## Files
- `anime/src/en/seadex.js`: Mangayomi JavaScript source. Searches AniList and looks up SeaDex entries by AniList ID.
- `lib/services/seadex_service.dart`: native Dart SeaDex REST client/model.

## Current behavior
- Searches AniList anime titles.
- Loads every SeaDex entry for a selected AniList ID, with expanded tracker relation.
- Sorts Best before Alt, then ranks explicitly supplied Japanese-audio, English-subtitle and resolution metadata.
- Shows release group, edition, title and known quality/HDR labels in the episode list.

## Not yet complete
SeaDex is an index, not a video host. This source intentionally returns no MVideo items: magnet/infohash/release-page URLs are not direct playable streams. A separate, explicit external handoff to a torrent client/provider is required before playback can be offered. The current source also needs a runtime test against the live SeaDex PocketBase schema; the default AniList relation field is `anilist_id` and may need adjustment if the live schema differs.

The Dart service is a reusable API layer; it is not yet wired into Mangayomi's native application dependency graph.
