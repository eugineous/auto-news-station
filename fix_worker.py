with open('cloudflare/worker.js', 'r', encoding='utf-8-sig') as f:
    content = f.read()

replacements = [
    ('\u2014', '-'), ('\u2013', '-'), ('\u2192', '->'), ('\u2190', '<-'),
    ('\u2018', "'"), ('\u2019', "'"), ('\u201c', '"'), ('\u201d', '"'),
    ('\u2026', '...'), ('\ufeff', ''), ('\u2500', '-'), ('\u2502', '|'),
    ('\u251c', '+'), ('\u2514', '+'), ('\u2510', '+'), ('\u250c', '+'),
]
for old, new in replacements:
    content = content.replace(old, new)

# Replace any remaining non-ASCII
fixed = ''.join(c if ord(c) < 128 else '?' for c in content)

with open('cloudflare/worker.js', 'w', encoding='utf-8') as f:
    f.write(fixed)

remaining = sum(1 for c in fixed if ord(c) > 127)
print(f'Done. Non-ASCII remaining: {remaining}')
