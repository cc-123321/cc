import io

p = 'd:/Cocos游戏源码合集/风暴行动/assets/scripts/render/WorldView.ts'
s = io.open(p, encoding='utf-8').read()
s = s.replace('ShadowCastingMode.OFF', '0').replace('ShadowCastingMode.ON', '1')
s = s.replace("u.type === 'fighter' || u.type === 'awacs'", "u.def.id === 'fighter' || u.def.id === 'awacs'")
s = s.replace("(u.type === 'drone' ? 1.1 : 0)", "(u.def.id === 'drone' ? 1.1 : 0)")
s = s.replace('this._unitMeshes.get(u.type)', 'this._unitMeshes.get(u.def.id)')
s = s.replace("const scale = u.type === 'infantry' ? 1.0 : u.type === 'exo' ? 1.0 : 1.0;", 'const scale = 1.0;')
io.open(p, 'w', encoding='utf-8').write(s)

p2 = 'd:/Cocos游戏源码合集/风暴行动/assets/scripts/render/MeshFactory.ts'
s2 = io.open(p2, encoding='utf-8').read().replace('utils.createMesh(geo as never, false)', 'utils.createMesh(geo as never)')
io.open(p2, 'w', encoding='utf-8').write(s2)
print('patched')
