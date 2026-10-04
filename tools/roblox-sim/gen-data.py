#!/usr/bin/env python3
"""Generates class / enum tables for the fake Roblox runtime from luau-lsp's globalTypes.d.luau.
usage: gen-data.py <out-dir>"""
import re, json, sys, os
out_dir = sys.argv[1]
src = open(os.path.expanduser('~/.local/share/roblox/globalTypes.d.luau')).read()
meta = json.loads(src.split('\n')[0][len('--#METADATA#'):])
creatable = set(meta['CREATABLE_INSTANCES']) | set(meta['SERVICES'])
data, enums, cur, cur_enum = {}, {}, None, None
for line in src.split('\n'):
    m = re.match(r'declare extern type Enum(\w+)_INTERNAL extends Enum with', line)
    if m:
        cur_enum = m.group(1); enums[cur_enum] = []; cur = None; continue
    m = re.match(r'declare extern type (\w+)(?: extends (\w+))? with', line)
    if m:
        cur = m.group(1); cur_enum = None
        data[cur] = {'p': m.group(2) or '', 'props': [], 'methods': [], 'events': []}; continue
    if line == 'end':
        cur = cur_enum = None; continue
    if cur_enum:
        m = re.match(r'\t(\w+): Enum' + cur_enum + r'$', line)
        if m: enums[cur_enum].append(m.group(1))
    elif cur:
        m = re.match(r'\tfunction (\w+)', line)
        if m: data[cur]['methods'].append(m.group(1)); continue
        m = re.match(r'\t(\w+): (.*)$', line)
        if m:
            name, typ = m.groups()
            if typ.startswith('RBXScriptSignal'): data[cur]['events'].append(name)
            else: data[cur]['props'].append(name + ':' + re.sub(r'[|,\n]', '_', typ.strip()))
os.makedirs(out_dir, exist_ok=True)
open(os.path.join(out_dir, 'classes.txt'), 'w').write('\n'.join(
    '|'.join([c, d['p'], '1' if c in creatable else '0', ','.join(d['props']), ','.join(d['methods']), ','.join(d['events'])]) for c, d in data.items()))
open(os.path.join(out_dir, 'enums.txt'), 'w').write('\n'.join(k + '|' + ','.join(v) for k, v in enums.items()))
