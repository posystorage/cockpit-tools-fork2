#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { resolveReleaseTag } = require('./build_target_latest_json.cjs');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function requiredArg(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`Missing required argument --${key}`);
  }
  return value;
}

function normalizePubDate(raw) {
  const value = (raw || '').trim();
  if (!value || value === 'true' || value === 'null') {
    throw new Error(`Invalid --published-at value: "${raw}"`);
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid --published-at value: "${raw}"`);
  }
  return new Date(timestamp).toISOString();
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim();
}

function buildUrl(repo, releaseTag, fileName) {
  const encoded = encodeURIComponent(fileName);
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(releaseTag)}/${encoded}`;
}

function findAsset(assets, pattern, label) {
  const hit = assets.find((name) => pattern.test(name));
  if (!hit) {
    throw new Error(`Missing required updater asset for ${label}. Pattern: ${pattern}`);
  }
  return hit;
}

function buildPlatformEntry(assetName, signatures, repo, releaseTag) {
  const signature = signatures.get(assetName);
  if (!signature) {
    throw new Error(`Missing signature file for asset ${assetName}`);
  }
  return {
    signature,
    url: buildUrl(repo, releaseTag, assetName),
  };
}

function cloneEntry(entry) {
  return { signature: entry.signature, url: entry.url };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = requiredArg(args, 'version');
  const releaseTag = resolveReleaseTag(version, args['release-tag']);
  const forkValidation = args['fork-validation'] === 'true';
  const repo = requiredArg(args, 'repo');
  const assetsDir = requiredArg(args, 'assets-dir');
  const notesFile = requiredArg(args, 'notes-file');
  const publishedAt = normalizePubDate(requiredArg(args, 'published-at'));
  const output = args.output || 'latest.json';

  if (!fs.existsSync(assetsDir) || !fs.statSync(assetsDir).isDirectory()) {
    throw new Error(`Assets directory not found: ${assetsDir}`);
  }
  if (!fs.existsSync(notesFile)) {
    throw new Error(`Notes file not found: ${notesFile}`);
  }

  const files = fs
    .readdirSync(assetsDir)
    .filter((name) => fs.statSync(path.join(assetsDir, name)).isFile());

  const signatures = new Map();
  for (const name of files) {
    if (!name.endsWith('.sig')) continue;
    const assetName = name.slice(0, -4);
    signatures.set(assetName, readText(path.join(assetsDir, name)));
  }

  const assets = files.filter(
    (name) => !name.endsWith('.sig') && name !== 'latest.json' && name !== 'SHA256SUMS.txt'
  );

  const entry = (pattern, label) => buildPlatformEntry(findAsset(assets, pattern, label), signatures, repo, releaseTag);
  const darwinAarch64Entry = entry(/_aarch64\.app\.tar\.gz$/, 'darwin-aarch64');
  const darwinX64Entry = entry(/_x64\.app\.tar\.gz$/, 'darwin-x86_64');
  const windowsMsiEntry = entry(/_x64_en-US\.msi$/, 'windows-x86_64-msi');
  const windowsNsisEntry = entry(/_x64-setup\.exe$/, 'windows-x86_64-nsis');

  const latest = {
    version,
    notes: readText(notesFile),
    pub_date: publishedAt,
    platforms: {
      'darwin-aarch64': darwinAarch64Entry,
      'darwin-aarch64-app': cloneEntry(darwinAarch64Entry),
      'darwin-x86_64': darwinX64Entry,
      'darwin-x86_64-app': cloneEntry(darwinX64Entry),
      // Unknown/generic Windows target prefers MSI (see #1320 / desktop_updater_target fallback).
      'windows-x86_64': windowsMsiEntry,
      'windows-x86_64-msi': cloneEntry(windowsMsiEntry),
      'windows-x86_64-nsis': windowsNsisEntry,
    },
  };
  if (!forkValidation) {
    const windowsArmNsis = entry(/_arm64-setup\.exe$/, 'windows-aarch64-nsis');
    const linuxX64AppImage = entry(/_amd64\.AppImage$/, 'linux-x86_64-appimage');
    const linuxArmAppImage = entry(/_aarch64\.AppImage$/, 'linux-aarch64-appimage');
    Object.assign(latest.platforms, {
      'windows-aarch64': windowsArmNsis,
      'windows-aarch64-nsis': cloneEntry(windowsArmNsis),
      'linux-x86_64': linuxX64AppImage,
      'linux-x86_64-appimage': cloneEntry(linuxX64AppImage),
      'linux-x86_64-deb': entry(/_amd64\.deb$/, 'linux-x86_64-deb'),
      'linux-x86_64-rpm': entry(/-1\.x86_64\.rpm$/, 'linux-x86_64-rpm'),
      'linux-aarch64': linuxArmAppImage,
      'linux-aarch64-appimage': cloneEntry(linuxArmAppImage),
      'linux-aarch64-deb': entry(/_arm64\.deb$/, 'linux-aarch64-deb'),
      'linux-aarch64-rpm': entry(/-1\.aarch64\.rpm$/, 'linux-aarch64-rpm'),
    });
  }

  fs.writeFileSync(output, `${JSON.stringify(latest, null, 2)}\n`);
  console.log(`Merged latest.json generated at ${output}`);
  console.log(`platform count=${Object.keys(latest.platforms).length}`);
}

try {
  main();
} catch (error) {
  console.error(`[build_merged_latest_json] ${error.message}`);
  process.exit(1);
}
