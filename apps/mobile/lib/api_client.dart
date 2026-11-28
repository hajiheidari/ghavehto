import 'dart:convert';
import 'package:http/http.dart' as http;
import 'generated/bootstrap.dart';
import 'generated/access.dart';
import 'directory_models.dart';

class GhahvehtoApi {
  GhahvehtoApi(String baseUrl, this.client) : baseUri = Uri.parse(baseUrl) {
    if (!baseUri.hasAuthority || !['http', 'https'].contains(baseUri.scheme)) {
      throw ArgumentError('Configure a valid API_BASE_URL');
    }
  }
  final Uri baseUri;
  final http.Client client;
  Future<http.Response> _send(http.Request request) => client.send(request).then(http.Response.fromStream).timeout(const Duration(seconds:10));
  Future<BootstrapResponse> bootstrap() async {
    final response = await client.get(baseUri.resolve('/v1/bootstrap')).timeout(const Duration(seconds: 10));
    if (response.statusCode != 200) throw StateError('API unavailable');
    return BootstrapResponse.fromJson(jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>);
  }
  Future<DirectoryPage> directory({String query = '', int page = 1}) async {
    if (query.length > 80 || page < 1 || page > 100 ||
        RegExp(r'[\u0000-\u001f\u007f]').hasMatch(query)) {
      throw ArgumentError('Invalid directory query');
    }
    final uri = baseUri.resolve('/v1/directory').replace(
      queryParameters: {'q': query, 'page': '$page'},
    );
    final request = http.Request('GET', uri)..followRedirects = false;
    final response = await _send(request);
    if (response.statusCode != 200) throw StateError('Directory unavailable');
    return DirectoryPage.fromJson(jsonDecode(utf8.decode(response.bodyBytes)));
  }

  Future<DirectoryEntry?> directoryBranch(String id) async {
    if (!RegExp(r'^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$').hasMatch(id)) {
      throw ArgumentError('Invalid branch identifier');
    }
    final request = http.Request('GET', baseUri.resolve('/v1/directory/branches/$id'))
      ..followRedirects = false;
    final response = await _send(request);
    if (response.statusCode == 404) return null;
    if (response.statusCode != 200) throw StateError('Branch unavailable');
    final entry = DirectoryEntry.fromJson(jsonDecode(utf8.decode(response.bodyBytes)));
    if (entry.id.toLowerCase() != id.toLowerCase()) {
      throw const FormatException('Mismatched branch identifier');
    }
    return entry;
  }
  Future<CafeAccessResponse> cafeAccess(String cafeId, String accessToken) async {
    final response = await client.get(baseUri.resolve('/v1/cafes/${Uri.encodeComponent(cafeId)}/access'), headers: {'Authorization':'Bearer $accessToken'}).timeout(const Duration(seconds:10));
    if (response.statusCode != 200) throw StateError('Scoped API request rejected');
    return CafeAccessResponse.fromJson(jsonDecode(utf8.decode(response.bodyBytes)) as Map<String,dynamic>);
  }
  Future<BranchAccessResponse> branchAccess(String cafeId, String branchId, String accessToken) async {
    final response = await client.get(baseUri.resolve('/v1/cafes/${Uri.encodeComponent(cafeId)}/branches/${Uri.encodeComponent(branchId)}/access'), headers: {'Authorization':'Bearer $accessToken'}).timeout(const Duration(seconds:10));
    if (response.statusCode != 200) throw StateError('Scoped API request rejected');
    return BranchAccessResponse.fromJson(jsonDecode(utf8.decode(response.bodyBytes)) as Map<String,dynamic>);
  }
  Future<SessionStatusResponse> sessionStatus(String accessToken) async {
    final request = http.Request('GET',baseUri.resolve('/v1/session'))..followRedirects=false;
    request.headers['Authorization']='Bearer $accessToken';
    final response = await _send(request);
    if (response.statusCode != 200) throw StateError('Session unavailable');
    return SessionStatusResponse.fromJson(jsonDecode(utf8.decode(response.bodyBytes)) as Map<String,dynamic>);
  }
  Future<SessionTokensResponse> refreshSession(String refreshToken) async {
    final request = http.Request('POST',baseUri.resolve('/v1/session/refresh'))..followRedirects=false;
    request.headers['Content-Type']='application/json';
    request.body=jsonEncode({'refreshToken':refreshToken});
    final response = await _send(request);
    if (response.statusCode != 201) throw StateError('Session refresh rejected');
    return SessionTokensResponse.fromJson(jsonDecode(utf8.decode(response.bodyBytes)) as Map<String,dynamic>);
  }
  Future<void> logoutSession(String accessToken) async {
    final request = http.Request('POST',baseUri.resolve('/v1/session/logout'))..followRedirects=false;
    request.headers['Authorization']='Bearer $accessToken';
    final response = await _send(request);
    if (response.statusCode != 201 || (jsonDecode(utf8.decode(response.bodyBytes)) as Map<String,dynamic>)['revoked'] != true) throw StateError('Session logout rejected');
  }
}
