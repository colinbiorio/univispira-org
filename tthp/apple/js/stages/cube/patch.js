// cube/patch.js — three's lit materials with our own shapes and surfaces sewn in (onBeforeCompile).
//
// o: uniforms; vertexHead / fragmentHead (after <common>); normal (replaces <beginnormal_vertex>, must
// declare objectNormal); position (replaces <begin_vertex>, must declare transformed); project
// (replaces <project_vertex>); vertexTail (after the projection); color (after <color_fragment>);
// roughness; normalMap (after <normal_fragment_maps>, may change normal); emissive; lightsEnd (after
// <lights_fragment_end>); fragmentStart (first thing in main: discards).
export function patch(material, name, o) {
  material.onBeforeCompile = (sh) => {
    if (o.uniforms) Object.assign(sh.uniforms, o.uniforms);
    let v = sh.vertexShader, f = sh.fragmentShader;
    if (o.vertexHead) v = v.replace('#include <common>', '#include <common>\n' + o.vertexHead);
    if (o.normal) v = v.replace('#include <beginnormal_vertex>', o.normal);
    if (o.position) v = v.replace('#include <begin_vertex>', o.position);
    if (o.project || o.vertexTail) v = v.replace('#include <project_vertex>', (o.project || '#include <project_vertex>') + '\n' + (o.vertexTail || ''));
    if (o.fragmentHead) f = f.replace('#include <common>', '#include <common>\n' + o.fragmentHead);
    if (o.fragmentStart) f = f.replace('void main() {', 'void main() {\n' + o.fragmentStart);
    if (o.color) f = f.replace('#include <color_fragment>', '#include <color_fragment>\n' + o.color);
    if (o.roughness) f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + o.roughness);
    if (o.normalMap) f = f.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + o.normalMap);
    if (o.emissive) f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + o.emissive);
    if (o.lightsEnd) f = f.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + o.lightsEnd);
    sh.vertexShader = v; sh.fragmentShader = f;
  };
  material.customProgramCacheKey = () => 'tthp-' + name;
  return material;
}
