import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { test } from 'node:test';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { JSDOM } from 'jsdom';

const root = new URL('../../', import.meta.url);
const dist = new URL('dist/', root);

test('MV3 artifact has consistent versions, least access and existing local resources', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('manifest.json', dist), 'utf8'),
  );
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.background.type, 'module');
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts[0].matches, [
    'https://youtube.com/*',
    'https://www.youtube.com/*',
  ]);
  const paths = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((item) => item.js),
  ];
  for (const path of paths) {
    assert.ok((await stat(new URL(path, dist))).isFile(), path);
  }
  const html = await readFile(
    new URL(manifest.action.default_popup, dist),
    'utf8',
  );
  const dom = new JSDOM(html);
  const document = dom.window.document;
  assert.equal(document.documentElement.lang, 'pt-BR');
  assert.equal(document.querySelectorAll('h1').length, 1);
  for (const element of document.querySelectorAll(
    'script, link[rel="stylesheet"]',
  )) {
    const resource =
      element.getAttribute('src') ?? element.getAttribute('href');
    assert.ok(resource && !resource.includes(':') && !resource.startsWith('/'));
    assert.ok(
      (
        await stat(
          new URL(resource, new URL(manifest.action.default_popup, dist)),
        )
      ).isFile(),
    );
  }
  assert.equal(document.querySelector('script:not([src])'), null);
  assert.equal(document.querySelector('[onclick],[onload]'), null);
  dom.window.close();
  // Content scripts cannot contain unbundled imports or module-only syntax.
  new Script(await readFile(new URL('content/index.js', dist), 'utf8'));
});

async function digest() {
  const entries = await readdir(dist, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  const result = {};
  for (const file of files) {
    result[relative(fileURLToPath(dist), file).split(sep).join('/')] =
      createHash('sha256')
        .update(await readFile(file))
        .digest('hex');
  }
  return result;
}

test('clean repeated builds produce identical runtime-only artifacts', async () => {
  const first = await digest();
  assert.deepEqual(Object.keys(first).sort(), [
    '_locales/en/messages.json',
    '_locales/pt_BR/messages.json',
    'background/index.js',
    'content/index.js',
    'manifest.json',
    'popup/index.css',
    'popup/index.html',
    'popup/index.js',
  ]);
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: fileURLToPath(root),
    stdio: 'pipe',
  });
  assert.deepEqual(await digest(), first);
});
