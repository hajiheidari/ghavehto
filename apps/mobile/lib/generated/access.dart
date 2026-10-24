// Generated from OpenAPI. Do not edit.
class CafeAccessResponse {
  final String cafeId;
  final String name;
  const CafeAccessResponse({required this.cafeId, required this.name});
  factory CafeAccessResponse.fromJson(Map<String, dynamic> value) {
    if (value['cafeId'] is! String || !RegExp("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").hasMatch(value['cafeId'] as String)) throw const FormatException('Invalid cafeId');
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
    if (value['branchId'] is! String || !RegExp("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").hasMatch(value['branchId'] as String)) throw const FormatException('Invalid branchId');
    if (value['cafeId'] is! String || !RegExp("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").hasMatch(value['cafeId'] as String)) throw const FormatException('Invalid cafeId');
    if (value['name'] is! String) throw const FormatException('Invalid name');
    return BranchAccessResponse(branchId: value['branchId'] as String, cafeId: value['cafeId'] as String, name: value['name'] as String);
  }
}
