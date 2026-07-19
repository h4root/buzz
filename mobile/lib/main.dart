import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'shared/diagnostics/diagnostics.dart';
import 'shared/theme/theme_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Pre-load preferences so startup can apply saved diagnostics consent and
  // the first frame uses the saved theme/accent.
  final prefs = await SharedPreferences.getInstance();
  final diagnosticsController = DiagnosticsController(
    preferences: prefs,
    config: const SentryConfig.fromEnvironment(),
    crashReporter: const SentryCrashReporter(),
  );
  await diagnosticsController.applyStartupConsent();

  runApp(
    ProviderScope(
      overrides: [
        savedPrefsProvider.overrideWithValue(prefs),
        diagnosticsControllerProvider.overrideWith(
          (_) => diagnosticsController,
        ),
      ],
      child: const App(),
    ),
  );
}
