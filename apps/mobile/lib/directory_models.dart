class DirectoryEntry {
  const DirectoryEntry({
    required this.id,
    required this.cafeName,
    required this.branchName,
    required this.province,
    required this.city,
    required this.neighborhood,
  });

  final String id;
  final String cafeName;
  final String branchName;
  final String province;
  final String city;
  final String neighborhood;

  factory DirectoryEntry.fromJson(Object? input) {
    if (input is! Map<String, dynamic>) {
      throw const FormatException('Invalid directory entry');
    }
    final id = input['id'];
    if (id is! String ||
        !RegExp(r'^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$').hasMatch(id)) {
      throw const FormatException('Invalid branch identifier');
    }
    String field(String name) {
      final value = input[name];
      if (value is! String) throw const FormatException('Invalid directory field');
      return value;
    }
    return DirectoryEntry(
      id: id,
      cafeName: field('cafeName'),
      branchName: field('branchName'),
      province: field('province'),
      city: field('city'),
      neighborhood: field('neighborhood'),
    );
  }
}

class DirectoryPage {
  DirectoryPage({required List<DirectoryEntry> items, required this.hasMore})
      : items = List.unmodifiable(items);

  final List<DirectoryEntry> items;
  final bool hasMore;

  factory DirectoryPage.fromJson(Object? input) {
    if (input is! Map<String, dynamic> ||
        input['items'] is! List ||
        (input['items'] as List).length > 24 ||
        input['hasMore'] is! bool) {
      throw const FormatException('Invalid directory page');
    }
    return DirectoryPage(
      items: (input['items'] as List).map(DirectoryEntry.fromJson).toList(),
      hasMore: input['hasMore'] as bool,
    );
  }
}
