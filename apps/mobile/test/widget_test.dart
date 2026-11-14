import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghahvehto/main.dart';
import 'package:ghahvehto/generated/bootstrap.dart';

void main() {
  testWidgets('Persian root is RTL and shows successful shared connection', (tester) async {
    await tester.pumpWidget(GhahvehtoApp(loader: () async => 'TEST ONLY CONNECTION'));
    await tester.pumpAndSettle();
    expect(find.text('TEST ONLY CONNECTION'), findsOneWidget);
    expect(Directionality.of(tester.element(find.byType(Scaffold))), TextDirection.rtl);
  });
  testWidgets('network error is recoverable with retry', (tester) async {
    var calls = 0;
    await tester.pumpWidget(GhahvehtoApp(loader: () async {
      calls++;
      if (calls == 1) throw Exception('TEST ONLY failure');
      return 'TEST ONLY recovered';
    }));
    await tester.pumpAndSettle();
    expect(find.textContaining('ارتباط برقرار نشد'), findsOneWidget);
    await tester.tap(find.text('تلاش دوباره'));
    await tester.pumpAndSettle();
    expect(find.text('TEST ONLY recovered'), findsOneWidget);
  });
  test('generated bootstrap rejects changed or incomplete contracts', () {
    expect(() => BootstrapResponse.fromJson({'brand':'TEST ONLY'}), throwsFormatException);
    expect(() => BootstrapResponse.fromJson({
      'brand':'TEST ONLY','locale':'fa-IR','direction':'rtl',
      'environment':'development','dataMode':'empty','loyaltyEnabled':true,
    }), throwsFormatException);
  });
}
