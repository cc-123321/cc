"""在真实页面里内省引擎 API：EffectAsset 名称、Material pass、属性名。"""
from playwright.sync_api import sync_playwright

CODE = r"""
() => {
  const out = {};
  const cc = window.cc;
  if (!cc) { out.ccGlobal = 'missing'; return out; }
  const all = cc.EffectAsset && cc.EffectAsset.getAll ? cc.EffectAsset.getAll() : null;
  out.effectNames = Array.isArray(all) ? all.map(e => e.name) : (all && typeof all === 'object' ? Object.keys(all) : String(all));
  const makeMat = (name) => {
    try {
      const m = new cc.Material();
      m.initialize({ effectName: name });
      const pass = m.passes && m.passes[0];
      return { name, passes: m.passes ? m.passes.length : 'none',
               props: pass && pass.properties ? Object.keys(pass.properties) : 'none' };
    } catch (e) { return { name, error: String(e).slice(0, 200) }; }
  };
  out.materials = ['builtin-standard', 'builtin-unlit'].map(makeMat);
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
    result = page.evaluate(CODE)
    print('effects:', result.get('effectNames'))
    for m in result.get('materials', []):
        print(m)
    b.close()
