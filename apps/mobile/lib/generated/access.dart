// Generated from OpenAPI. Do not edit.
class CafeAccessResponse {
  final String cafeId;
  final String name;
  const CafeAccessResponse({required this.cafeId, required this.name});
  factory CafeAccessResponse.fromJson(Map<String, dynamic> value) {
    if (value['cafeId'] is! String || !RegExp(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").hasMatch(value['cafeId'] as String)) throw const FormatException('Invalid cafeId');
    if (value['name'] is! String) throw const FormatException('Invalid name');
    return CafeAccessResponse(cafeId: value['cafeId'] as String, name: value['name'] as String);
  }
}
class BranchAccessResponse {
  final String branchId;
  final String cafeId;
  final String name;
  const BranchAccessResponse({required this.branchId, required this.cafeId, required this.name});
  factory BranchAccessResponse.fromJson(Map<String, dynamic> value) {
    if (value['branchId'] is! String || !RegExp(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").hasMatch(value['branchId'] as String)) throw const FormatException('Invalid branchId');
    if (value['cafeId'] is! String || !RegExp(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").hasMatch(value['cafeId'] as String)) throw const FormatException('Invalid cafeId');
    if (value['name'] is! String) throw const FormatException('Invalid name');
    return BranchAccessResponse(branchId: value['branchId'] as String, cafeId: value['cafeId'] as String, name: value['name'] as String);
  }
}
class SessionStatusResponse {
  final String userId;
  final String sessionId;
  const SessionStatusResponse({required this.userId, required this.sessionId});
  factory SessionStatusResponse.fromJson(Map<String, dynamic> value) {
    if (value['userId'] is! String || !RegExp(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").hasMatch(value['userId'] as String)) throw const FormatException('Invalid userId');
    if (value['sessionId'] is! String || !RegExp(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").hasMatch(value['sessionId'] as String)) throw const FormatException('Invalid sessionId');
    return SessionStatusResponse(userId: value['userId'] as String, sessionId: value['sessionId'] as String);
  }
}
class SessionTokensResponse {
  final String accessToken;
  final String refreshToken;
  final String accessExpiresAt;
  final String refreshExpiresAt;
  const SessionTokensResponse({required this.accessToken, required this.refreshToken, required this.accessExpiresAt, required this.refreshExpiresAt});
  factory SessionTokensResponse.fromJson(Map<String, dynamic> value) {
    if (value['accessToken'] is! String || !RegExp(r"^[A-Za-z0-9_-]{43}$").hasMatch(value['accessToken'] as String)) throw const FormatException('Invalid accessToken');
    if (value['refreshToken'] is! String || !RegExp(r"^[A-Za-z0-9_-]{43}$").hasMatch(value['refreshToken'] as String)) throw const FormatException('Invalid refreshToken');
    if (value['accessExpiresAt'] is! String || DateTime.tryParse(value['accessExpiresAt'] as String)?.toUtc().toIso8601String() != value['accessExpiresAt']) throw const FormatException('Invalid accessExpiresAt');
    if (value['refreshExpiresAt'] is! String || DateTime.tryParse(value['refreshExpiresAt'] as String)?.toUtc().toIso8601String() != value['refreshExpiresAt']) throw const FormatException('Invalid refreshExpiresAt');
    return SessionTokensResponse(accessToken: value['accessToken'] as String, refreshToken: value['refreshToken'] as String, accessExpiresAt: value['accessExpiresAt'] as String, refreshExpiresAt: value['refreshExpiresAt'] as String);
  }
}
