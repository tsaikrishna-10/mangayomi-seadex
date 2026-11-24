import 'dart:convert';
import 'package:http/http.dart' as http;

/// SeaDex is a release index. It does not host video files.
class SeaDexRelease {
  const SeaDexRelease({
    required this.id,
    required this.aniListId,
    required this.title,
    required this.edition,
    required this.tracker,
    required this.releaseGroup,
    required this.raw,
  });

  final String id;
  final int aniListId;
  final String title;
  final String edition;
  final String tracker;
  final String releaseGroup;
  final Map<String, dynamic> raw;

  bool get isBest => edition.toLowerCase() == 'best';
  bool get isAlt => edition.toLowerCase() == 'alt';

  /// Only report language/quality when the source record explicitly provides it.
  String? get audioLanguage => _string(raw, const ['audio_language', 'audioLanguage']);
  String? get subtitleLanguage => _string(raw, const ['subtitle_language', 'subtitleLanguage']);
  String? get resolution => _string(raw, const ['resolution', 'quality']);
  String? get videoCodec => _string(raw, const ['video_codec', 'videoCodec']);
  String? get hdrFormat => _string(raw, const ['hdr', 'hdr_format', 'hdrFormat']);

  String? get externalUrl => _string(raw, const ['url', 'release_url', 'releaseUrl']);
  String? get infoHash => _string(raw, const ['infohash', 'info_hash', 'infoHash']);

  static String? _string(Map<String, dynamic> map, List<String> keys) {
    for (final key in keys) {
      final value = map[key];
      if (value is String && value.trim().isNotEmpty) return value.trim();
      if (value is num) return value.toString();
    }
    return null;
  }

  factory SeaDexRelease.fromRecord(Map<String, dynamic> record, int aniListId) {
    final expanded = record['expand'];
    final trs = expanded is Map ? expanded['trs'] : null;
    final tr = trs is List && trs.isNotEmpty && trs.first is Map
        ? Map<String, dynamic>.from(trs.first as Map)
        : <String, dynamic>{};

    final edition = _string(record, const ['edition', 'type', 'status']) ?? 'Unknown';
    final group = _string(tr, const ['group', 'release_group', 'name']) ??
        _string(record, const ['release_group', 'group']) ??
        'Unknown group';

    return SeaDexRelease(
      id: (record['id'] ?? '').toString(),
      aniListId: aniListId,
      title: _string(record, const ['title', 'name']) ?? 'Untitled release',
      edition: edition,
      tracker: _string(tr, const ['name', 'tracker']) ?? 'SeaDex',
      releaseGroup: group,
      raw: <String, dynamic>{...record, if (tr.isNotEmpty) 'tracker_record': tr},
    );
  }
}

class SeaDexService {
  SeaDexService({
    http.Client? client,
    this.baseUrl = 'https://releases.moe/api/collections/entries/records',
    this.aniListField = 'anilist_id',
  }) : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  /// Configure this if the SeaDex collection uses a different AniList field.
  final String aniListField;

  Future<List<SeaDexRelease>> getReleasesByAniListId(
    int aniListId, {
    int page = 1,
    int perPage = 100,
  }) async {
    if (aniListId <= 0) throw ArgumentError.value(aniListId, 'aniListId');
    final uri = Uri.parse(baseUrl).replace(queryParameters: {
      'page': '$page',
      'perPage': '$perPage',
      'expand': 'trs',
      'filter': '$aniListField=$aniListId',
    });

    final response = await _client.get(uri, headers: const {
      'Accept': 'application/json',
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw SeaDexException('SeaDex returned HTTP ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const SeaDexException('Unexpected SeaDex response format.');
    }

    final records = decoded['items'];
    if (records is! List) return const [];

    final releases = <SeaDexRelease>[];
    for (final item in records) {
      if (item is Map) {
        releases.add(SeaDexRelease.fromRecord(
          Map<String, dynamic>.from(item),
          aniListId,
        ));
      }
    }
    releases.sort((a, b) => _score(b).compareTo(_score(a)));
    return releases;
  }

  int _score(SeaDexRelease release) {
    var score = 0;
    if (release.isBest) score += 100;
    if (release.isAlt) score += 50;
    if ((release.audioLanguage ?? '').toLowerCase().contains('japanese')) score += 20;
    if ((release.subtitleLanguage ?? '').toLowerCase().contains('english')) score += 20;
    if ((release.resolution ?? '').contains('2160')) score += 8;
    if ((release.resolution ?? '').contains('1080')) score += 5;
    return score;
  }

  void close() => _client.close();
}

class SeaDexException implements Exception {
  const SeaDexException(this.message);
  final String message;
  @override
  String toString() => 'SeaDexException: $message';
}
