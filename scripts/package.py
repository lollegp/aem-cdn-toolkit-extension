"""Build a minimal Chrome Web Store ZIP and a GitHub Pages artifact."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / 'manifest.json').read_text())
config = json.loads((ROOT / 'config.json').read_text())
assert config == {'version': 2, 'environments': []}, 'Release config must be empty'
assert manifest['manifest_version'] == 3
assert manifest['incognito'] == 'spanning'
assert set(manifest['permissions']) == {'activeTab', 'storage', 'declarativeNetRequestWithHostAccess'}
assert manifest['optional_host_permissions'] == ['https://*/*']
assert not manifest.get('host_permissions'), 'Do not grant hosts at install time'
assert not manifest.get('content_scripts'), 'Unexpected content scripts'
assert not manifest.get('web_accessible_resources'), 'Unexpected exposed resources'
assert manifest['version'] == json.loads((ROOT / 'package.json').read_text())['version']
files = [
    'manifest.json', 'config.json', 'activation.js', 'activity.js', 'background.js',
    'core.js', 'storage.js', 'sections.js', 'options.js', 'options.html',
    'popup.js', 'popup.html', 'styles.css', 'help.html', 'privacy.html', 'site.css',
]
presentation_assets = [
    'docs/imgs/AEM CDN Toolkit Showcase.png',
    'docs/imgs/popup_1280x800.png',
    'docs/imgs/environment_settings_1280x800.png',
    'docs/imgs/purge_activity_1280x800.png',
]
files += presentation_assets
files += [f'icons/toolkit-{state}-{size}.png' for state in ['neutral', 'green'] for size in [16, 32, 48, 128]]
for name in files:
    path = ROOT / name
    assert path.is_file(), f'Missing package file: {name}'
    if path.suffix in ['.js', '.html', '.css']:
        source = path.read_text()
        assert not re.search(r'\beval\s*\(|new\s+Function\s*\(', source), f'Dynamic code: {name}'
        assert not re.search(r'<script[^>]+src=["\']https?://', source), f'Remote code: {name}'
        for imported in re.findall(r"from\s+['\"]\./([^'\"]+)['\"]", source):
            assert imported in files, f'Unpackaged module: {imported}'

dist = ROOT / 'dist'
dist.mkdir(exist_ok=True)
archive = dist / f'aem-cdn-toolkit-{manifest["version"]}.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
    for name in sorted(files):
        info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        package.writestr(info, (ROOT / name).read_bytes())
with zipfile.ZipFile(archive) as package:
    assert package.testzip() is None
    assert set(package.namelist()) == set(files)
    for name in files:
        assert package.read(name) == (ROOT / name).read_bytes(), f'Archive mismatch: {name}'
site = dist / 'site'
site.mkdir(exist_ok=True)
(site / 'icons').mkdir(exist_ok=True)
(site / 'index.html').write_text((ROOT / 'help.html').read_text())
(site / 'privacy.html').write_text((ROOT / 'privacy.html').read_text().replace('href="help.html"', 'href="index.html"'))
shutil.copy2(ROOT / 'site.css', site / 'site.css')
shutil.copy2(ROOT / 'icons/toolkit-neutral-48.png', site / 'icons/toolkit-neutral-48.png')
for name in presentation_assets:
    destination = site / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / name, destination)
(site / '.nojekyll').touch()
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(archive.with_suffix('.zip.sha256')).write_text(f'{digest}  {archive.name}\n')
print(f'Verified {len(files)} files: {archive}')
print(f'SHA-256: {digest}')
print(f'GitHub Pages artifact: {site}')
