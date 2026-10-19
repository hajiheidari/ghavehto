import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:http/http.dart' as http;

void main() => runApp(const GhahvehtoApp());

class GhahvehtoApp extends StatelessWidget {
  const GhahvehtoApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    locale: const Locale('fa'),
    supportedLocales: const [Locale('fa'), Locale('en')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    theme: ThemeData(colorSchemeSeed: const Color(0xff173c38)),
    home: const BootstrapScreen(),
  );
}

class BootstrapScreen extends StatefulWidget {
  const BootstrapScreen({super.key});
  @override
  State<BootstrapScreen> createState() => _BootstrapScreenState();
}

class _BootstrapScreenState extends State<BootstrapScreen> {
  late Future<String> connection;
  Future<String> load() async {
    const base = String.fromEnvironment('API_BASE_URL');
    final uri = Uri.tryParse(base);
    if (uri == null || !uri.hasAuthority || !['http', 'https'].contains(uri.scheme)) {
      throw StateError('Configure API_BASE_URL for this development target');
    }
    final client = http.Client();
    try {
      final response = await client.get(uri.resolve('/v1/bootstrap')).timeout(const Duration(seconds: 10));
      if (response.statusCode != 200) throw StateError('API unavailable');
      final data = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      if (data['locale'] != 'fa-IR' || data['dataMode'] != 'empty') throw StateError('Unexpected contract');
      return '${data['brand']} · ارتباط با API برقرار است';
    } finally { client.close(); }
  }
  @override
  void initState() { super.initState(); connection = load(); }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('قهوه‌تو · محیط توسعه')),
    body: Padding(padding: const EdgeInsets.all(24), child: FutureBuilder<String>(
      future: connection,
      builder: (context, snapshot) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('دنیای قهوه، به سلیقه تو'),
        Text(snapshot.hasError ? 'ارتباط برقرار نشد؛ تنظیمات توسعه را بررسی کنید.' : snapshot.data ?? 'در حال اتصال…'),
        TextButton(onPressed: () => setState(() { connection = load(); }), child: const Text('تلاش دوباره')),
      ]),
    )),
  );
}
