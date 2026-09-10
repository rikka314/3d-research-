import { readdir, readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gallery = fileURLToPath(new URL('../', import.meta.url));
const project = path.dirname(gallery);
function number(s) {
  const n = Number(s), digits = '零一二三四五六七八九';
  if (!Number.isInteger(n) || n < 0 || n >= 10000) throw new Error(`Unsupported number: ${s}`);
  if (n < 10) return digits[n];
  let result = '', gap = false;
  for (const [scale, unit] of [[1000, '千'], [100, '百'], [10, '十'], [1, '']]) {
    const digit = Math.floor(n / scale) % 10;
    if (digit) { result += (gap ? '零' : '') + digits[digit] + unit; gap = false; }
    else if (result && n % scale) gap = true;
  }
  return result.replace(/^一十/, '十');
}
async function walk(dir) {
  const out = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...await walk(file));
    else if (item.isFile() && item.name.endsWith('.glb')) out.push(file);
  }
  return out.sort();
}
const indexPath = path.join(project, 'output/multiview-comparison-v3-20260909/section-guided-repair-20260910/CURRENT-ACCEPTANCE-INDEX.json');
const index = JSON.parse((await readFile(indexPath, 'utf8')).replace(/^\uFEFF/, ''));
function label(relative) {
  const p = relative.replaceAll('\\', '/');
  const match = p.match(/(mv|era|zero)(42|123|2026)-(R|K)/);
  let title = '心脏研究';
  if (match) {
    const method = { mv: '多视图适配生成方法', era: '时代三维生成方法', zero: '零样本一二三增强生成方法' }[match[1]];
    title = `心脏 · ${method} · 随机种子${number(match[2])} · ${match[3] === 'R' ? '原始图像组' : '知识库订正图像组'}`;
    if (match[1] === 'zero') title += ' · 视角语义适配后混元重建';
  } else if (p.includes('hunyuan-web') || p.includes('e0-comparable')) {
    const m = p.match(/g(\d)-(E0|A|B)-r(\d)/);
    title = m ? `心脏 · 混元网页先导实验 · 第${number(m[1])}组 · ${ { E0: '基准条件', A: '第一实验条件', B: '第二实验条件' }[m[2]] } · 第${number(m[3])}次生成` : '心脏 · 混元网页先导实验';
  } else if (p.includes('reference3d')) title = '心脏 · 共同坐标解剖参考组合';
  else if (p.includes('smoke')) title = `心脏 · 建模程序${p.includes('transform') ? '坐标变换' : p.includes('correction') ? '订正回渲' : '基础'}验证 · 编号${number(p.match(/-(\d+)\/prepared/)?.[1] || '1')}`;
  let stage = '初始重建';
  if (p.includes('coronary-sinus-candidate')) stage = '冠状窦教学表示候选';
  else if (p.includes('zero2026-R-ivc')) stage = '下腔静脉外部接头修正';
  else if (p.includes('section-guided')) stage = '切片引导修正';
  else if (p.includes('texture-repair')) stage = '表面材质修正';
  else if (p.includes('mesh-repair')) stage = '网格几何修正';
  else if (p.includes('zero-artifact')) stage = '游离伪影清理';
  else if (p.includes('e0-comparable')) stage = '基准条件统一回渲';
  else if (p.includes('supplement')) stage = '统一五百一十二像素输入补充实验';
  const round = p.match(/(?:round)(\d+)/)?.[1];
  title += ` · ${stage}${round ? `第${number(round)}版` : ''}`;
  if (p.includes('repair-stage2-')) title += ' · 第二阶段';
  if (p.includes('/candidate-round')) title += ' · 候选';
  title += p.endsWith('/model.glb') || p.endsWith('/source.glb') ? ' · 原始下载模型' : p.endsWith('/prepared_mesh.glb') ? ' · 重开验证导出模型' : ' · 研究导出模型';
  const current = index.records.find((r) => path.resolve(r.latest_actual_glb.path) === path.resolve(project, relative));
  let state = '历史或辅助研究版本；未作为当前完整验收结果。';
  if (current) state = current.whole_anatomical_acceptance ? '当前选用版本；十二项外部教学检查通过。' : '当前研究检查点；尚未完整通过外部教学检查。';
  if (p.includes('attempt-round28-')) state = '当前选用的下腔静脉局部修复；三十七项工程检查通过，非整体解剖验收。';
  if (p.includes('coronary-sinus-candidate')) state = '冠状窦模板推断候选；十三项工程保留检查通过，最终外观验收待完成。';
  if (match) {
    const method = { mv: 'MV-Adapter', era: 'Era3D', zero: 'Zero123++' }[match[1]];
    const viewsEdited = match[3] === 'K' || match[1] === 'zero';
    const meshEdited = /mesh-repair|texture-repair|section-guided-repair|repair-stage2|zero-artifact-repair/.test(p);
    title = `${method}｜多视图：${viewsEdited ? '已修正' : '未修正'}｜网格：${meshEdited ? '已修正' : '未修正'}`;
  } else title = title.replace(/ · 第[零一二三四五六七八九十百千]+组| · 第[零一二三四五六七八九十百千]+次生成| · 编号[零一二三四五六七八九十百千]+/g, '');
  return { title, description: state + ' 保留工具原名，原始来源保存在导入清单；实验仍暂停。' };
}

// Rename existing display entries without changing asset paths or research sources.
const translations = [
  ['Blender ', '三维建模软件制作 · '], ['Human Atlas', '人体解剖图谱'],
  ['material-baseline', '材质基准'], ['reference-epicardium', '参考心外膜'],
  ['reference-refined', '参考细化'], ['reference-shape', '参考形态'],
  ['reference-final', '参考最终'], ['final-candidate', '最终候选'],
  ['material-final', '材质最终'], ['anatomy', '解剖修订'], ['blockout', '基础形体'],
  ['baseline', '基准'], ['material', '材质修订'], ['verified', '验证'],
];
for (const dir of await readdir(path.join(gallery, 'models'))) {
  const file = path.join(gallery, 'models', dir, 'entry.json');
  const entry = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  for (const [from, to] of translations) entry.title = entry.title.replaceAll(from, to);
  entry.title = entry.title.replace(/-(\d+)/g, (_, n) => `第${number(n)}版`);
  entry.title = entry.title.replace(/第([零一二三四五六七八九]+)版/g, (_, n) => `第${number([...n].map((c) => '零一二三四五六七八九'.indexOf(c)).join(''))}版`);
  if (/[a-z]/i.test(entry.title) && !/^(MV-Adapter|Era3D|Zero123\+\+)｜/.test(entry.title)) throw new Error(`Unexpected title: ${entry.title}`);
  if (entry.description) entry.description = entry.description.replaceAll('GLB', '三维模型文件').replaceAll('Blender', '建模软件');
  await writeFile(file, JSON.stringify(entry, null, 2) + '\n');
}
const inventory = [];
for (const source of await walk(path.join(project, 'output'))) {
  const relative = path.relative(project, source);
  const id = 'research-' + createHash('sha256').update(relative.replaceAll('\\', '/')).digest('hex').slice(0, 16);
  const folder = path.join(gallery, 'models', id);
  const { title, description } = label(relative);
  if (/[a-z]/i.test(title) && !/^(MV-Adapter|Era3D|Zero123\+\+)｜/.test(title)) throw new Error(`Unexpected title: ${title}`);
  let exists = false;
  try { await stat(path.join(folder, 'entry.json')); exists = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const sourceHash = createHash('sha256').update(await readFile(source)).digest('hex');
  if (!exists) {
    const result = spawnSync(process.execPath, [path.join(gallery, 'scripts/add-model.mjs'), source, id, title], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  }
  const entryPath = path.join(folder, 'entry.json');
  const entry = JSON.parse(await readFile(entryPath, 'utf8'));
  const copied = createHash('sha256');
  for (const part of entry.parts) copied.update(await readFile(path.join(folder, part)));
  if (copied.digest('hex') !== sourceHash) throw new Error(`Copy mismatch: ${relative}`);
  Object.assign(entry, { title, description });
  // A nearby actual rendering is optional; never substitute an unrelated model image.
  for (const candidate of [path.join(path.dirname(source), 'renders/material_anterior.png'), path.join(path.dirname(source), 'verification/renders/material_anterior.png')]) {
    try { await copyFile(candidate, path.join(folder, 'preview.png')); entry.images = ['preview.png']; break; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  await writeFile(entryPath, JSON.stringify(entry, null, 2) + '\n');
  inventory.push({ id, title, source: relative, sha256: sourceHash, bytes: (await stat(source)).size });
}
await mkdir(path.join(gallery, 'research-records'), { recursive: true });
await writeFile(path.join(gallery, 'research-records/import-inventory.json'), JSON.stringify({ scope: 'All existing output directory GLB files; original programmatic and web models retained in existing gallery entries.', models: inventory }, null, 2) + '\n');
console.log(`Imported and byte-verified ${inventory.length} research models.`);
