# CAR PARK（暂定名）— Interpreting Place 进场页面

## 项目背景
- Kingston University 交互设计课题「Interpreting Place」。
- 场地：Kingston Cattle Market Car Park 废弃的楼梯 / 地下通道入口。
- 整个网站之后会用「反射」来重建这个场景，也可能加入摄像头、实时天气和声音。
- **当前阶段只做进场页面**：先不做反射，也先不放文字和选项。
- 名字还没定，暂时叫 `CAR PARK`。

## 进场页面概念
- 一张手绘的弧形全景街景，原稿是铅笔画在一条长纸上、再弯成弧形。画面里有：
  - 左侧：坡道、树、路牌、路桩
  - 中间：双层巴士、举着手机的人、建筑、路灯
  - 右侧：大树、砖砌花坛、小车（Mini）、停车场结构
- 风格：起始页是**白底黑线**，点 start 后渐变成**黑底白线**。图片载入时处理成"线 + 透明"，颜色由代码决定。
- 交互：通过摄像头识别头部，头往左或往右，就看到场景左边或右边。
- 全景图大约覆盖 180°，左右两端接不上，所以**不做 360° 循环**。

## 技术栈
- 纯 HTML + CSS + JS（ES module），没有构建工具。
- 人脸追踪用 MediaPipe Tasks Vision `FaceLandmarker`（v0.10.14，从 jsdelivr CDN 加载，模型来自 Google Storage）。
- 摄像头需要在 localhost 或 https 下运行，用 VS Code 的 Live Server 跑。

## 依赖（重要）
不要随便升级或替换下面这些。如果要改版本，三个 URL 的版本号必须一起改。
| 依赖 | 地址 / 说明 |
|---|---|
| MediaPipe Tasks Vision JS | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs`（在 `main.js` 里 import `FaceLandmarker`、`FilesetResolver`） |
| MediaPipe WASM 运行时 | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm` |
| 人脸模型 | `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` |
| VS Code Live Server 扩展 | 本地服务器。摄像头 `getUserMedia` 只能在 localhost 或 https 下用，直接双击打开文件不行 |
| 浏览器 | Chrome 或 Edge；`delegate: "GPU"` 需要 WebGL |
| 网络 | 上面三项都从 CDN 加载，离线跑不了。如果要离线展示，需要把这三项下载到本地再改路径 |
| 摄像头权限 | 用户必须允许；拒绝时自动改用鼠标控制 |

没有 npm 和 package.json，也没有构建步骤。`main.js` 用 `<script type="module">` 加载。

## 文件（只有一个入口：Live Server 打开 index.html）
```
index.html            importmap（Three.js）、#stage 画布容器、#meter 指示条、#intro 起始页、#debug 调试面板
style.css             CSS 变量控制颜色：默认白底，body.play 变成黑底
main.js               Three.js 全景圆柱 + 深度、颜色渐变、摄像头头部追踪、鼠标拖动、渲染循环
assets/panorama.png   全景草图（白底黑线原图）
assets/reflection.png 同一张底稿，反射点涂成黑块
assets/Untitled.obj   圆楼模型（第 3 步用）
```
旧版本备份在同级目录的 `起始页测试 - 副本`（最早的平移版）和 `起始页测试 - 旧版 2`（自己写的 WebGL 圆柱版 + model-test 检查页）。

## main.js 逻辑
0. 起始页：白底黑线，按钮是 `start`。点击以后，`theme` 在 `fadeTime` 秒内从 0 渐变到 1，背景和线色变成黑底白线，`body` 加上 `.play`。
1. 点 `start` → `getUserMedia` 打开摄像头 → 加载 `FaceLandmarker`（`runningMode: "VIDEO"`）。失败的话关掉摄像头，改成鼠标拖动。
2. 每一帧读 landmark：
   - `position` 模式：鼻尖 `lm[1].x - 0.5`
   - `yaw` 模式：鼻尖相对两侧脸颊 `lm[234]` 和 `lm[454]` 中点的偏移
3. 第一次检测到脸时自动校准中心 `center`。数值减去中心，取负号（因为摄像头画面没有镜像），再乘以灵敏度、过死区，最后限制在 -1 到 1，得到 `target`。
4. `current` 用插值平滑追 `target`，再乘以 `maxYaw` 得到朝向；同时相机往同一侧挪 `current * sway` 米，制造深度感。-1 是最左，1 是最右，转到底时画面边缘刚好对齐图的边。
5. 摄像头失败时，改成按住鼠标拖动，松手后有惯性。
6. 快捷键：`D` 开关调试面板（镜像小视频 + 数值），`C` 重新校准中心。

## 可调参数（main.js 顶部 `CONFIG`）
| 参数 | 作用 |
|---|---|
| `mode` | `"position"` 头左右移动 / `"yaw"` 原地左右转头 |
| `invert` | 方向反了就设为 `true` |
| `sensitivity` | 头动多少，画面就转到底 |
| `deadzone` | 中间不响应的范围，用来防抖 |
| `smooth` | 0–1，越小越顺滑，也越慢 |
| `radius` | 最远处（墙）离你多少米（50） |
| `arc` | 全景图在圆柱上占多少度（默认 180） |
| `zoom` | 1 = 正中刚好看到整张图的高度；越大越近，能转的范围越大 |
| `startBackground` / `startLine` / `playBackground` / `playLine` / `fadeTime` | 起始页和开始后的颜色，以及渐变秒数 |
| `depthMap` / `near` / `horizon` / `sway` | 深度：深度图（null = 自动）、最近距离、地面从哪开始、相机挪多少 |
| `dragSpeed` / `dragInvert` / `inertia` | 鼠标拖动的速度、方向、惯性 |

方向和手感要和我（Elysian）一起调，不要擅自改成别的交互方式。

## 状态
- [x] 第一版：摄像头 + 人脸追踪 + 全景左右平移
- [x] 改成圆柱投影：站在圆心转头看
- [ ] 在浏览器里实测，调方向和手感
- [ ] 之后可能做：头的 y 控制上下视角、脸的大小控制缩放
- [ ] 之后：反射、进场后的选项和文字、天气、声音

## 新方向：反射网站（2026-11-24 起）
- 圆楼（1985 年建、2020 年关闭）进不去，访客通过街上的反射来"拼出"它。建筑**只出现在反射里**，不能直接看到。
- 用 Three.js `0.160.0`（importmap，jsdelivr CDN）：`three` + `three/addons/`（OrbitControls、OBJLoader，之后还有 Reflector）。版本号要一起改。
- 流程：白色进场页 → 点 Start 变黑底白线 → 反射面闪亮 → 转头 / 拖动环顾 → 点反射面，看到里面的楼。
- 构建顺序，**一次只做一步，等我确认再做下一步**：
  **规则：只维护一个入口 `index.html` + `main.js` + `style.css`。不要再新建并行的测试页面，用户会分不清该打开哪个。**
  1. 加载模型，黑底白线，可以拖动绕着看（已做，检查页已经合并删掉；第 3 步把模型直接放进 main.js）
  2. 全景贴圆柱 + 转视角（已做，在 main.js 里）
     - 半径 50 m，黑底白线。图片在载入时处理成"白线 + 透明"，线色用 `material.color`，背景用 `scene.background`，第 5 步只要渐变这两个颜色
     - 控制：有摄像头就用头部追踪（从 `main.js` 搬过来）；没有摄像头就按住鼠标拖动，松手后有惯性
     - 深度：网格的每个点沿视线往里拉，站在正中看画面不变；转动时相机往同一侧挪 `sway` 米，近处和远处就会错开。默认自动深度（`horizon` 以下当地面）；之后可以换成手画的 `assets/depth.png`（白 = 近，黑 = 远）
     - 起始页和主场景是**同一个画面**，只是颜色不同（第 5 步）
  3. 反射面（已做，现在是 demo：图和模型之后还会换，效果还要慢慢调）
     - **空间结构（2026-11-24 定）**：前方 180° 是手绘全景（2D，保持简单）；**楼在你身后的空地上**（`buildingDistance`），直接看不到，只能在前方的镜子里看到。转身能看到空地，现在只有一条白色地平线。以后点镜子拿到的碎片会落在那里，把楼"盖"起来（2D 和 3D 结合，"屏幕里还有一个屏幕"）
     - 反射方法照搬 `reference/Reflection Cube — Test.html`：楼放在单独的 `hidden` 场景里；`updateReflection()` 把相机按镜面翻过去，把隐藏场景渲染到 render target，再用投影贴回镜子上
     - 镜子朝向 = 「镜子→目标点」和「镜子→sweet spot」的角平分线。目标点 = 楼中心往上或往下挪 `aim` × 半个楼高。每面镜子对准不同高度，合起来才能盖满整栋楼。**站在起点时所有玻璃都是空的**，走到 sweet spot 楼才会从边上滑进来。sweet spot 要离视线够远（大约侧向 15–18 m），否则起点就能看到楼。注意：原地转身不会改变镜子里的东西，只有位置变了才会变
     - 4 面镜子写在 `CONFIG.mirrors` 里，每面有 `region` / `sweet` / `aim`。windows（楼窗，aim 0.75）、bus（巴士，0.25）、mini（-0.2）、phone（手机，-0.7）。shader 用 `box` uniform 只认自己那块黑块
     - `xray: true`：玻璃里那一块前后都取，包括被挡住的背面。因为所有镜子都在同一侧，不这样就永远拿不到楼的背面
     - `carpark.coverage()` 会在能走到的范围里每隔 1.5 m 算一次：每面镜子最多能找到几成，以及站在起点时能看到几条边。加了瓦片以后（2026-11-24）：windows 62% / bus 87% / mini 38% / phone 17%，**合计 100%**。起点时 bus 还能看到 64 条边（最左边那扇窗的边上有一条细缝），其他都是 0
     - **屋顶瓦片纹**：模型的天盆顶（原始高度约 110–150）太光滑，EdgesGeometry 画不出线。`makeRoofTiles()` 先在 `roofTiles.band` 高度范围里找出斜面，从中轴往外水平打射线，找到屋顶表面，再画 `rows` 排横线加上下错开的瓦缝竖线（最下面一排 `perRow` 块，越往上越少）。这些线也算进可以找的边。灯笼下面那圈鱼鳞边先不画（用户决定）。`carpark.revealAll()` 可以一下子预览整栋楼
     - 楼的位置：`buildingDistance` 20 m、直径 20 m（用户嫌原来 40 m 太远）。左上角显示 `FOUND xx%`，全部找到时显示 `THE ROTUNDA IS COMPLETE`
     - 镜子形状：在 `reflection.png` 的 `region` 范围里找黑块，shader 按全景 UV 查遮罩。镜子放在和画上同一个深度的位置，走动时才会贴着画
     - **外观（用户定的）：一整块纯白玻璃，用来引导你靠近；里面的楼是灰色实体加黑色轮廓**（隐藏场景的背景色就是玻璃的白色）。玻璃在全景之后画（`renderOrder = 1`），窗框线由镜子的 shader 画成黑色，压在玻璃上
     - 每面镜子只看得到楼的一部分，看不到一整面：楼放大了（真实直径约 6 m），以后再调
     - **点击玻璃 = 取出碎片**：和 cube 的 `visibleMask` 同一个算法。楼的每条边线按镜面翻过去，从你的眼睛连过去，看那条线是不是穿过玻璃形状。`xray: false` 时，还会再判断这条边是不是"朝向镜中的你"（圆楼近似成圆柱）。取出的是楼**真实的 3D 白色线段**，从镜子飞到身后空地上楼的位置。同一条边不会重复取。`revealError` 可以让碎片位置"猜错一点"（现在是 0）。调试面板显示 `found %`
     - 控制：鼠标左右拖 = 360° 转身；**上下拖 = 抬头 / 低头**（`pitchUp` 60° / `pitchDown` 30°，头上下也能小幅抬头 `headPitch`）；没怎么动就松手 = 点击；滚轮或双指 = 往前走（`walkRadius` 20 m 以内）；头 = 小幅转向加左右挪，**往前倾就走近**（按脸的宽度判断）。`R` 回到起点并把视角放平，`B` 直接显示楼（检查用）
     - 调试：`index.html?pos=-10,-15&yaw=71` 一打开就站在指定位置、朝指定方向（还可以加 `&pitch=30`）；控制台输入 `carpark.reveal("bus")` 等于点一下那面玻璃，`carpark.coverage()` 看覆盖率
     - **OBJ 注意**：Rhino 导出的 obj 混有曲线（`cstype` / `curv` / `parm` / `deg` / `end`），其中 `parm` 会被 OBJLoader 当成点，整个模型就变成 NaN 点云。所以 `loadBuilding()` 先 fetch 文本，删掉这些行，再 `parse`。从 Rhino 导出时只选 mesh 会更干净
     - 自测方法（Claude 用）：用 PowerShell `HttpListener` 起一个本地服务器，再用 Edge 无界面模式（`--headless=new --use-angle=swiftshader --screenshot`）截图。测试页放在 scratchpad 里，自动点 start，加上 `pos`/`yaw` 参数
  4. 所有反射面 + 点击取碎片（已做，和第 3 步合在一起做了）
     - 实际文件是 `assets/reflection.png`：和全景图是同一张底稿，反射点涂成黑块。对比 `panorama.png` 就能找出反射点（全景里是白的、反射图里是黑的）
     - 按物体分组，一共 4 个：楼的窗户、巴士（7 扇窗算 1 个）、手机屏幕、Mini 挡风玻璃。**换了新图以后，要重新量每组的 `region`**（用连通区域找黑块的边界）
  5. 白色进场页 → 变黑 → 反射面闪亮（白变黑已经提前做了；剩下反射面闪亮）
  6. 以后：头部追踪、Open-Meteo 天气、声音
- 模型用 `assets/Untitled.obj`（从 Rhino 导出，Y 轴朝上，方向已经确认是正的）。原始尺寸约 100 × 180 × 100 单位，代码里按 `buildingDiameter` 缩放，底部贴地。**文件名以实际文件为准**；`reference/` 里那套只当参考。
- 代码要简单、有注释；改哪个文件就给那个文件的完整代码。

## 语言规则
- **网页上所有用户能看到的文字都用英文**，包括标题、按钮、状态提示、`alt`、`<title>`。不要出现中文。
- `<html lang="en">`。
- 聊天时我可能中英文夹杂，你跟着我的语言回答就行。

## 和我协作的方式
- 简洁直接。
- 默认直接给完整代码。
- 只有当我说想学代码怎么写时，才一层一层教：先给骨架让我记住，再一次加一块，让我能自己打出来。
- 我偏视觉和联想式思考，能用示意图就别写大段说明。
