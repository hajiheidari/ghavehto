import 'package:flutter_test/flutter_test.dart';
import 'package:ghahvehto/generated/access.dart';

void main() {
  test('access contracts validate UUID and string fields', () {
    const id = '10000000-0000-4000-8000-000000000001';
    expect(CafeAccessResponse.fromJson({'cafeId':id,'name':'TEST'}).cafeId,id);
    expect(() => CafeAccessResponse.fromJson({'cafeId':'wrong','name':'TEST'}),throwsFormatException);
    expect(() => BranchAccessResponse.fromJson({'cafeId':id,'branchId':id,'name':2}),throwsFormatException);
  });
  test('session contracts validate credential shape and canonical UTC expiry', () {
    final token=List.filled(43,'a').join(); // Parser fixture only; never used to authenticate.
    final data=<String,dynamic>{'accessToken':token,'refreshToken':token,'accessExpiresAt':'2026-10-25T10:00:00.000Z','refreshExpiresAt':'2026-11-25T10:00:00.000Z'};
    expect(SessionTokensResponse.fromJson(data).accessToken,token);
    expect(() => SessionTokensResponse.fromJson({...data,'accessToken':'bad'}),throwsFormatException);
    expect(() => SessionTokensResponse.fromJson({...data,'accessExpiresAt':'2026-02-30T10:00:00.000Z'}),throwsFormatException);
  });
}
