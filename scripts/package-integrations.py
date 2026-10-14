from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parent.parent
out=root/'public/integrations'
out.mkdir(exist_ok=True)
with ZipFile(out/'ftai-claude.zip','w',ZIP_DEFLATED) as archive:
    for p in sorted((root/'integrations/claude/ftai').rglob('*')):
        if p.is_file(): archive.write(p,p.relative_to(root/'integrations/claude'))

with ZipFile(out/'ftai-sdks.zip','w',ZIP_DEFLATED) as archive:
    for p in sorted((root/'public/sdk').rglob('*')):
        if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ('.pyc','.class') and not p.name.endswith('_test.go'):
            archive.write(p,Path('sdk')/p.relative_to(root/'public/sdk'))
