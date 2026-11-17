# services — external integrations

Third-party integrations (voice transcription, notifications, etc. — later phases).

**Rules:** Each service wraps one external dependency behind a small typed interface so it can be swapped or mocked. Never imported by `domain`.
