import 'package:flutter_test/flutter_test.dart';
import 'package:ghahvehto/generated/access.dart';

void main() {
  test('access contracts validate UUID and string fields', () {
    const id = '10000000-0000-4000-8000-000000000001';
    expect(CafeAccessResponse.fromJson({'cafeId':id,'name':'TEST'}).cafeId,id);
    expect(() => CafeAccessResponse.fromJson({'cafeId':'wrong','name':'TEST'}),throwsFormatException);
    expect(() => BranchAccessResponse.fromJson({'cafeId':id,'branchId':id,'name':2}),throwsFormatException);
  });
}
