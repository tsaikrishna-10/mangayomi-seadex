import 'dart:convert';
import 'package:http/http.dart' as http;

/// SeaDex indexes curated releases; it does not host playable video streams.
class SeaDexRelease {
  const SeaDexRelease({
    required this.aniListId,
    required this.releaseGroup,
    required this.tracker,
    required this.isBest,
    required this.url,
    required this.infoHash,
    required this.dualAudio,
    required this.raw,
  });

  final int aniListId;
  final String releaseGroup;
  final String tracker;
  final bool isBest;
  final String? url;
  final String? infoHash;
  final bool? dualAudio;
  final Map<String, dynamic> raw;

  String get edition => isBest ? 'Best' : 'Alt';

  factory SeaDexRelease.fromTorrent(
    Map<String, dynamic> torrent,
    int aniListId,
  ) {
    final group = torrent['releaseGroup'];
    final trackerName = torrent['tracker'];
    final hash = torrent['infoHash'];
    final link = torrent['url'];
    return SeaDexRelease(
      aniListId: aniListId,
      releaseGroup: group is String && group.isNotEmpty ? group : 'Unknown group',
      tracker: trackerName is String && trackerName.isNotEmpty ? trackerName : 'Unknown tracker',
      isBest: torrent['isBest'] == true,
      url: link is String && link.isNotEmpty ? link : null,
      infoHash: hash is String && hash.isNotEmpty && hash != '<redacted>' ? hash : null,
      dualAudio: torrent['dualAudio'] is bool ? torrent['dualAudio'] as bool : null,
      raw: Map<String, dynamic>.from(torrent),
    );
  }
}

class SeaDexService {
  SeaDexService({http.Client? client})
      : _client = client ?? http.Client();

  static final Uri _endpoint =
      Uri.parse('https://releases.moe/api/collections/entries/records');

  final http.Client _client;

  Future<List<SeaDexRelease>> getReleasesByAniListId(int aniListId) async {
    if (aniListId <= 0) throw ArgumentError.value(aniListId, 'aniListId');

    final releases = <SeaDexRelease>[];
    var page = 1;
    var totalPages = 1;

    do {
      final uri = _endpoint.replace(queryParameters: {
        'page': '$page',
        'perPage': '100',
        'expand': 'trs',
        'skipTotal': 'false',
        'filter': 'alID=$aniListId',
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
      final pageCount = decoded['totalPages'];
      if (pageCount is int && pageCount > 0) totalPages = pageCount;

      final items = decoded['items'];
      if (items is List) {
        for (final item in items) {
          if (item is! Map) continue;
          final entry = Map<String, dynamic>.from(item);
          final expand = entry['expand'];
          final torrents = expand is Map ? expand['trs'] : null;
          if (torrents is! List) continue;
          for (final torrent in torrents) {
            if (torrent is Map) {
              releases.add(SeaDexRelease.fromTorrent(
                Map<String, dynamic>.from(torrent),
                aniListId,
              ));
            }
          }
        }
      }
      page++;
    } while (page <= totalPages);

    releases.sort((a, b) {
      if (a.isBest == b.isBest) return a.releaseGroup.compareTo(b.releaseGroup);
      return a.isBest ? -1 : 1;
    });
    return releases;
  }

  void close() => _client.close();
}

class SeaDexException implements Exception {
  const SeaDexException(this.message);
  final String message;
  @override
  String toString() => 'SeaDexException: $message';
}
