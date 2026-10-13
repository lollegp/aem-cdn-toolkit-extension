import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Manifest supplies valid neutral PNG icons and green variants at each declared size', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../manifest.json', import.meta.url), 'utf8'),
  );
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  for (const size of [16, 32, 48, 128]) {
    assert.equal(
      manifest.action.default_icon?.[size],
      'icons/toolkit-neutral-' + size + '.png',
    );
    assert.equal(manifest.icons?.[size], manifest.action.default_icon[size]);
    const packagedIcon = await readFile(
      new URL('../' + manifest.icons[size], import.meta.url),
    );
    assert.deepEqual(packagedIcon.subarray(0, 8), signature);
    assert.equal(packagedIcon.readUInt32BE(16), size);
    assert.equal(packagedIcon.readUInt32BE(20), size);
    const images = [];
    for (const state of ['neutral', 'green']) {
      const image = await readFile(
        new URL(
          '../icons/toolkit-' + state + '-' + size + '.png',
          import.meta.url,
        ),
      );
      assert.deepEqual(image.subarray(0, 8), signature);
      assert.equal(image.readUInt32BE(16), size);
      assert.equal(image.readUInt32BE(20), size);
      images.push(image);
    }
    assert.notDeepEqual(images[0], images[1]);
  }
});
