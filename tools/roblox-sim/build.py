#!/usr/bin/env python3
"""Bundles a game's Luau sources + the fake runtime + a scenario into one script.
usage: build.py <game> <server|client> <data-dir> <out-file>"""
import sys, os
game, mode, data_dir, out_file = sys.argv[1:5]
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, '..', '..', 'games', game, 'src')
mock = open(os.path.join(here, 'mock.luau')).read()
mock = mock.replace('__CLASSDATA__', open(os.path.join(data_dir, 'classes.txt')).read()).replace('__ENUMDATA__', open(os.path.join(data_dir, 'enums.txt')).read())
out = [mock]
def emit_dir(var, d, folder_name):
    out.append(f'local {var} = newInstance("Folder"); {var}.Name = "{folder_name}"')
    for f in sorted(os.listdir(os.path.join(root, d))):
        name, cls = f[:-len('.luau')], 'ModuleScript'
        if name.endswith('.server'): name, cls = name[:-7], 'Script'
        if name.endswith('.client'): name, cls = name[:-7], 'LocalScript'
        src = open(os.path.join(root, d, f)).read()
        out.append(f'newModule({var}, "{name}", function(script)\n{src}\nend, "{cls}")')
emit_dir('SharedF', 'shared', 'Shared')
out.append('SharedF.Parent = ReplicatedStorage')
if mode == 'server':
    emit_dir('ServerF', 'server', 'Server'); out.append('ServerF.Parent = ServerScriptService')
else:
    emit_dir('ClientF', 'client', 'Client'); out.append('ClientF.Parent = StarterPlayerScripts')
out.append(open(os.path.join(here, 'scenarios', f'{game}.{mode}.luau')).read())
open(out_file, 'w').write('\n'.join(out))
