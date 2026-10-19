# Flutter foundation proposal — not built

`lib/main.dart` demonstrates the same bootstrap request from a single Flutter consumer codebase targeting iOS/Android. Native platform projects and package resolution are not generated. This source has not been analyzed or executed.

M1: install Flutter, generate Android/iOS platforms, resolve compatible http/localizations dependencies, generate API client, configure environment URLs and test. Android emulator normally needs host 10.0.2.2, iOS simulator loopback; current API intentionally only binds desktop loopback. Device testing requires an explicitly configured reachable development server and narrowly scoped transport security settings. Never add global cleartext exceptions to release apps. Use HTTPS for actual deployment.
