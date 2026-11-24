import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const targetPlatform = process.argv[2] === 'android' ? 'android' : 'ios';
const rootDir = process.cwd();
const stashDir = path.join(rootDir, '.cap-export-stash');

// Server-only / dynamic-segment routes excluded from static mobile export
// (Mobile uses /property?id=... & /profile?id=..., and calls remote APIs for images/cities)
const routesToStash = [
  { rel: 'src/app/api', key: 'api' },
  { rel: 'src/app/properties/[id]/page.tsx', key: 'properties-id-page.tsx' },
  { rel: 'src/app/profile/[id]/page.tsx', key: 'profile-id-page.tsx' },
];

const stashed = [];

function restoreStashed() {
  for (const item of stashed.reverse()) {
    if (fs.existsSync(item.dst)) {
      fs.mkdirSync(path.dirname(item.src), { recursive: true });
      fs.renameSync(item.dst, item.src);
    }
  }
  if (fs.existsSync(stashDir)) {
    fs.rmSync(stashDir, { recursive: true, force: true });
  }
}

process.on('SIGINT', () => {
  restoreStashed();
  process.exit(130);
});
process.on('SIGTERM', () => {
  restoreStashed();
  process.exit(143);
});

try {
  // Clean previous export & .next cache to prevent stale platform/route artifacts
  const nextDir = path.join(rootDir, '.next');
  const outDir = path.join(rootDir, 'out');
  if (fs.existsSync(nextDir)) fs.rmSync(nextDir, { recursive: true, force: true });
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
  if (fs.existsSync(stashDir)) fs.rmSync(stashDir, { recursive: true, force: true });

  fs.mkdirSync(stashDir, { recursive: true });

  for (const entry of routesToStash) {
    const src = path.join(rootDir, entry.rel);
    const dst = path.join(stashDir, entry.key);
    if (fs.existsSync(src)) {
      fs.renameSync(src, dst);
      stashed.push({ src, dst });
    }
  }

  console.log(`\n[TranoGasy Mobile Build] Building static bundle for ${targetPlatform.toUpperCase()}...`);

  const env = {
    ...process.env,
    NEXT_PUBLIC_PLATFORM: targetPlatform,
    CAP_STATIC_EXPORT: '1',
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || 'https://tranogasy-api.duckdns.org/api',
    NEXT_PUBLIC_IMAGE_API_ORIGIN:
      process.env.NEXT_PUBLIC_IMAGE_API_ORIGIN || 'https://tranogasy-ios.vercel.app',
  };

  const nextCli = path.join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next');

  const result = spawnSync(process.execPath, [nextCli, 'build'], {
    cwd: rootDir,
    env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
  } else {
    console.log(`[TranoGasy Mobile Build] Static bundle ready in frontend/out/ (${targetPlatform}).`);
  }
} finally {
  restoreStashed();
}
