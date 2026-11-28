// Generated from packages/contracts/openapi.json. Do not edit.
class BootstrapResponse {
  final String brand;
  final String locale;
  final String direction;
  final String environment;
  final String dataMode;
  final bool loyaltyEnabled;
  const BootstrapResponse({required this.brand, required this.locale, required this.direction, required this.environment, required this.dataMode, required this.loyaltyEnabled});
  factory BootstrapResponse.fromJson(Map<String, dynamic> value) {
    if (value['brand'] is! String) throw const FormatException('Invalid brand');
    if (value['locale'] is! String || !["fa-IR"].contains(value['locale'])) throw const FormatException('Invalid locale');
    if (value['direction'] is! String || !["rtl"].contains(value['direction'])) throw const FormatException('Invalid direction');
    if (value['environment'] is! String || !["development"].contains(value['environment'])) throw const FormatException('Invalid environment');
    if (value['dataMode'] is! String || !["empty"].contains(value['dataMode'])) throw const FormatException('Invalid dataMode');
    if (value['loyaltyEnabled'] is! bool || ![false].contains(value['loyaltyEnabled'])) throw const FormatException('Invalid loyaltyEnabled');
    return BootstrapResponse(brand: value['brand'] as String, locale: value['locale'] as String, direction: value['direction'] as String, environment: value['environment'] as String, dataMode: value['dataMode'] as String, loyaltyEnabled: value['loyaltyEnabled'] as bool);
  }
}
