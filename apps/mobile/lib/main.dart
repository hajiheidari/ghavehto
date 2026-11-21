import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:http/http.dart' as http;
import 'api_client.dart';

void main() => runApp(const GhahvehtoApp());

class GhahvehtoApp extends StatelessWidget {
  const GhahvehtoApp({super.key, this.loader});
  final Future<String> Function()? loader;
  @override
  Widget build(BuildContext context) => MaterialApp(
    locale: const Locale('fa'),
    supportedLocales: const [Locale('fa'), Locale('en')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    theme: ThemeData(colorSchemeSeed: const Color(0xff173c38)),
    home: BootstrapScreen(loader: loader),
  );
}

class BootstrapScreen extends StatefulWidget {
  const BootstrapScreen({super.key, this.loader});
  final Future<String> Function()? loader;
  @override
  State<BootstrapScreen> createState() => _BootstrapScreenState();
}

class _BootstrapScreenState extends State<BootstrapScreen> {
  late Future<String> connection;
  Future<String> load() async {
    const base = String.fromEnvironment('API_BASE_URL');
    final client = http.Client();
    try {
      final data = await GhahvehtoApi(base, client).bootstrap();
      return '${data.brand} · ارتباط با API برقرار است';
    } finally { client.close(); }
  }
  @override
  void initState() { super.initState(); connection = widget.loader?.call() ?? load(); }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('قهوه‌تو · محیط توسعه')),
    body: Padding(padding: const EdgeInsets.all(24), child: FutureBuilder<String>(
      future: connection,
      builder: (context, snapshot) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('دنیای قهوه، به سلیقه تو'),
        Text(snapshot.hasError ? 'ارتباط برقرار نشد؛ تنظیمات توسعه را بررسی کنید.' : snapshot.data ?? 'در حال اتصال…'),
        TextButton(onPressed: () => setState(() { connection = widget.loader?.call() ?? load(); }), child: const Text('تلاش دوباره')),
      ]),
    )),
  );
}
