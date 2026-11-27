import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'api_client.dart';
import 'directory_models.dart';

typedef DirectoryLoader = Future<DirectoryPage> Function(String query, int page);
typedef BranchLoader = Future<DirectoryEntry?> Function(String id);

class DirectoryScreen extends StatefulWidget {
  const DirectoryScreen({super.key, this.loader, this.branchLoader});
  final DirectoryLoader? loader;
  final BranchLoader? branchLoader;

  @override
  State<DirectoryScreen> createState() => _DirectoryScreenState();
}

class _DirectoryScreenState extends State<DirectoryScreen> {
  final _client = http.Client();
  final _search = TextEditingController();
  late Future<DirectoryPage> _result;
  String _query = '';
  int _page = 1;

  Future<DirectoryPage> _load() async {
    if (widget.loader != null) return widget.loader!(_query, _page);
    const base = String.fromEnvironment('API_BASE_URL');
    return GhahvehtoApi(base, _client).directory(query: _query, page: _page);
  }

  @override
  void initState() {
    super.initState();
    _result = _load();
  }

  @override
  void dispose() {
    _search.dispose();
    _client.close();
    super.dispose();
  }

  void _submit() {
    setState(() {
      _query = _search.text.trim();
      _page = 1;
      _result = _load();
    });
  }

  void _changePage(int page) {
    setState(() {
      _page = page;
      _result = _load();
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('کشف کافه')),
    body: Column(children: [
      Padding(
        padding: const EdgeInsets.all(16),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: TextField(
            controller: _search,
            maxLength: 80,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _submit(),
            decoration: const InputDecoration(labelText: 'نام کافه، شهر یا محله'),
          )),
          const SizedBox(width: 8),
          FilledButton(onPressed: _submit, child: const Text('جست‌وجو')),
        ]),
      ),
      Expanded(child: FutureBuilder<DirectoryPage>(
        future: _result,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator(
              semanticsLabel: 'در حال دریافت فهرست کافه‌ها',
            ));
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Text('فهرست کافه‌ها فعلاً در دسترس نیست.'),
              TextButton(onPressed: () => _changePage(_page),
                child: const Text('تلاش دوباره')),
            ]));
          }
          final data = snapshot.data!;
          return Column(children: [
            Expanded(child: data.items.isEmpty
              ? Center(child: Text(_query.isEmpty
                ? 'هنوز کافهٔ بازبینی‌شده‌ای در فهرست نیست.'
                : 'کافه‌ای با این جست‌وجو پیدا نشد.'))
              : ListView.builder(
                  itemCount: data.items.length,
                  itemBuilder: (context, index) {
                    final entry = data.items[index];
                    return ListTile(
                      title: Text(entry.cafeName),
                      subtitle: Text([entry.branchName, entry.city, entry.neighborhood]
                        .where((value) => value.isNotEmpty).join(' · ')),
                      trailing: const Icon(Icons.chevron_left),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                        builder: (_) => BranchScreen(id: entry.id, loader: widget.branchLoader),
                      )),
                    );
                  },
                )),
            if (_page > 1 || (data.hasMore && _page < 100))
              Padding(padding: const EdgeInsets.all(12), child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  if (_page > 1) TextButton(onPressed: () => _changePage(_page - 1),
                    child: const Text('صفحهٔ قبل')),
                  if (data.hasMore && _page < 100) TextButton(onPressed: () => _changePage(_page + 1),
                    child: const Text('صفحهٔ بعد')),
                ],
              )),
          ]);
        },
      )),
    ]),
  );
}

class BranchScreen extends StatefulWidget {
  const BranchScreen({super.key, required this.id, this.loader});
  final String id;
  final BranchLoader? loader;
  @override
  State<BranchScreen> createState() => _BranchScreenState();
}

class _BranchScreenState extends State<BranchScreen> {
  final _client = http.Client();
  late Future<DirectoryEntry?> _result;

  Future<DirectoryEntry?> _load() async {
    if (widget.loader != null) return widget.loader!(widget.id);
    const base = String.fromEnvironment('API_BASE_URL');
    return GhahvehtoApi(base, _client).directoryBranch(widget.id);
  }

  @override
  void initState() {
    super.initState();
    _result = _load();
  }

  @override
  void dispose() {
    _client.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('اطلاعات شعبه')),
    body: FutureBuilder<DirectoryEntry?>(
      future: _result,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('اطلاعات شعبه فعلاً در دسترس نیست.'),
            TextButton(onPressed: () => setState(() { _result = _load(); }),
              child: const Text('تلاش دوباره')),
          ]));
        }
        final entry = snapshot.data;
        if (entry == null) return const Center(child: Text('شعبه در فهرست بازبینی‌شده پیدا نشد.'));
        return ListView(padding: const EdgeInsets.all(24), children: [
          Text(entry.cafeName, style: Theme.of(context).textTheme.headlineMedium),
          Text(entry.branchName),
          const SizedBox(height: 16),
          Text([entry.province, entry.city, entry.neighborhood]
            .where((value) => value.isNotEmpty).join(' · ')),
        ]);
      },
    ),
  );
}
