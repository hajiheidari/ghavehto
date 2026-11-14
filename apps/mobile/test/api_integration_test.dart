import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:ghahvehto/api_client.dart';

void main() {
  test('Dart client talks to the running shared Nest backend', () async {
    const base = String.fromEnvironment('API_BASE_URL');
    final client = http.Client();
    try {
      final result = await GhahvehtoApi(base,client).bootstrap();
      expect(result.brand,'قهوه‌تو');
      expect(result.locale,'fa-IR');
      expect(result.loyaltyEnabled,false);
    } finally { client.close(); }
  }, skip: !const bool.fromEnvironment('RUN_API_INTEGRATION'));
}
