import 'dart:convert';
import 'package:http/http.dart' as http;
import 'generated/bootstrap.dart';
import 'generated/access.dart';

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
