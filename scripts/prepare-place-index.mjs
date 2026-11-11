import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Keep the existing Render build command (npm test) and leave local tests offline.
if (process.env.RENDER === 'true' && process.env.IS_PULL_REQUEST !== 'true') {
  const deps = mkdtempSync(path.join(tmpdir(), 'youngs-place-deps-'));
  try {
    const install = spawnSync('python3', [
      '-m', 'pip', 'install', '--disable-pip-version-check', '--only-binary=:all:',
      '--target', deps, 'duckdb==1.4.3', 'pyproj==3.7.2'
    ], {stdio: 'inherit'});
    if (install.error) throw install.error;
    if (install.status !== 0) process.exitCode = install.status ?? 1;
    else {
      const build = spawnSync('python3', ['scripts/build-place-index.py'], {
        stdio: 'inherit', env: {...process.env, PYTHONPATH: deps}
      });
      if (build.error) throw build.error;
      process.exitCode = build.status ?? 1;
    }
  } finally {
    rmSync(deps, {force: true, recursive: true});
  }
}
