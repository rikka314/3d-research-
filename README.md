# 建模成果展示

朴素的静态网页，供组员选择和查看现有建模成果。无需后端、账号或数据库；主查看器使用随仓库保存的 Three.js 0.169.0，不依赖 CDN。原始研究目录不需要上传。

仓库：[rikka314/3d-research-](https://github.com/rikka314/3d-research-)。网页地址：[建模成果展示](https://rikka314.github.io/3d-research-/)（GitHub Pages 首次部署完成后可访问）。

## 本地打开

安装 Node.js 后，在此目录运行（无需 `npm install`）：

```sh
npm start
```

打开 http://127.0.0.1:4173 。不要双击 HTML：浏览器的本地文件限制会阻止模型加载。

支持选择成果、拖动旋转、滚轮缩放、右键平移、复位、自动旋转、下载完整 GLB、查看渲染图。地址中的 `#成果ID` 可用于分享指定版本。网页成果保留自身的控制界面。

## 增加一个 GLB

```sh
node scripts/add-model.mjs "你的模型.glb" lung-v1 "肺 · 第一版"
npm run catalog
npm run check
```

命令复制模型到 `models/lung-v1/`，不会修改原文件；同名目录会报错，避免覆盖旧版本。可在生成的 `entry.json` 填写说明、添加渲染图文件名到 `images` 数组，再重新运行 `npm run catalog`。

只支持资源内嵌的普通 GLB 2.0；Draco、Meshopt、KTX2 压缩模型需先导出为未压缩 GLB。`.blend` 应先用 Blender 导出 GLB。大文件自动无损分为不超过 48 MiB 的数据片，浏览器按序拼回；这些片段必须全部保留。该方案解决单文件大小，不减少总下载量；大型模型首次打开仍可能较慢。

## 增加网页或历史图片成果

建立 `models/新ID/`，放入完整静态网页和相对路径资源，添加 `entry.json`：

```json
{
  "title": "新的网页模型",
  "type": "web",
  "src": "index.html",
  "description": "建模方法与版本说明",
  "images": []
}
```

图片成果使用 `"type": "images"`，删除 `src` 并在 `images` 中填写至少一个图片文件名。执行 `npm run catalog` 后出现于选择列表。目录名决定排序；清单生成器会检查文件存在、GLB 文件头及分片总长度。

浏览器无法自动枚举静态站点目录，所以新增后需要更新并提交 `catalog.js`。网页成果应是本组维护的可信页面，且资源路径必须相对当前页面。各 `web-*` 目录内保留维护源码与构建说明。

维护已有网页时，在对应 `models/web-*/source/` 中执行 `npm ci`、`npm run build`，然后回到本展示目录执行 `node scripts/publish-web.mjs web-对应ID`，将构建结果同步到展示入口。人体图谱的静态资源保存在 `models/web-human-atlas/public/`，其余网页在各自 `source/public/`；不要移动这些目录。已有依赖仅供维护网页源码使用，组员查看和运行主展示页无需安装它们。

## 放到新的公开 GitHub 仓库

将**此目录中的内容**放到新仓库根目录，包括 `models/`、`vendor/`、`catalog.js` 和 `.nojekyll`。使用 Git 或 GitHub Desktop 提交模型文件。

仓库 Settings → Pages → Deploy from a branch，选择 `main` 和 `/ (root)`，保存后等待部署。网站相对路径支持 `https://用户名.github.io/仓库名/`。操作依据：[GitHub Pages 发布源说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

每次添加或修改成果后运行 `npm run catalog` 和 `npm run check`，一起提交清单与资源即可。只上传本目录，不要上传研究缓存、模型权重、Blender 安装包或临时日志。

## 内容与许可

五个 Blender 心脏版本保持独立，导入数据与原 GLB 字节相同。早期 GLB 未包含完整程序化材质；渲染图呈现的是 Blender 输出。心脏模型仅表达近似外部结构，不是临床或实测模型。

Three.js 的 MIT 许可证见 `vendor/three/LICENSE`。人体图谱为现有第三方解剖数据查看器复现，不应称作自主建模；其署名与许可保留在对应网页目录。公开前由仓库维护者确定自有代码和模型的发布许可；本次未替用户指定许可证。
