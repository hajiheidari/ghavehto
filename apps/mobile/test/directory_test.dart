import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ghahvehto/api_client.dart';
import 'package:ghahvehto/directory_models.dart';
import 'package:ghahvehto/directory_screen.dart';
import 'package:ghahvehto/main.dart';

const branchId = '30000000-0000-4000-8000-000000000001';
const branch = DirectoryEntry(
  id: branchId,
  cafeName: 'TEST کافه',
  branchName: 'TEST شعبه',
  province: 'TEST استان',
  city: 'TEST شهر',
  neighborhood: 'TEST محله',
);
Map<String, dynamic> branchJson() => {
  'id': branchId, 'cafeName': branch.cafeName, 'branchName': branch.branchName,
  'province': branch.province, 'city': branch.city, 'neighborhood': branch.neighborhood,
};

void main() {
  test('directory requests encode Persian queries and validate actual response shape', () async {
    final client = MockClient((request) async {
      expect(request.url.path, '/v1/directory');
      expect(request.url.queryParameters, {'q': 'کافه & شهر', 'page': '2'});
      expect(request.headers.containsKey('authorization'), false);
      return http.Response.bytes(utf8.encode(jsonEncode({'items': [branchJson()], 'hasMore': true})), 200);
    });
    try {
      final page = await GhahvehtoApi('https://example.invalid', client)
        .directory(query: 'کافه & شهر', page: 2);
      expect(page.items.single.cafeName, branch.cafeName);
      expect(page.hasMore, true);
    } finally { client.close(); }
  });

  test('malformed data, unavailable API and foreign branch IDs fail closed', () async {
    expect(() => DirectoryPage.fromJson({'items': [branchJson()], 'hasMore': 'yes'}), throwsFormatException);
    expect(() => DirectoryEntry.fromJson({...branchJson(), 'id': 'bad'}), throwsFormatException);
    expect(() => DirectoryPage.fromJson({'items': List.filled(25, branchJson()), 'hasMore': true}), throwsFormatException);
    final unavailable = MockClient((_) async => http.Response('unavailable', 503));
    final absent = MockClient((_) async => http.Response('{}', 404));
    final mismatched = MockClient((_) async => http.Response.bytes(utf8.encode(jsonEncode({...branchJson(),
      'id': '30000000-0000-4000-8000-000000000002'})), 200));
    try {
      await expectLater(GhahvehtoApi('https://example.invalid', unavailable).directory(), throwsStateError);
      expect(await GhahvehtoApi('https://example.invalid', absent).directoryBranch(branchId), isNull);
      await expectLater(GhahvehtoApi('https://example.invalid', mismatched).directoryBranch(branchId), throwsFormatException);
      await expectLater(GhahvehtoApi('https://example.invalid', unavailable).directory(page: 101), throwsArgumentError);
    } finally { unavailable.close(); absent.close(); mismatched.close(); }
  });

  testWidgets('directory is RTL, searches and pages before opening a branch', (tester) async {
    final requests = <String>[];
    await tester.pumpWidget(GhahvehtoApp(
      directoryLoader: (query, page) async {
        requests.add(query + ':' + page.toString());
        return DirectoryPage(items: [branch], hasMore: page == 1);
      },
      branchLoader: (id) async { expect(id, branchId); return branch; },
    ));
    await tester.pumpAndSettle();
    expect(Directionality.of(tester.element(find.byType(Scaffold))), TextDirection.rtl);
    await tester.tap(find.text('صفحهٔ بعد'));
    await tester.pumpAndSettle();
    expect(requests.last, ':2');
    await tester.enterText(find.byType(TextField), 'TEST شهر');
    await tester.tap(find.text('جست‌وجو'));
    await tester.pumpAndSettle();
    expect(requests.last, 'TEST شهر:1');
    await tester.tap(find.text(branch.cafeName));
    await tester.pumpAndSettle();
    expect(find.text('اطلاعات شعبه'), findsOneWidget);
    expect(find.text(branch.province + ' · ' + branch.city + ' · ' + branch.neighborhood), findsOneWidget);
  });

  testWidgets('directory distinguishes unavailable, empty and no search match', (tester) async {
    var attempts = 0;
    await tester.pumpWidget(GhahvehtoApp(directoryLoader: (query, page) async {
      attempts++;
      if (attempts == 1) throw StateError('TEST network failure');
      return DirectoryPage(items: [], hasMore: false);
    }));
    await tester.pumpAndSettle();
    expect(find.text('فهرست کافه‌ها فعلاً در دسترس نیست.'), findsOneWidget);
    await tester.tap(find.text('تلاش دوباره'));
    await tester.pumpAndSettle();
    expect(find.text('هنوز کافهٔ بازبینی‌شده‌ای در فهرست نیست.'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'TEST absent');
    await tester.tap(find.text('جست‌وجو'));
    await tester.pumpAndSettle();
    expect(find.text('کافه‌ای با این جست‌وجو پیدا نشد.'), findsOneWidget);
  });

  testWidgets('a late search response cannot replace the latest search', (tester) async {
    final old = Completer<DirectoryPage>();
    await tester.pumpWidget(GhahvehtoApp(directoryLoader: (query, page) {
      if (query.isEmpty) return old.future;
      return Future.value(DirectoryPage(items: [], hasMore: false));
    }));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'latest');
    await tester.tap(find.text('جست‌وجو'));
    await tester.pumpAndSettle();
    old.complete(DirectoryPage(items: [branch], hasMore: false));
    await tester.pumpAndSettle();
    expect(find.text(branch.cafeName), findsNothing);
    expect(find.text('کافه‌ای با این جست‌وجو پیدا نشد.'), findsOneWidget);
  });

  testWidgets('withdrawn branch and temporary failure have separate recovery states', (tester) async {
    var calls = 0;
    await tester.pumpWidget(MaterialApp(home: BranchScreen(id: branchId, loader: (id) async {
      calls++;
      if (calls == 1) throw StateError('TEST temporary failure');
      return null;
    })));
    await tester.pumpAndSettle();
    expect(find.text('اطلاعات شعبه فعلاً در دسترس نیست.'), findsOneWidget);
    await tester.tap(find.text('تلاش دوباره'));
    await tester.pumpAndSettle();
    expect(find.text('شعبه در فهرست بازبینی‌شده پیدا نشد.'), findsOneWidget);
  });
}
