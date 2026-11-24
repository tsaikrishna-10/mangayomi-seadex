# Mangayomi SeaDex integration

## Files
- `anime/src/en/seadex.js`: Mangayomi JavaScript MProvider adapter.
- `lib/services/seadex_service.dart`: native Dart REST service/model.

## API schema
SeaDex's entry collection uses `alID` for the AniList ID. Each entry's expanded `trs` relation contains torrent records with fields such as `releaseGroup`, `isBest`, `tracker`, `url`, `infoHash`, and `dualAudio`. The adapter queries `filter=alID=<AniList ID>` and expands `trs`.

## Behavior
- AniList search and title details.
- All expanded torrent records are flattened and shown as Best/Alt releases.
- The JavaScript adapter and Dart service follow SeaDex pagination (`totalPages`) instead of silently limiting JavaScript results to the first 100 entries.
- Non-success HTTP responses and malformed JSON now surface explicit service errors.
- The Dart service closes only the HTTP client it created; injected clients remain owned by the caller.
- Release group, tracker, dual-audio flag and infohash availability are shown only from actual fields.
- Private/redacted infohashes are not turned into magnets.
- Pagination is handled in the Dart service.

## Important
SeaDex is a release index, not a media host. A tracker URL or magnet is not a direct video stream. `getVideoList` intentionally returns an empty list rather than mislabeling a torrent link as playable. This adapter is therefore a release browser, not in-app playback.

The native Dart service is reusable code in this repository; it is not wired into Mangayomi's app dependency graph. Full app integration requires a writable fork of the Mangayomi application repository and changes to its native dependency/service registration.
