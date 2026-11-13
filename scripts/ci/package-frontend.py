"""Package the built site once and bind its exact bytes to the release."""
import hashlib
import json
import os
from pathlib import Path
import tarfile

root = Path('release-site')
for name in ['index.html', 'admin/index.html']:
    if not (root/name).is_file():
        raise SystemExit(f'Missing frontend entry point: {name}')
out = Path('release-frontend')
out.mkdir(exist_ok=True)
archive = out/'frontend.tar.gz'
with tarfile.open(archive, 'w:gz', dereference=False) as tar:
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise SystemExit(f'Unexpected symlink: {path}')
        if path.is_file():
            tar.add(path, arcname=path.relative_to(root).as_posix(), recursive=False)
meta = dict(
    frontend_artifact=f'frontend-dist-{os.environ["GITHUB_RUN_ID"]}-{os.environ["GITHUB_RUN_ATTEMPT"]}',
    frontend_sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
)
Path('frontend-meta.json').write_text(json.dumps(meta))
