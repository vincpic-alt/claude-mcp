#!/usr/bin/env python3
"""Apply MCP consent route to Callin frontend; fail safely on unfamiliar source."""
from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1]).resolve()
app = root / 'src/App.tsx'
page = root / 'src/pages/McpAuthorize.tsx'
text = app.read_text(encoding='utf-8')
imp = "import { McpAuthorize } from './pages/McpAuthorize';"
route = '<Route path="/mcp/authorize" element={<McpAuthorize />} />'

if route in text:
    raise SystemExit('MCP /mcp/authorize route already exists. Review manually; no files changed.')

# Prefer inserting the import near other page imports.
if imp not in text:
    anchor = "import { SignIn } from './pages/Auth/SignIn';"
    if anchor not in text:
        raise SystemExit('Could not find SignIn import anchor in App.tsx. Apply integration.patch manually.')
    text = text.replace(anchor, imp + '\n' + anchor, 1)

# Insert the public route beside /signin (must be reachable while signed out).
signin = '<Route path="/signin" element={<ToastProvider><SignIn /></ToastProvider>} />'
if signin not in text:
    # Fallback for older App.tsx shapes
    signin = '<Route path="/signin"'
    idx = text.find(signin)
    if idx < 0:
        raise SystemExit('Could not find /signin route in App.tsx. Apply integration.patch manually.')
    # Insert before the signin route line
    line_start = text.rfind('\n', 0, idx) + 1
    text = text[:line_start] + '        ' + route + '\n' + text[line_start:]
else:
    text = text.replace(signin, route + '\n        ' + signin, 1)

backup = app.with_suffix('.tsx.before-mcp')
if backup.exists():
    raise SystemExit('Backup already exists. Review it manually; no files changed.')

shutil.copy2(app, backup)
if not page.exists():
    shutil.copy2(Path(__file__).with_name('McpAuthorize.tsx'), page)
else:
    # Keep existing page if present; installer still wires the route.
    print('Note: src/pages/McpAuthorize.tsx already exists; left unchanged.')

app.write_text(text, encoding='utf-8')
print('Added /mcp/authorize. Original App.tsx saved as App.tsx.before-mcp.')
