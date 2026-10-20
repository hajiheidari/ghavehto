# Flutter foundation proposal — not built

`lib/main.dart` requests the shared bootstrap from a single Flutter consumer codebase targeting iOS/Android. `lib/generated/bootstrap.dart` is generated from the live Nest OpenAPI schema, with runtime validation. Widget/error-retry/contract tests are supplied but not run locally. Native platform projects and package resolution are not generated.

Official SDK manifest request on 2026-10-19 returned AccessDenied: service not available in your location. No SDK mirror or workaround is assumed. GitHub CI is configured to analyze/test mobile sources in an eligible hosted environment; it is not evidence of a native app build. Native generation, Android SDK and macOS/Xcode/signing remain explicit prerequisites.

M1: install Flutter, generate Android/iOS platforms, resolve compatible http/localizations dependencies, generate API client, configure environment URLs and test. Android emulator normally needs host 10.0.2.2, iOS simulator loopback; current API intentionally only binds desktop loopback. Device testing requires an explicitly configured reachable development server and narrowly scoped transport security settings. Never add global cleartext exceptions to release apps. Use HTTPS for actual deployment.
