import * as THREE from 'three';
import { OrbitControls } from './vendor/three/controls/OrbitControls.js';
import { GLTFLoader } from './vendor/three/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const entries = window.MODEL_CATALOG || [];
let renderer, scene, camera, controls, current, request, generation = 0, downloadURL;
const status = (text) => { $('status').textContent = text; };

function initViewer() {
  if (renderer) return;
  const next = new THREE.WebGLRenderer({ antialias: true });
  next.setPixelRatio(Math.min(devicePixelRatio, 2));
  next.setClearColor(0xeeeeee);
  renderer = next;
  $('viewport').append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '可旋转和缩放的三维模型');
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.5));
  for (const [x, y, z] of [[4, 6, 5], [-4, 2, -3]]) {
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(x, y, z); scene.add(light);
  }
  new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = $('viewport');
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }).observe($('viewport'));
  renderer.setAnimationLoop(() => {
    if (!$('viewport').hidden) { controls.update(); renderer.render(scene, camera); }
  });
}

function dispose(root) {
  const textures = new Set();
  root.traverse((object) => {
    object.geometry?.dispose();
    for (const material of [object.material].flat().filter(Boolean)) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
  });
  for (const texture of textures) { texture.source?.data?.close?.(); texture.dispose(); }
}

function reset() {
  if (!current) return;
  const size = new THREE.Box3().setFromObject(current).getSize(new THREE.Vector3());
  const radius = size.length() / 2;
  const halfFov = Math.min(THREE.MathUtils.degToRad(camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
  const distance = radius / Math.sin(halfFov) * 1.1;
  camera.position.set(0, 0, distance); camera.near = distance / 1000; camera.far = distance * 100;
  camera.updateProjectionMatrix(); controls.target.set(0, 0, 0);
  controls.minDistance = radius * 0.1; controls.maxDistance = distance * 10; controls.update();
}

async function select() {
  const token = ++generation;
  request?.abort(); request = new AbortController();
  const signal = request.signal;
  if (current) { scene.remove(current); dispose(current); current = null; }
  if (downloadURL) { URL.revokeObjectURL(downloadURL); downloadURL = null; }
  $('download').hidden = true; $('web').removeAttribute('src');
  if (controls) controls.autoRotate = false;
  $('rotate').setAttribute('aria-pressed', 'false');
  const entry = entries.find((item) => item.id === $('models').value);
  if (!entry) return;
  history.replaceState(null, '', `#${encodeURIComponent(entry.id)}`);
  $('title').textContent = entry.title;
  $('description').textContent = entry.description || '';
  $('images').replaceChildren();
  for (const path of entry.images || []) {
    const link = document.createElement('a'); link.href = path; link.target = '_blank'; link.rel = 'noopener';
    const img = document.createElement('img'); img.src = path; img.alt = `${entry.title} 渲染图`; img.loading = 'lazy';
    link.append(img); $('images').append(link);
  }
  const isModel = entry.type === 'glb';
  $('viewport').hidden = !isModel; $('web').hidden = entry.type !== 'web';
  $('toolbar').hidden = !isModel; $('hint').hidden = !isModel;
  if (!isModel) {
    if (entry.type === 'web') { $('web').src = entry.src; status('网页成果已打开，可使用页面内的控制。'); }
    else status('该历史成果以保存的渲染图展示，点击图片可放大。');
    return;
  }
  try {
    status('正在加载模型…'); initViewer();
    const buffers = [];
    const files = entry.parts || [entry.src];
    for (let i = 0; i < files.length; i++) {
      status(`正在加载模型 ${i + 1}/${files.length}（${(entry.bytes / 1024 / 1024).toFixed(1)} MB）…`);
      const response = await fetch(files[i], { signal });
      if (!response.ok) throw new Error(`文件读取失败：HTTP ${response.status}`);
      buffers.push(await response.arrayBuffer());
    }
    if (signal.aborted) return;
    const blob = new Blob(buffers, { type: 'model/gltf-binary' });
    const model = await new GLTFLoader().parseAsync(await blob.arrayBuffer(), '');
    if (token !== generation) { dispose(model.scene); return; }
    current = model.scene;
    const center = new THREE.Box3().setFromObject(current).getCenter(new THREE.Vector3());
    current.position.sub(center); scene.add(current); reset();
    downloadURL = URL.createObjectURL(blob);
    $('download').href = downloadURL; $('download').download = `${entry.id}.glb`; $('download').hidden = false;
    status('模型已加载。');
  } catch (error) {
    if (token === generation && error.name !== 'AbortError') status(`加载失败：${error.message}。可重新选择此成果，或查看下方渲染图。`);
  }
}

for (const entry of entries) {
  const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.title;
  $('models').append(option);
}
$('count').textContent = `共 ${entries.length} 项`;
$('models').addEventListener('change', select);
$('reset').addEventListener('click', reset);
$('rotate').addEventListener('click', () => {
  if (!controls) return;
  controls.autoRotate = !controls.autoRotate; $('rotate').setAttribute('aria-pressed', String(controls.autoRotate));
});
let initial;
try { initial = decodeURIComponent(location.hash.slice(1)); } catch { initial = ''; }
if (entries.some((entry) => entry.id === initial)) $('models').value = initial;
if (entries.length) select(); else status('暂无成果。添加模型后运行 npm run catalog。');
