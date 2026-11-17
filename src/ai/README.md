# ai — assistant layer

The behavioural core prompt (distilled from playbook doc 10), per-domain voice profiles (Fitness, Fuel), structured-output schemas, and model calls via the Anthropic SDK.

**Rules:** AI writes durable artifacts through `data` repositories — the UI never blocks on live AI (design decision D2). May import from `domain` and `data`; never from `app` or `components`.
