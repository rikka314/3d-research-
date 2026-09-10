import * as THREE from 'three';
import { OrbitControls } from './vendor/three/controls/OrbitControls.js';
import { GLTFLoader } from './vendor/three/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
const state = {
  axis: 'x',
  keepPositive: true,
  bounds: new THREE.Box3(),
  root: null,
  meshes: [],
  contour: null,
  contourJob: 0,
  contourTimer: null,
  contourPending: false,
  loadGeneration: 0,
  depth: 0,
};

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x0b0e0d);
renderer.localClippingEnabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('viewport').append(renderer.domElement);
renderer.domElement.setAttribute('aria-label', '可旋转、缩放和剖切的真实 GLB 网格');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.001, 10000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xeaf8f2, 0x26302d, 2.2));
for (const [position, intensity] of [[[4, 6, 5], 2.6], [[-5, 1, -3], 1.8]]) {
  const light = new THREE.DirectionalLight(0xffffff, intensity);
  light.position.fromArray(position);
  scene.add(light);
}

new ResizeObserver(() => {
  const host = $('viewport');
  if (!host.clientWidth || !host.clientHeight) return;
  renderer.setSize(host.clientWidth, host.clientHeight, false);
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
}).observe($('viewport'));

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

function modelURL(value) {
  if (/^(https?:|blob:|data:)/i.test(value) || value.startsWith('/')) return value;
  return `/${value.replace(/^\.\//, '')}`;
}

function axisRange() {
  const key = state.axis;
  return [state.bounds.min[key], state.bounds.max[key]];
}

function currentDepth() {
  const [min, max] = axisRange();
  return THREE.MathUtils.lerp(min, max, Number($('depth').value) / 1000);
}

function format(value) {
  const magnitude = Math.max(Math.abs(state.bounds.max.x), Math.abs(state.bounds.max.y), Math.abs(state.bounds.max.z));
  return value.toFixed(magnitude < 1 ? 5 : 3);
}

function clippingPlanes() {
  const axis = AXES[state.axis];
  const depth = state.depth;
  if ($('slab-mode').checked) {
    const [min, max] = axisRange();
    const half = (max - min) * Number($('thickness').value) / 200;
    return [
      new THREE.Plane(axis.clone(), -(depth - half)),
      new THREE.Plane(axis.clone().negate(), depth + half),
    ];
  }
  const normal = state.keepPositive ? axis.clone() : axis.clone().negate();
  return [new THREE.Plane(normal, state.keepPositive ? -depth : depth)];
}

function updateClipping(rebuildContour = false) {
  if (!state.root) return;
  state.depth = currentDepth();
  const planes = clippingPlanes();
  for (const mesh of state.meshes) {
    for (const material of [mesh.material].flat()) {
      material.clippingPlanes = planes;
      material.clipShadows = true;
      material.needsUpdate = true;
    }
  }
  $('depth-value').value = `${state.axis.toUpperCase()} ${format(state.depth)}`;
  const side = $('slab-mode').checked ? `薄层 ${$('thickness').value}%` : `保留${state.keepPositive ? '＋' : '−'}侧`;
  const visible = state.meshes.filter((mesh) => mesh.visible).length;
  const contourText = state.contourPending ? '计算中' : `${state.contour?.userData.segmentCount ?? '待计算'} 段`;
  $('readout').innerHTML = `<strong>${state.axis.toUpperCase()} = ${format(state.depth)}</strong> · ${side} · ${visible}/${state.meshes.length} 个网格可见 · 剖切线 ${contourText}`;
  if (rebuildContour) scheduleContour();
}

function resetView() {
  if (!state.root) return;
  const size = state.bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.001);
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const distance = radius / Math.sin(halfFov) * 0.88;
  const center = state.bounds.getCenter(new THREE.Vector3());
  camera.up.copy(AXES.z);
  camera.position.copy(center).add(new THREE.Vector3(distance * 0.75, distance * 0.55, distance));
  camera.near = Math.max(distance / 1000, 0.00001);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.minDistance = radius * 0.08;
  controls.maxDistance = distance * 12;
  controls.update();
}

function disposeRoot(root) {
  const textures = new Set();
  root.traverse((object) => {
    object.geometry?.dispose();
    for (const material of [object.material].flat().filter(Boolean)) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
    for (const material of object.userData?.originalMaterials || []) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}

function uniqueName(mesh, index) {
  const base = (mesh.name || mesh.parent?.name || `mesh-${index + 1}`).trim();
  return state.meshes.some((item) => item.userData.inspectorName === base) ? `${base} · ${index + 1}` : base;
}

function populateObjects() {
  const select = $('object-select');
  select.replaceChildren(new Option('全部对象', 'all'));
  const list = $('object-list');
  list.replaceChildren();
  state.meshes.forEach((mesh, index) => {
    mesh.userData.inspectorName = uniqueName(mesh, index);
    mesh.userData.originalMaterials = [mesh.material].flat().map((material) => material.clone());
    select.add(new Option(mesh.userData.inspectorName, String(index)));
    const triangles = mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3;
    mesh.userData.triangles = triangles;
    const li = document.createElement('li');
    li.dataset.index = String(index);
    li.textContent = `${index + 1}. ${mesh.userData.inspectorName} · ${Math.round(triangles).toLocaleString()} tris`;
    list.append(li);
  });
  updateObjectHighlight();
}

function updateObjectHighlight() {
  const selected = $('object-select').value;
  for (const li of $('object-list').children) li.dataset.active = String(li.dataset.index === selected);
}

function setStatus(text, kind = '') {
  $('status').textContent = text;
  $('status').dataset.kind = kind;
}

async function loadModel(rawURL) {
  const generation = ++state.loadGeneration;
  const url = modelURL(rawURL);
  setStatus(`正在加载 ${url}…`);
  state.contourJob += 1;
  clearTimeout(state.contourTimer);
  state.contourTimer = null;
  state.contourPending = false;
  if (state.contour) { scene.remove(state.contour); state.contour.geometry.dispose(); state.contour.material.dispose(); state.contour = null; }
  if (state.root) { scene.remove(state.root); disposeRoot(state.root); state.root = null; }
  try {
    let gltf;
    if (rawURL.startsWith('gallery:')) {
      const entry = (window.MODEL_CATALOG || []).find((item) => item.id === rawURL.slice(8) && item.type === 'glb');
      if (!entry) throw new Error('找不到展示模型');
      const buffers = [];
      for (const part of entry.parts || [entry.src]) {
        const response = await fetch(part);
        if (!response.ok) throw new Error('无法读取展示模型文件');
        buffers.push(await response.arrayBuffer());
      }
      gltf = await new GLTFLoader().parseAsync(await new Blob(buffers).arrayBuffer(), '');
    } else gltf = await new GLTFLoader().loadAsync(url);
    if (generation !== state.loadGeneration) {
      disposeRoot(gltf.scene);
      return;
    }
    state.root = gltf.scene;
    // Blender's exporter maps (X,Y,Z) to glTF (X,Z,-Y). Rotate the loaded
    // Y-up scene back so browser section coordinates match CPU Blender probes.
    state.root.rotation.x = Math.PI / 2;
    state.root.updateMatrixWorld(true);
    state.bounds.setFromObject(state.root);
    state.meshes = [];
    state.root.traverse((object) => {
      if (!object.isMesh || !object.geometry?.attributes?.position) return;
      object.material = [object.material].flat().map((material) => material.clone());
      if (object.material.length === 1) object.material = object.material[0];
      state.meshes.push(object);
    });
    if (!state.meshes.length) throw new Error('GLB 中没有可用的三角网格');
    scene.add(state.root);
    populateObjects();
    $('depth').value = '500';
    $('depth-percent').value = '50';
    resetView();
    updateClipping(true);
    const triangles = state.meshes.reduce((sum, mesh) => sum + mesh.userData.triangles, 0);
    setStatus(`已加载 ${state.meshes.length} 个网格、${Math.round(triangles).toLocaleString()} 个三角面。剖切使用 GLB 实际顶点坐标。`);
    const next = new URL(location.href);
    next.searchParams.set('model', rawURL.replace(/^\//, ''));
    history.replaceState(null, '', next);
  } catch (error) {
    if (generation !== state.loadGeneration) return;
    state.meshes = [];
    setStatus(`加载失败：${error.message}`, 'error');
    $('readout').textContent = '未能读取网格。请确认页面由仓库根目录的 HTTP 服务打开。';
  }
}

function segmentForTriangle(a, b, c, axisIndex, depth, target, seen, tolerance) {
  const points = [];
  const epsilon = 1e-9;
  for (const [p, q] of [[a, b], [b, c], [c, a]]) {
    const dp = p.getComponent(axisIndex) - depth;
    const dq = q.getComponent(axisIndex) - depth;
    if (Math.abs(dp) < epsilon && Math.abs(dq) < epsilon) continue;
    if ((dp <= 0 && dq >= 0) || (dp >= 0 && dq <= 0)) {
      const denominator = dp - dq;
      if (Math.abs(denominator) < epsilon) continue;
      const intersection = p.clone().lerp(q, dp / denominator);
      if (!points.some((point) => point.distanceToSquared(intersection) <= tolerance * tolerance)) points.push(intersection);
    }
  }
  if (points.length < 2 || points[0].distanceToSquared(points[1]) <= tolerance * tolerance) return;
  const key = (point) => `${Math.round(point.x / tolerance)},${Math.round(point.y / tolerance)},${Math.round(point.z / tolerance)}`;
  const first = key(points[0]);
  const second = key(points[1]);
  const segmentKey = first < second ? `${first}|${second}` : `${second}|${first}`;
  if (seen.has(segmentKey)) return;
  seen.add(segmentKey);
  target.push(points[0].x, points[0].y, points[0].z, points[1].x, points[1].y, points[1].z);
}

function scheduleContour(delay = 0) {
  const job = ++state.contourJob;
  clearTimeout(state.contourTimer);
  state.contourTimer = null;
  state.contourPending = false;
  if (state.contour) state.contour.visible = false;
  if (!$('show-contour').checked) {
    updateClipping(false);
    setStatus('剖切线已隐藏；模型裁剪仍使用当前平面。');
    return;
  }
  state.contourPending = true;
  updateClipping(false);
  setStatus('正在从三角面计算当前剖切线…');
  state.contourTimer = setTimeout(() => {
    state.contourTimer = null;
    requestAnimationFrame(() => buildContour(job));
  }, delay);
}

function buildContour(job) {
  if (job !== state.contourJob || !state.root) return;
  const positions = [];
  const axisIndex = { x: 0, y: 1, z: 2 }[state.axis];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const seen = new Set();
  const tolerance = Math.max(state.bounds.getSize(new THREE.Vector3()).length() * 1e-7, 1e-10);
  for (const mesh of state.meshes) {
    if (!mesh.visible) continue;
    const geometry = mesh.geometry;
    const vertices = geometry.attributes.position;
    const indices = geometry.index;
    const count = indices ? indices.count : vertices.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const ia = indices ? indices.getX(i) : i;
      const ib = indices ? indices.getX(i + 1) : i + 1;
      const ic = indices ? indices.getX(i + 2) : i + 2;
      a.fromBufferAttribute(vertices, ia).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(vertices, ib).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(vertices, ic).applyMatrix4(mesh.matrixWorld);
      const min = Math.min(a.getComponent(axisIndex), b.getComponent(axisIndex), c.getComponent(axisIndex));
      const max = Math.max(a.getComponent(axisIndex), b.getComponent(axisIndex), c.getComponent(axisIndex));
      if (state.depth >= min && state.depth <= max) segmentForTriangle(a, b, c, axisIndex, state.depth, positions, seen, tolerance);
    }
  }
  if (job !== state.contourJob) return;
  if (state.contour) { scene.remove(state.contour); state.contour.geometry.dispose(); state.contour.material.dispose(); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true, opacity: .95 });
  state.contour = new THREE.LineSegments(geometry, material);
  state.contour.renderOrder = 20;
  state.contour.userData.segmentCount = positions.length / 6;
  state.contourPending = false;
  scene.add(state.contour);
  const triangles = state.meshes.reduce((sum, mesh) => sum + (mesh.visible ? mesh.userData.triangles : 0), 0);
  setStatus(`剖切线已计算：检查 ${Math.round(triangles).toLocaleString()} 个三角面，得到 ${state.contour.userData.segmentCount.toLocaleString()} 条平面交线。`);
  updateClipping(false);
}

function selectedMesh() {
  const value = $('object-select').value;
  return value === 'all' ? null : state.meshes[Number(value)];
}

function restoreMaterials() {
  for (const mesh of state.meshes) {
    const current = [mesh.material].flat();
    current.forEach((material) => material.dispose());
    const restored = mesh.userData.originalMaterials.map((material) => material.clone());
    mesh.material = restored.length === 1 ? restored[0] : restored;
  }
  updateClipping(false);
}

$('model-select').addEventListener('change', (event) => loadModel(event.target.value));
$('axis-buttons').addEventListener('click', (event) => {
  const axis = event.target.dataset.axis;
  if (!axis) return;
  state.axis = axis;
  for (const button of $('axis-buttons').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.axis === axis));
  $('depth').value = '500';
  $('depth-percent').value = '50.0';
  updateClipping(true);
});
$('depth').addEventListener('input', () => { updateClipping(false); scheduleContour(120); });
$('depth').addEventListener('change', () => updateClipping(true));
$('depth').addEventListener('input', () => { $('depth-percent').value = (Number($('depth').value) / 10).toFixed(1); });
$('depth-percent').addEventListener('input', () => {
  const percent = THREE.MathUtils.clamp(Number($('depth-percent').value) || 0, 0, 100);
  $('depth').value = String(Math.round(percent * 10));
  updateClipping(false);
  scheduleContour(120);
});
$('depth-percent').addEventListener('change', () => {
  $('depth-percent').value = THREE.MathUtils.clamp(Number($('depth-percent').value) || 0, 0, 100).toFixed(1);
  scheduleContour();
});
$('keep-negative').addEventListener('click', () => {
  state.keepPositive = false;
  $('keep-negative').setAttribute('aria-pressed', 'true');
  $('keep-positive').setAttribute('aria-pressed', 'false');
  updateClipping(false);
});
$('keep-positive').addEventListener('click', () => {
  state.keepPositive = true;
  $('keep-negative').setAttribute('aria-pressed', 'false');
  $('keep-positive').setAttribute('aria-pressed', 'true');
  updateClipping(false);
});
$('slab-mode').addEventListener('change', (event) => {
  $('thickness').disabled = !event.target.checked;
  updateClipping(false);
});
$('thickness').addEventListener('input', () => {
  $('thickness-value').value = `${$('thickness').value}%`;
  updateClipping(false);
});
$('show-contour').addEventListener('change', scheduleContour);
$('object-select').addEventListener('change', updateObjectHighlight);
$('isolate').addEventListener('click', () => {
  const chosen = selectedMesh();
  for (const mesh of state.meshes) mesh.visible = !chosen || mesh === chosen;
  scheduleContour();
});
$('show-whole').addEventListener('click', () => {
  for (const mesh of state.meshes) mesh.visible = true;
  $('object-select').value = 'all';
  updateObjectHighlight();
  scheduleContour();
});
$('object-color').addEventListener('input', (event) => {
  const chosen = selectedMesh();
  const targets = chosen ? [chosen] : state.meshes;
  for (const mesh of targets) {
    const replacement = new THREE.MeshStandardMaterial({ color: event.target.value, roughness: .72, metalness: 0, side: THREE.DoubleSide });
    for (const material of [mesh.material].flat()) material.dispose();
    mesh.material = replacement;
  }
  updateClipping(false);
});
$('restore-materials').addEventListener('click', restoreMaterials);
$('reset-view').addEventListener('click', resetView);
$('face-section').addEventListener('click', () => {
  if (!state.root) return;
  const axis = AXES[state.axis];
  const center = state.bounds.getCenter(new THREE.Vector3());
  center[state.axis] = state.depth;
  const radius = Math.max(state.bounds.getSize(new THREE.Vector3()).length() / 2, 0.001);
  const direction = $('slab-mode').checked || !state.keepPositive ? axis.clone() : axis.clone().negate();
  camera.up.copy(state.axis === 'z' ? AXES.y : AXES.z);
  camera.position.copy(center).addScaledVector(direction, radius * 3);
  controls.target.copy(center);
  camera.updateProjectionMatrix();
  controls.update();
});
$('toggle-orbit').addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  $('toggle-orbit').setAttribute('aria-pressed', String(controls.autoRotate));
});

const requested = new URLSearchParams(location.search).get('model');
if (window.MODEL_CATALOG) {
  $('model-select').replaceChildren(...window.MODEL_CATALOG.filter((item) => item.type === 'glb').map((item) => new Option(item.title, `gallery:${item.id}`)));
}
if (requested) {
  const normalized = requested.startsWith('gallery:') ? requested : modelURL(requested);
  const option = [...$('model-select').options].find((item) => item.value === normalized);
  if (option) $('model-select').value = option.value;
  else $('model-select').add(new Option('指定的研究模型', requested, true, true));
}
loadModel(requested || $('model-select').value);
