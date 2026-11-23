"""场景图内省：节点树、MeshRenderer 网格、相机参数。"""
from playwright.sync_api import sync_playwright
import json

CODE = r"""
() => {
  const cc = window.cc;
  const scene = cc.director.getScene();
  const dump = (n, depth) => {
    if (depth > 3) return null;
    const comps = n.components.map(c => c.constructor.name).join(',');
    return {
      name: n.name, active: n.activeInHierarchy, layer: n.layer,
      pos: [Math.round(n.position.x), Math.round(n.position.y), Math.round(n.position.z)],
      comps: comps,
      children: n.children.map(c => dump(c, depth + 1)).filter(Boolean)
    };
  };
  const findNode = (name) => {
    let found = null;
    const walk = (n) => { if (n.name === name) { found = n; } n.children.forEach(walk); };
    if (scene) { walk(scene); }
    return found;
  };
  const out = { tree: scene ? dump(scene, 0) : null };
  const cam = findNode('MainCamera');
  if (cam) {
    const c = cam.getComponent(cc.Camera);
    out.camera = { orthoHeight: c.orthoHeight, visibility: c.visibility, clear: c.clearFlags, proj: c.projection };
  }
  const terrain = findNode('Terrain');
  if (terrain) {
    const mr = terrain.getComponent(cc.MeshRenderer);
    const st = mr && mr.mesh ? mr.mesh.struct : null;
    out.terrain = {
      hasMR: !!mr,
      minPos: st ? st.minPosition : null,
      maxPos: st ? st.maxPosition : null,
      matPasses: mr && mr.material ? (mr.material.passes ? mr.material.passes.length : -1) : -1
    };
  }
  return out;
}
"""

with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    )
    page = b.new_page(viewport={'width': 1280, 'height': 720})
    page.goto('http://127.0.0.1:8899/index.html', wait_until='load')
    page.wait_for_timeout(6000)
    page.mouse.click(640, 540)
    page.wait_for_timeout(2500)
    result = page.evaluate(CODE)
    print(json.dumps(result, ensure_ascii=False, indent=1)[:3500])
    b.close()
