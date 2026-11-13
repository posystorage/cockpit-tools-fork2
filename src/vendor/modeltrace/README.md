# ModelTrace vendored runtime

Source: https://github.com/xqy2006/ModelTrace
Commit: 6cd4a8ff0f3f4e49d6d6969dd2fbadfa1569fde2 (2026-10-09)

fingerprint-core.js and challenge-browser.js are unmodified upstream browser
implementations. unified_bank.json is the same reference bank, compacted as JSON.
The accompanying MIT LICENSE applies to these upstream files. The declarations
are local integration glue. No credentials or replies are sent to ModelTrace.

The unified bank contains 18 calibrated candidates, including Claude Sonnet 5.5
and Haiku 5.5. The scorer and challenge generator are byte-identical to the
previous pinned version. The full bank, robust feature space and sample-count
calibration are kept together; candidates are not removed or relabelled.
GPT-6.1 Sol and Terra have no calibrated reference in this version.

metadata.json records the upstream bank hash, the compacted package hash, source
commit and paired JavaScript hashes. The compacted bank is compared as parsed
JSON; packaged JSON and JavaScript hashes use UTF-8 with LF line endings. The UI reads the candidate
count from this small metadata file without eagerly loading the reference bank.
The Codex monitoring plugin and its hooks are not part of this integration.

The result is closed-set statistical attribution, not proof of model identity.
