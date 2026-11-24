// CAR PARK 主场景
//   - 起始页：白底黑线 → 点 start → 慢慢变成黑底白线
//   - 前方：手绘全景（2D，贴在圆柱上，有一点深度）
//   - 身后：空地（一条地平线）。看不见的圆楼就在那里
//   - 一面镜子（Mini 挡风玻璃）：一整块白玻璃。走到对的位置，楼（灰色 + 黑线）会滑进玻璃里
//   - 点玻璃：把你此刻在玻璃里看到的那部分楼"取出来"，飞到身后的空地上
//   - 控制：鼠标拖动 = 转身（360°）；滚轮 / 双指 = 往前走；头 = 小幅偏移 + 往前倾就靠近
import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

// ===== 我们一起调的参数 =====
const CONFIG = {
  // --- 画面 ---
  image: "assets/panorama.png",
  mask: "assets/reflection.png", // 反射点：和全景同一张底稿，反射的地方涂黑
  radius: 50,          // 最远处（墙）离你多少米
  arc: 180,            // 全景在圆柱上占多少度
  zoom: 1,             // 1 = 正中刚好看到整张图的高度；越大越近

  // --- 颜色：起始页 → 开始后 ---
  startBackground: "#ffffff",
  startLine: "#000000",
  playBackground: "#000000",
  playLine: "#ffffff",
  fadeTime: 2,         // 白变黑用几秒

  // --- 深度 ---
  depthMap: null,      // null = 自动（horizon 以下当地面）；画好以后改成 "assets/depth.png"（白 = 近，黑 = 远）
  near: 8,             // 最近处离你多少米
  horizon: 0.5,        // 自动深度时，从画面哪个高度开始算地面（0 = 顶，1 = 底）

  // --- 走动 ---
  eyeHeight: 1.6,      // 眼睛离地多高（米）
  walkRadius: 20,      // 最多能离起点多远（米）
  wheelSpeed: 0.01,    // 滚轮滚一下走多远
  dragSpeed: 180,      // 拖过整个屏幕宽度转多少度
  dragInvert: false,   // 拖的方向反了就改成 true
  pitchSpeed: 90,      // 上下拖过整个屏幕高度，抬头 / 低头多少度
  pitchUp: 60,         // 最多抬头几度
  pitchDown: 30,       // 最多低头几度
  pitchInvert: false,  // 上下拖的方向反了就改成 true
  inertia: 0.92,       // 松手后的惯性，0 = 立刻停，越接近 1 滑得越久
  smooth: 0.08,        // 0~1，越小越顺滑（越慢）

  // --- 头部（摄像头）---
  mode: "position",    // "position" = 头左右移动 | "yaw" = 头左右转
  invert: false,       // 头的方向反了就改成 true
  sensitivity: 2.5,
  deadzone: 0.03,
  headTurn: 30,        // 头到底时额外转几度
  headPitch: 15,       // 头往上 / 往下到底时，额外抬头 / 低头几度
  pitchSensitivity: 4, // 头上下动多少算"到底"
  sway: 4,             // 头到底时往旁边挪几米（产生深度感）
  leanSensitivity: 4,  // 往前倾多少算"到底"
  leanDistance: 6,     // 往前倾到底时往前走几米

  // --- 楼（只在镜子里看得到）---
  model: "assets/Untitled.obj",
  buildingDiameter: 20, // 楼的直径（米）。真实约 6 m，但放在镜子里太小，先放大
  buildingDistance: 20, // 楼在你身后多远（米）。越小，盖好的楼离你越近
  buildingFill: "#9a9a9a", // 玻璃里楼的颜色
  buildingEdge: "#000000", // 玻璃里楼的轮廓线
  roofTiles: {
    rows: 10,          // 屋顶一共几排瓦
    perRow: 36,        // 最下面一排有几块（越往上越少）
    band: [0.5, 0.82], // 屋顶在楼的哪个高度范围找（0 = 楼底，1 = 楼顶）
  },

  // --- 镜子（反射点）---
  //   region：在 reflection.png 里找黑块的范围 [左, 上, 右, 下]（0~1）
  //   sweet ：站在这一点（米；x 往右为正，z 往前为负），楼正好在玻璃中间
  //   aim   ：这面镜子对准楼的哪个高度（-1 = 楼底，0 = 中间，1 = 楼顶）
  //           每面镜子对准不同高度 → 合起来才能把整栋楼都找到
  mirrors: [
    { name: "windows", region: [0.403, 0.04, 0.50, 0.19], sweet: [-17.5, 0, 3],  aim: 0.75 },
    { name: "bus",     region: [0.27, 0.12, 0.403, 0.37], sweet: [17.5, 0, -9.5], aim: 0.25 },
    { name: "mini",    region: [0.72, 0.36, 0.92, 0.56],  sweet: [-10, 0, -15], aim: -0.2 },
    { name: "phone",   region: [0.29, 0.50, 0.36, 0.66],  sweet: [6, 0, -14],  aim: -0.7 },
  ],
  glass: "#ffffff",    // 玻璃的颜色

  // --- 点击取出的碎片 ---
  revealTime: 1.6,     // 碎片飞到空地上用几秒
  revealError: 0,      // 碎片位置随机偏多少米（0 = 完全准确；调大 = "猜错一点"）
  xray: true,          // true = 玻璃里那一块"前后都取"（包括被挡住的背面），这样才可能盖完整栋楼
};

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const stage = document.getElementById("stage");
const video = document.getElementById("cam");
const dot = document.getElementById("dot");
const intro = document.getElementById("intro");
const startBtn = document.getElementById("start");
const statusEl = document.getElementById("status");
const debug = document.getElementById("debug");
const readout = document.getElementById("readout");

// 屏幕下方的提示文字（例如镜子里什么都没有时）
const msg = document.createElement("div");
Object.assign(msg.style, {
  position: "fixed", left: "50%", bottom: "56px", transform: "translateX(-50%)",
  fontSize: "11px", letterSpacing: "0.15em", color: "#888",
  opacity: "0", transition: "opacity 0.3s", pointerEvents: "none",
});
document.body.appendChild(msg);
let msgTimer = 0;
function flashMsg(text) {
  msg.textContent = text;
  msg.style.opacity = "1";
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (msg.style.opacity = "0"), 1600);
}

const ARC = THREE.MathUtils.degToRad(CONFIG.arc);
const R = CONFIG.radius;

// ======================================================
// 1. 场景、相机、渲染器
// ======================================================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
stage.appendChild(renderer.domElement);

// 主场景：你直接看到的（全景、镜子、地平线、取出来的碎片）
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.startBackground);

// 隐藏场景：只有楼。只有镜子能"看到"它
const hidden = new THREE.Scene();
const HIDDEN_BG = new THREE.Color(CONFIG.glass);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
camera.rotation.order = "YXZ"; // 先左右转，再上下

// 颜色渐变：0 = 起始页（白底黑线），1 = 开始后（黑底白线）
const colors = {
  startBg: new THREE.Color(CONFIG.startBackground),
  playBg: new THREE.Color(CONFIG.playBackground),
  startLine: new THREE.Color(CONFIG.startLine),
  playLine: new THREE.Color(CONFIG.playLine),
};
let theme = 0;
let themeTarget = 0;
const lineMaterials = []; // 跟着主题变色的材质（全景、地平线）

// ======================================================
// 2. 图片工具
// ======================================================
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not load " + src));
    img.src = src;
  });
}

function getPixels(img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return { canvas: c, ctx, data: ctx.getImageData(0, 0, c.width, c.height) };
}

const lum = (px, i) => (px[i] + px[i + 1] + px[i + 2]) / 765;

// 白底黑线 → 只留下线（白色 + 透明度），线色由 material.color 决定
function makeLineTexture(img) {
  const { canvas, ctx, data } = getPixels(img);
  const px = data.data;
  const WHITE = 0.92; // 比这亮的算纸（完全透明）
  const BLACK = 0.35; // 比这暗的算线（完全不透明）
  for (let i = 0; i < px.length; i += 4) {
    let a = (WHITE - lum(px, i)) / (WHITE - BLACK);
    a = Math.min(1, Math.max(0, a)) * (px[i + 3] / 255);
    px[i] = px[i + 1] = px[i + 2] = 255;
    px[i + 3] = a * 255;
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// 反射点遮罩：全景里是白的、reflection.png 里是黑的 → 反射点（白），其他（黑）
// 线条在两张图里都是黑的，所以会自动被排除
function makeMask(panoImg, maskImg) {
  const a = getPixels(panoImg).data.data;
  const { canvas, ctx, data } = getPixels(maskImg);
  const b = data.data;
  const values = new Uint8Array(data.width * data.height);
  for (let i = 0, k = 0; i < b.length; i += 4, k++) {
    const diff = lum(a, i) - lum(b, i);                     // 被涂黑了多少
    const m = Math.min(1, Math.max(0, (diff - 0.15) / 0.3)); // 软边
    values[k] = m * 255;
    b[i] = b[i + 1] = b[i + 2] = m * 255;
    b[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  return { tex, values, width: data.width, height: data.height };
}

// 在遮罩的某个范围里找黑块的边界（0~1）
function findBlob(mask, region) {
  const [ru0, rv0, ru1, rv1] = region;
  let u0 = 1, v0 = 1, u1 = 0, v1 = 0, found = false;
  for (let y = Math.floor(rv0 * mask.height); y < rv1 * mask.height; y++) {
    for (let x = Math.floor(ru0 * mask.width); x < ru1 * mask.width; x++) {
      if (mask.values[y * mask.width + x] < 128) continue;
      found = true;
      u0 = Math.min(u0, x / mask.width);
      u1 = Math.max(u1, (x + 1) / mask.width);
      v0 = Math.min(v0, y / mask.height);
      v1 = Math.max(v1, (y + 1) / mask.height);
    }
  }
  return found ? { u0, v0, u1, v1 } : null;
}

// ======================================================
// 3. 全景圆柱（前方 180°）
// ======================================================
let panoHeight = 0; // 圆柱在墙上（radius 处）的高度
let depthAt = () => 0;
let lineTexture = null;

// 深度：0（远，在墙上）~ 1（最近）
function makeDepthFn(depthImg) {
  if (depthImg) {
    const { data } = getPixels(depthImg);
    return (u, v) => {
      const x = Math.min(data.width - 1, Math.floor(u * data.width));
      const y = Math.min(data.height - 1, Math.floor(v * data.height));
      return lum(data.data, (y * data.width + x) * 4);
    };
  }
  return (u, v) => (v <= CONFIG.horizon ? 0 : (v - CONFIG.horizon) / (1 - CONFIG.horizon));
}

// 全景图上 (u, v) 这一点在 3D 里的位置（站在起点看，正好在那条视线上）
function panoPoint(u, v) {
  const phi = (u - 0.5) * ARC;              // 0 = 正前方，往右为正
  const y = (0.5 - v) * panoHeight;
  const s = Math.pow(CONFIG.near / R, depthAt(u, v)); // 1 = 在墙上，越小越近
  return new THREE.Vector3(R * Math.sin(phi) * s, y * s, -R * Math.cos(phi) * s);
}

// 反过来：3D 里的一点，从起点看过去落在全景图的哪里（u, v）
function panoUV(p) {
  const hd = Math.hypot(p.x, p.z);
  return {
    u: Math.atan2(p.x, -p.z) / ARC + 0.5,
    v: 0.5 - (p.y * R) / hd / panoHeight,
  };
}

function buildPanorama(lineTex) {
  const COLS = 360, ROWS = 120;
  const pos = [], uv = [], index = [];
  for (let j = 0; j <= ROWS; j++) {
    const v = j / ROWS;
    for (let i = 0; i <= COLS; i++) {
      const u = i / COLS;
      pos.push(...panoPoint(u, v).toArray());
      uv.push(u, 1 - v);
    }
  }
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const a = j * (COLS + 1) + i, b = a + 1, c = a + COLS + 1, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);

  const mat = new THREE.MeshBasicMaterial({
    map: lineTex,
    color: CONFIG.startLine,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  lineMaterials.push(mat);
  return new THREE.Mesh(geo, mat);
}

// ======================================================
// 4. 身后的空地：一条地平线
// ======================================================
function buildHorizon() {
  const pts = [];
  const far = 500;
  for (let a = 90; a <= 270; a += 1) {
    const r = THREE.MathUtils.degToRad(a);
    pts.push(new THREE.Vector3(far * Math.sin(r), -CONFIG.eyeHeight, -far * Math.cos(r)));
  }
  const mat = new THREE.LineBasicMaterial({ color: CONFIG.startLine });
  lineMaterials.push(mat);
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
}
scene.add(buildHorizon());

// ======================================================
// 5. 楼（隐藏场景）
// ======================================================
const buildingPos = new THREE.Vector3(0, -CONFIG.eyeHeight, CONFIG.buildingDistance); // 楼的底部中心
const buildingCenter = new THREE.Vector3();
let buildingHeight = 0;
let edges = null;       // 楼的所有边线（世界坐标）：每条 6 个数 [x1 y1 z1 x2 y2 z2]
let edgeFound = null;   // 每条边是不是已经被取出来了

async function loadBuilding() {
  // Rhino 导出的 obj 里混了曲线（cstype / curv / parm / deg / end）。
  // "parm" 会被当成点（p），整个模型就变成了点云 + NaN → 读取前先把这些行删掉
  const res = await fetch(CONFIG.model);
  if (!res.ok) throw new Error("could not load " + CONFIG.model);
  const text = (await res.text())
    .split("\n")
    .filter((line) => !/^\s*(cstype|curv|parm|deg|end|p)\b/.test(line))
    .join("\n");
  const obj = new OBJLoader().parse(text);

  // 缩放到 buildingDiameter 米宽，水平居中，底部贴地
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  obj.scale.setScalar(CONFIG.buildingDiameter / Math.max(size.x, size.z));
  box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x, -box.min.y, -c.z);

  // 灰色实体 + 黑色轮廓（在白玻璃里最清楚）
  const fill = new THREE.MeshBasicMaterial({
    color: CONFIG.buildingFill,
    polygonOffset: true,      // 把实体往后推一点，线才不会被自己挡住
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const line = new THREE.LineBasicMaterial({ color: CONFIG.buildingEdge });

  // 放到你身后（+z 是身后），站在地面上
  const building = new THREE.Group();
  building.add(obj);
  building.position.copy(buildingPos);
  hidden.add(building);
  building.updateMatrixWorld(true);

  // 每个面：换材质，加边线；同时把边线换算成世界坐标存起来（点击时要用）
  const all = [];
  const meshes = [];
  obj.traverse((child) => { if (child.isMesh) meshes.push(child); });
  meshes.forEach((child) => {
    child.material = fill;
    const eg = new THREE.EdgesGeometry(child.geometry, 20);
    child.add(new THREE.LineSegments(eg, line));
    const p = eg.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(child.matrixWorld);
      all.push(v.x, v.y, v.z);
    }
  });

  buildingHeight = size.y * obj.scale.x;
  buildingCenter.set(0, -CONFIG.eyeHeight + buildingHeight / 2, CONFIG.buildingDistance);

  // 屋顶太光滑，EdgesGeometry 画不出线 → 自己在屋顶上画瓦片纹（也算进可以找的边）
  const tiles = makeRoofTiles(meshes);
  if (tiles.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(tiles, 3));
    hidden.add(new THREE.LineSegments(g, line));
    all.push(...tiles);
  }

  edges = new Float32Array(all);
  edgeFound = new Uint8Array(edges.length / 6);
}

// ------------------------------------------------------
// 屋顶瓦片纹：一圈一圈的横线（每排瓦）+ 上下排错开的短竖线（瓦缝），像砌砖
//   1. 找出屋顶的面：斜的、在楼的 band 高度范围里
//   2. 从楼的中轴往外水平打射线，打到屋顶表面的那一点就是线要经过的地方
// ------------------------------------------------------
function makeRoofTiles(meshes) {
  const cfg = CONFIG.roofTiles;
  const bottom = buildingPos.y;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();

  // 1. 屋顶的三角面（世界坐标）
  const tri = [];
  meshes.forEach((mesh) => {
    const p = mesh.geometry.attributes.position; // OBJLoader 读出来的是不共用顶点的三角形
    for (let i = 0; i + 2 < p.count; i += 3) {
      a.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(p, i + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(p, i + 2).applyMatrix4(mesh.matrixWorld);
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
      const ny = Math.abs(n.y);                                  // 0 = 竖墙，1 = 平顶
      const f = ((a.y + b.y + c.y) / 3 - bottom) / buildingHeight; // 在楼的哪个高度（0~1）
      if (ny > 0.15 && ny < 0.97 && f > cfg.band[0] && f < cfg.band[1]) {
        tri.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
    }
  });
  if (!tri.length) { console.warn("roof not found"); return []; }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
  geo.computeBoundingBox();
  const roof = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  roof.updateMatrixWorld();
  const y0 = geo.boundingBox.min.y, y1 = geo.boundingBox.max.y;

  // 2. 屋顶表面上的一点：高度 y、角度 t（取最外面那一层）
  const ray = new THREE.Raycaster();
  const dir = new THREE.Vector3();
  function surfaceAt(y, t) {
    dir.set(Math.cos(t), 0, Math.sin(t));
    ray.set(new THREE.Vector3(buildingPos.x, y, buildingPos.z), dir);
    const hits = ray.intersectObject(roof);
    if (!hits.length) return null;
    return hits[hits.length - 1].point.addScaledVector(dir, 0.03); // 往外推一点，线不会被灰色实体挡住
  }

  const out = [];
  const seg = (p, q) => { if (p && q) out.push(p.x, p.y, p.z, q.x, q.y, q.z); };
  const RING = 96; // 每一圈分成多少段画
  const rows = cfg.rows;
  const rowY = (i) => y0 + (y1 - y0) * (0.03 + 0.94 * (i / rows)); // 上下各留一点边

  // 每一排的半径（取几个方向的平均），用来决定每排有几块瓦：越往上半径越小，块数越少
  const radius = [];
  for (let i = 0; i <= rows; i++) {
    let sum = 0, k = 0;
    for (let j = 0; j < 8; j++) {
      const p = surfaceAt(rowY(i), (j / 8) * Math.PI * 2);
      if (p) { sum += Math.hypot(p.x - buildingPos.x, p.z - buildingPos.z); k++; }
    }
    radius.push(k ? sum / k : 0);
  }
  const rMax = Math.max(...radius) || 1;

  for (let i = 0; i <= rows; i++) {
    // 横线：这一排的下边
    const y = rowY(i);
    let prev = surfaceAt(y, 0), first = prev;
    for (let k = 1; k <= RING; k++) {
      const p = k === RING ? first : surfaceAt(y, (k / RING) * Math.PI * 2);
      seg(prev, p);
      prev = p;
    }
    if (i === rows) break;

    // 竖线：这一排瓦之间的缝，和下一排错开半块
    const yTop = rowY(i + 1);
    const count = Math.max(8, Math.round((cfg.perRow * radius[i]) / rMax));
    for (let k = 0; k < count; k++) {
      const t = ((k + (i % 2) * 0.5) / count) * Math.PI * 2;
      seg(surfaceAt(y, t), surfaceAt(yTop, t));
    }
  }
  return out;
}

// ======================================================
// 6. 镜子（和 Reflection Cube 一样的方法）
//    把你的相机按镜面翻过去 → 拍隐藏场景 → 贴回镜子上
// ======================================================
const mirrors = [];
let maskData = null;

const mirrorVert = `
uniform mat4 texMat;
varying vec4 vProj;
varying vec3 vWorld;
void main() {
  vProj = texMat * vec4(position, 1.0);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const mirrorFrag = `
uniform sampler2D map;    // 镜子拍到的隐藏场景（白底 + 灰楼）
uniform sampler2D mask;   // 反射点遮罩
uniform sampler2D lines;  // 手绘线条（白色 + 透明度）
uniform vec3 glass;
uniform vec4 box;         // 这面镜子的黑块范围 [左, 上, 右, 下]，别的镜子的黑块不算
uniform float arc, H, R;
uniform float live, opacity, flash;
varying vec4 vProj;
varying vec3 vWorld;
void main() {
  // 这一点从起点看过去，落在全景图的哪里 → 查遮罩，只留玻璃的形状
  float phi = atan(vWorld.x, -vWorld.z);
  float hd = length(vWorld.xz);
  float u = phi / arc + 0.5;
  float v = 0.5 - (vWorld.y * R / hd) / H;
  if (u < box.x || u > box.z || v < box.y || v > box.w) discard;
  vec2 uv = vec2(u, 1.0 - v);
  float m = texture2D(mask, uv).r;
  if (m < 0.02) discard;

  vec3 col = glass;                                          // 一整块白玻璃
  if (live > 0.5) col = texture2D(map, vProj.xy / vProj.w).rgb; // 里面的楼
  col = mix(col, vec3(0.0), texture2D(lines, uv).a);        // 画上的窗框线：黑色压在玻璃上
  col = mix(col, vec3(0.55), flash);                         // 点击时闪一下
  gl_FragColor = vec4(col, m * opacity);
}`;

const rtSize = () => [
  Math.floor(innerWidth * Math.min(devicePixelRatio, 2) * 0.6),
  Math.floor(innerHeight * Math.min(devicePixelRatio, 2) * 0.6),
];

function buildMirror(cfg) {
  const blob = findBlob(maskData, cfg.region);
  if (!blob) {
    console.warn("no reflector found in region", cfg.name, cfg.region);
    return null;
  }

  // 镜子中心：黑块中心在 3D 里的位置（和画上的玻璃在同一个深度）
  const M = panoPoint((blob.u0 + blob.u1) / 2, (blob.v0 + blob.v1) / 2);

  // 镜子对准楼的哪一点：中心往上 / 往下挪 aim × 半个楼高
  const target = buildingCenter.clone();
  target.y += (cfg.aim || 0) * buildingHeight / 2;

  // 镜子朝向：「镜子→目标点」和「镜子→sweet spot」的中间 → 站在 sweet spot 正好看到目标点
  const S = new THREE.Vector3(...cfg.sweet);
  const N = target.sub(M).normalize()
    .add(S.clone().sub(M).normalize()).normalize();

  // 镜子大小：盖住整个黑块（斜着放会显小，所以除以 cos）
  const hd = Math.hypot(M.x, M.z);
  const cosT = Math.max(0.2, N.dot(M.clone().negate().normalize()));
  const w = ((blob.u1 - blob.u0) * ARC * hd) / cosT * 1.3;
  const h = ((blob.v1 - blob.v0) * panoHeight * (hd / R)) / cosT * 1.3;

  const rt = new THREE.WebGLRenderTarget(...rtSize());
  rt.texture.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.ShaderMaterial({
    vertexShader: mirrorVert,
    fragmentShader: mirrorFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      map: { value: rt.texture },
      mask: { value: maskData.tex },
      lines: { value: lineTexture },
      glass: { value: new THREE.Color(CONFIG.glass) },
      box: { value: new THREE.Vector4(blob.u0, blob.v0, blob.u1, blob.v1) },
      texMat: { value: new THREE.Matrix4() },
      arc: { value: ARC },
      H: { value: panoHeight },
      R: { value: R },
      live: { value: 1 },
      opacity: { value: 0 },
      flash: { value: 0 },
    },
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.copy(M);
  mesh.lookAt(M.clone().add(N));  // 平面的正面朝 N
  mesh.renderOrder = 1;           // 在全景之后画：白玻璃盖住白线，再自己画黑色窗框线
  mesh.updateMatrixWorld();
  scene.add(mesh);

  return {
    name: cfg.name, blob, pos: M, normal: N, mesh, mat, rt,
    vcam: new THREE.PerspectiveCamera(), flash: 0,
  };
}

// 把你的相机按镜面翻过去（照搬 Reflection Cube 的 updateReflection）
const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _look = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

function updateReflection(m) {
  const M = m.pos, N = m.normal, cam = camera;
  _v.subVectors(M, cam.position);
  if (_v.dot(N) > 0) { m.mat.uniforms.live.value = 0; return false; } // 你在镜子背面
  m.mat.uniforms.live.value = 1;

  _v.reflect(N).negate().add(M);                        // 镜中的你的位置
  _rot.extractRotation(cam.matrixWorld);
  _look.set(0, 0, -1).applyMatrix4(_rot).add(cam.position);
  _t.subVectors(M, _look).reflect(N).negate().add(M);   // 镜中的你看向哪里

  const vc = m.vcam;
  vc.position.copy(_v);
  vc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(N);
  vc.lookAt(_t);
  vc.far = cam.far;
  vc.updateMatrixWorld();
  vc.projectionMatrix.copy(cam.projectionMatrix);

  m.mat.uniforms.texMat.value.copy(BIAS)
    .multiply(vc.projectionMatrix)
    .multiply(vc.matrixWorldInverse)
    .multiply(m.mesh.matrixWorld);
  return true;
}

// 镜子上的一点 X，是不是落在挡风玻璃的形状里
function onGlass(m, X) {
  const { u, v } = panoUV(X);
  const b = m.blob;
  if (u < b.u0 || u > b.u1 || v < b.v0 || v > b.v1) return false;
  const x = Math.floor(u * maskData.width), y = Math.floor(v * maskData.height);
  return maskData.values[y * maskData.width + x] >= 128;
}

// ======================================================
// 7. 点击：取出"你此刻在玻璃里看到的那部分楼"
//    （和 Reflection Cube 的 visibleMask 同一个算法：
//      把楼上的点按镜面翻过去 → 从你眼睛连过去 → 看那条线是不是穿过玻璃）
// ======================================================
const fragments = [];
const clock = new THREE.Clock();
const _Pr = new THREE.Vector3(), _X = new THREE.Vector3(), _d = new THREE.Vector3();

// 楼上的一点 P，眼睛在 C 时，能不能在玻璃里看到
function seenInGlass(m, P, C) {
  const M = m.pos, N = m.normal;
  const dist = _t.subVectors(P, M).dot(N);
  if (dist <= 0) return false;                          // 在镜子背后
  _Pr.copy(P).addScaledVector(N, -2 * dist);            // 镜中的像
  _d.subVectors(_Pr, C);
  const den = _d.dot(N);
  if (Math.abs(den) < 1e-6) return false;
  const s = _t.subVectors(M, C).dot(N) / den;
  if (s <= 0 || s >= 1) return false;
  _X.copy(C).addScaledVector(_d, s);                    // 视线穿过镜面的那一点
  return onGlass(m, _X);
}

// 这条边是不是朝着"镜中的你"（圆楼近似成圆柱：外墙朝外）
// 只在 CONFIG.xray = false 时用；xray = true 时玻璃里那一块前后都取
const _E = new THREE.Vector3();
function facesViewer(m, P, C) {
  if (CONFIG.xray) return true;
  const nx = P.x - buildingPos.x, nz = P.z - buildingPos.z;
  const len = Math.hypot(nx, nz);
  if (len < CONFIG.buildingDiameter * 0.15) return false; // 太靠中轴的当成内部
  _E.copy(C).addScaledVector(m.normal, -2 * _t.subVectors(C, m.pos).dot(m.normal)); // 镜中的你
  return (nx * (_E.x - P.x) + nz * (_E.z - P.z)) / len > 0;
}

// 眼睛在 C 时，第 i 条边能不能在这面镜子里看到
const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _M = new THREE.Vector3();
function edgeSeen(m, i, C) {
  _A.fromArray(edges, i * 6);
  _B.fromArray(edges, i * 6 + 3);
  _M.addVectors(_A, _B).multiplyScalar(0.5);
  if (!facesViewer(m, _M, C) || !seenInGlass(m, _M, C)) return false;
  return seenInGlass(m, _A, C) || seenInGlass(m, _B, C);
}

function reveal(m) {
  if (!edges || !updateReflection(m)) {
    flashMsg("NOTHING IN THIS MIRROR FROM HERE");
    return;
  }
  const A = _A, B = _B;
  const found = [];
  let seen = 0;
  for (let i = 0; i < edgeFound.length; i++) {
    if (!edgeSeen(m, i, camera.position)) continue;
    seen++;
    if (edgeFound[i]) continue;
    edgeFound[i] = 1;
    // 存成相对于楼底中心的坐标（碎片飞的时候整体移动）
    found.push(A.x - buildingPos.x, A.y - buildingPos.y, A.z - buildingPos.z,
               B.x - buildingPos.x, B.y - buildingPos.y, B.z - buildingPos.z);
  }

  if (!seen) { flashMsg("NOTHING IN THIS MIRROR FROM HERE"); return; }
  if (!found.length) { flashMsg("YOU HAVE ALREADY FOUND THIS PART"); return; }
  if (edgeFound.every((x) => x)) setTimeout(() => flashMsg("THE ROTUNDA IS COMPLETE"), CONFIG.revealTime * 1000);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(found, 3));
  const mat = new THREE.LineBasicMaterial({ color: CONFIG.playLine, transparent: true, opacity: 0 });
  const obj = new THREE.LineSegments(geo, mat);
  obj.position.copy(m.pos);
  obj.scale.setScalar(0.05);
  scene.add(obj);

  const err = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)
    .multiplyScalar(CONFIG.revealError * 2);
  fragments.push({
    obj, mat,
    from: m.pos.clone(),
    to: buildingPos.clone().add(err),
    start: clock.elapsedTime,
  });
  m.flash = 1;
}

function updateFragments(t) {
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  fragments.forEach((f) => {
    const k = Math.min(1, (t - f.start) / CONFIG.revealTime);
    const e = ease(k);
    f.obj.position.lerpVectors(f.from, f.to, e);
    f.obj.scale.setScalar(0.05 + 0.95 * e);
    f.mat.opacity = Math.min(1, k * 1.5);
  });
}

// 鼠标下面是不是玻璃
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function glassUnder(e) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  for (const hit of raycaster.intersectObjects(mirrors.map((m) => m.mesh))) {
    const m = mirrors.find((x) => x.mesh === hit.object);
    if (onGlass(m, hit.point)) return m;
  }
  return null;
}

// 检查用：在能走到的范围里每隔 step 米站一下，看每面镜子一共能找到多少条边
// （不会真的取出碎片，只是算一算"这个 demo 能不能把楼盖完"）
function coverage(step = 1.5) {
  if (!edges) return "not loaded";
  const total = edgeFound.length;
  const any = new Uint8Array(total);
  const result = {};
  const C = new THREE.Vector3();
  for (const m of mirrors) {
    const mine = new Uint8Array(total);
    for (let x = -CONFIG.walkRadius; x <= CONFIG.walkRadius; x += step) {
      for (let z = -CONFIG.walkRadius; z <= CONFIG.walkRadius; z += step) {
        if (Math.hypot(x, z) > CONFIG.walkRadius) continue;
        C.set(x, 0, z);
        if (_t.subVectors(m.pos, C).dot(m.normal) > 0) continue; // 在镜子背面
        for (let i = 0; i < total; i++) if (!mine[i] && edgeSeen(m, i, C)) mine[i] = any[i] = 1;
      }
    }
    // 站在起点时能看到几条（应该是 0：起点时玻璃是空的）
    let atStart = 0;
    for (let i = 0; i < total; i++) if (edgeSeen(m, i, C.set(0, 0, 0))) atStart++;
    result[m.name] = `${Math.round((mine.reduce((a, b) => a + b, 0) / total) * 100)}% (at start: ${atStart})`;
  }
  result.all = `${Math.round((any.reduce((a, b) => a + b, 0) / total) * 100)}%`;
  return result;
}

// ======================================================
// 8. 载入全部东西
// ======================================================
async function init() {
  const [img, maskImg, depthImg] = await Promise.all([
    loadImage(CONFIG.image),
    loadImage(CONFIG.mask),
    CONFIG.depthMap ? loadImage(CONFIG.depthMap) : null,
    loadBuilding(),
  ]);

  depthAt = makeDepthFn(depthImg);
  panoHeight = (ARC * R) / (img.width / img.height); // 按图片比例，图不变形
  lineTexture = makeLineTexture(img);
  scene.add(buildPanorama(lineTexture));
  updateProjection();

  maskData = makeMask(img, maskImg);
  for (const cfg of CONFIG.mirrors) {
    const m = buildMirror(cfg);
    if (m) mirrors.push(m);
  }
}
init().catch((err) => {
  console.error(err);
  statusEl.textContent = "could not load the scene";
});

function updateProjection() {
  if (!panoHeight) return;
  const tanV = panoHeight / 2 / R / CONFIG.zoom; // 正中刚好看到整张图的高度
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanV));
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

// ======================================================
// 9. 控制：转身、走动、头
// ======================================================
let started = false;
let yawTarget = 0, yaw = 0;                       // 拖动的转向（弧度，往右为正）
let pitchTarget = 0, pitch = 0;                   // 抬头 / 低头（弧度，抬头为正）
const walkTarget = new THREE.Vector3();           // 滚轮走到哪
const walk = new THREE.Vector3();
let headTarget = 0, head = 0;                     // 头左右 -1 ~ 1
let headYTarget = 0, headY = 0;                   // 头上下 -1 ~ 1
let leanTarget = 0, lean = 0;                     // 往前倾 -1 ~ 1

// 抬头 / 低头的范围
const clampPitch = (p) => THREE.MathUtils.clamp(p,
  -THREE.MathUtils.degToRad(CONFIG.pitchDown), THREE.MathUtils.degToRad(CONFIG.pitchUp));

// 调试用：index.html?pos=-8,-12&yaw=55 → 一打开就站在那里、朝那个方向
const params = new URLSearchParams(location.search);
if (params.has("pos")) {
  const [x, z] = params.get("pos").split(",").map(Number);
  walkTarget.set(x, 0, z);
  walk.copy(walkTarget);
}
if (params.has("yaw")) yawTarget = yaw = THREE.MathUtils.degToRad(Number(params.get("yaw")));
if (params.has("pitch")) pitchTarget = pitch = clampPitch(THREE.MathUtils.degToRad(Number(params.get("pitch"))));

// 9a. 鼠标：左右拖 = 转身；上下拖 = 抬头 / 低头；没怎么动就松手 = 点击
let dragging = false, lastX = 0, lastY = 0, velocity = 0, pitchVelocity = 0, downX = 0, downY = 0;

stage.addEventListener("pointerdown", (e) => {
  if (!started) return;
  dragging = true;
  lastX = downX = e.clientX;
  lastY = downY = e.clientY;
  velocity = pitchVelocity = 0;
  stage.classList.add("dragging");
  stage.setPointerCapture(e.pointerId);
});

stage.addEventListener("pointermove", (e) => {
  if (!dragging) {
    // 鼠标停在玻璃上 → 手指光标
    if (started) stage.style.cursor = glassUnder(e) ? "pointer" : "";
    return;
  }
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  // 像抓住画面往一边拉：往左拖 → 看向右边
  let d = (-dx / innerWidth) * THREE.MathUtils.degToRad(CONFIG.dragSpeed);
  if (CONFIG.dragInvert) d = -d;
  yawTarget += d;
  velocity = d;

  // 上下：往下拖 → 画面往下走 → 抬头看到更上面
  const dy = e.clientY - lastY;
  lastY = e.clientY;
  let p = (dy / innerHeight) * THREE.MathUtils.degToRad(CONFIG.pitchSpeed);
  if (CONFIG.pitchInvert) p = -p;
  pitchTarget = clampPitch(pitchTarget + p);
  pitchVelocity = p;
});

function endDrag(e) {
  if (!dragging) return;
  dragging = false;
  stage.classList.remove("dragging");
  if (e && Math.hypot(e.clientX - downX, e.clientY - downY) < 5) {
    velocity = pitchVelocity = 0;
    const m = glassUnder(e);
    if (m) reveal(m);
  }
}
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", () => endDrag(null));

// 9b. 滚轮 / 触控板双指 = 往看的方向走
stage.addEventListener("wheel", (e) => {
  if (!started) return;
  e.preventDefault(); // 不让页面缩放
  const k = e.ctrlKey ? 5 : 1; // 双指缩放的数值比较小，放大一点
  walkTarget.addScaledVector(forward(yaw), -e.deltaY * CONFIG.wheelSpeed * k);
  walkTarget.clampLength(0, CONFIG.walkRadius);
}, { passive: false });

// 看向 yaw 方向时，"前"和"右"是哪边
function forward(a) { return new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)); }
function right(a) { return new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); }

// 9c. 摄像头 + 头部追踪
let landmarker = null;
let usingCamera = false;
let center = null, centerWidth = null, centerY = null;
let raw = 0, rawWidth = 0, rawY = 0;
let lastVideoTime = -1;

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  started = true;
  themeTarget = 1;                          // 白底黑线 → 黑底白线
  document.body.classList.add("play");
  try {
    statusEl.textContent = "opening camera…";
    await initCamera();
    statusEl.textContent = "loading face tracker…";
    await initTracker();
    usingCamera = true;
    intro.classList.add("gone");
  } catch (err) {
    console.warn(err);
    stopCamera();
    statusEl.textContent = "camera unavailable — drag to look around, scroll to walk";
    setTimeout(() => intro.classList.add("gone"), 1800);
  }
});

async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

function stopCamera() {
  const stream = video.srcObject;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

async function initTracker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
  });
}

function readHead(lm) {
  const nose = lm[1];
  if (CONFIG.mode === "yaw") {
    const l = lm[234], r = lm[454];
    return (nose.x - (l.x + r.x) / 2) / Math.abs(r.x - l.x);
  }
  return nose.x - 0.5;
}

// 死区：中间一小段不动，出了死区从 0 开始平滑增加
const dead = (v) => Math.sign(v) * Math.max(0, Math.abs(v) - CONFIG.deadzone);

function track() {
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const res = landmarker.detectForVideo(video, performance.now());
  const lm = res.faceLandmarks[0];
  if (!lm) return; // 没看到脸就停在原地

  raw = readHead(lm);
  rawWidth = Math.abs(lm[454].x - lm[234].x); // 脸的宽度：越靠近屏幕越宽
  rawY = lm[1].y;                             // 鼻尖的高度（0 = 画面顶，1 = 画面底）
  if (center === null) calibrate();           // 第一次看到脸时自动校准

  // 左右：摄像头画面没镜像，你往左，鼻子在画面里往右，所以取负号
  let x = dead(-(raw - center) * CONFIG.sensitivity);
  if (CONFIG.invert) x = -x;
  headTarget = THREE.MathUtils.clamp(x, -1, 1);

  // 前后：脸变大 = 往前倾 = 走近
  const l = dead((rawWidth / centerWidth - 1) * CONFIG.leanSensitivity);
  leanTarget = THREE.MathUtils.clamp(l, -1, 1);

  // 上下：头往上抬，鼻尖在画面里往上（y 变小）→ 抬头看
  const y = dead(-(rawY - centerY) * CONFIG.pitchSensitivity);
  headYTarget = THREE.MathUtils.clamp(y, -1, 1);
}

// 把现在头的位置当作"正中"
function calibrate() {
  center = raw;
  centerWidth = rawWidth;
  centerY = rawY;
}

// ======================================================
// 10. 颜色渐变
// ======================================================
function updateTheme(dt) {
  if (theme === themeTarget) return;
  const step = dt / CONFIG.fadeTime;
  theme = theme < themeTarget ? Math.min(themeTarget, theme + step) : Math.max(themeTarget, theme - step);
  const t = THREE.MathUtils.smoothstep(theme, 0, 1);
  scene.background.copy(colors.startBg).lerp(colors.playBg, t);
  lineMaterials.forEach((m) => m.color.copy(colors.startLine).lerp(colors.playLine, t));
}

// ======================================================
// 11. 渲染循环 + 快捷键
// ======================================================
let showBuilding = false;

window.addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  updateProjection();
  mirrors.forEach((m) => m.rt.setSize(...rtSize()));
});

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "d") debug.classList.toggle("hidden");
  if (k === "c") calibrate();                                // 重新校准头的中心
  if (k === "b") showBuilding = !showBuilding;               // 直接显示楼（检查用）
  if (k === "r") { yawTarget = pitchTarget = 0; velocity = pitchVelocity = 0; walkTarget.set(0, 0, 0); } // 回到起点
});

// 调试用（在浏览器控制台里输入）：
//   carpark.reveal("bus")  = 点一下那面玻璃
//   carpark.coverage()     = 算一算每面镜子最多能找到楼的百分之几
//   carpark.revealAll()    = 一下子把整栋楼都放到空地上（预览用）
window.carpark = {
  reveal: (name) => { const m = mirrors.find((x) => x.name === name) || mirrors[0]; if (m) reveal(m); },
  revealAll: () => {
    if (!edges) return;
    const local = edges.map((v, i) => v - buildingPos.getComponent(i % 3));
    const mat = new THREE.LineBasicMaterial({ color: CONFIG.playLine, transparent: true, opacity: 0 });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(local, 3));
    const obj = new THREE.LineSegments(g, mat);
    scene.add(obj);
    fragments.push({ obj, mat, from: buildingPos.clone(), to: buildingPos.clone(), start: clock.elapsedTime });
    edgeFound.fill(1);
  },
  coverage,
};

// 左上角：已经找到了多少
const hud = document.createElement("div");
Object.assign(hud.style, {
  position: "fixed", left: "18px", top: "16px", fontSize: "11px", letterSpacing: "0.15em",
  color: "#777", opacity: "0", transition: "opacity 1s", pointerEvents: "none",
});
document.body.appendChild(hud);

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  if (usingCamera && landmarker) track();

  // 松手后的惯性
  if (!dragging && velocity !== 0) {
    yawTarget += velocity;
    velocity *= CONFIG.inertia;
    if (Math.abs(velocity) < 0.00005) velocity = 0;
  }
  if (!dragging && pitchVelocity !== 0) {
    pitchTarget = clampPitch(pitchTarget + pitchVelocity);
    pitchVelocity *= CONFIG.inertia;
    if (Math.abs(pitchVelocity) < 0.00005) pitchVelocity = 0;
  }

  // 平滑
  const s = CONFIG.smooth;
  yaw += (yawTarget - yaw) * s;
  pitch += (pitchTarget - pitch) * s;
  headY += (headYTarget - headY) * s;
  walk.lerp(walkTarget, s);
  head += (headTarget - head) * s;
  lean += (leanTarget - lean) * s;
  updateTheme(dt);
  updateFragments(t);

  // 相机：拖动的方向 + 头的偏移；位置 = 走到的地方 + 头往旁边挪 + 往前倾
  const look = yaw + head * THREE.MathUtils.degToRad(CONFIG.headTurn);
  camera.rotation.y = -look; // Three.js 里正数是往左转，所以取负
  // 抬头 / 低头：拖动的角度 + 头上下的偏移（Three.js 里 rotation.x 正数 = 抬头）
  camera.rotation.x = clampPitch(pitch + headY * THREE.MathUtils.degToRad(CONFIG.headPitch));
  camera.position.copy(walk)
    .addScaledVector(right(yaw), head * CONFIG.sway)
    .addScaledVector(forward(yaw), lean * CONFIG.leanDistance);
  camera.updateMatrixWorld();

  // 镜子：开始后慢慢出现；先拍隐藏场景，再画主画面
  hidden.background = HIDDEN_BG;
  for (const m of mirrors) {
    m.flash *= 0.9;
    m.mat.uniforms.flash.value = m.flash;
    m.mat.uniforms.opacity.value = theme;
    if (theme > 0 && updateReflection(m)) {
      renderer.setRenderTarget(m.rt);
      renderer.render(hidden, m.vcam);
    }
  }
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);

  // 按 B：把楼直接叠在画面上（只是检查位置用）
  if (showBuilding) {
    hidden.background = null;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(hidden, camera);
    renderer.autoClear = true;
  }

  // 指示条：现在朝哪个方向（-180° ~ 180°）
  const deg = THREE.MathUtils.radToDeg(Math.atan2(Math.sin(look), Math.cos(look)));
  dot.style.left = `${74 + (deg / 180) * 74}px`;
  const total = edgeFound ? edgeFound.length : 0;
  const got = edgeFound ? edgeFound.reduce((a, b) => a + b, 0) : 0;
  const pct = total ? Math.round((got / total) * 100) : 0;
  hud.textContent = `FOUND ${pct}%`;
  hud.style.opacity = started ? "1" : "0";
  readout.innerHTML =
    `${usingCamera ? "head + drag" : "drag"} · facing ${deg.toFixed(0)}°<br>` +
    `pos ${camera.position.x.toFixed(1)}, ${camera.position.z.toFixed(1)} m · lean ${lean.toFixed(2)}<br>` +
    `found ${pct}%`;
});
