import * as THREE from "../public/vendor/three.module.js";
import {
  circlesOverlap,
  collectTouchedHair,
  createDroppedHair,
  createInitialHair,
  hitVomit,
  isInsideRect,
  joystickHeading,
  keyboardTurn,
  normalizedAngle,
  resolveMovement,
  stepWanderer,
  turnToward,
} from "./core.js";

const canvas = document.querySelector("#game");
const ui = {
  grams: document.querySelector("#grams"),
  time: document.querySelector("#time"),
  intro: document.querySelector("#intro"),
  result: document.querySelector("#result"),
  resultGrams: document.querySelector("#result-grams"),
  resultCopy: document.querySelector("#result-copy"),
  resultKicker: document.querySelector("#result-kicker"),
  kotaroCount: document.querySelector("#kotaro-count"),
  yuragiCount: document.querySelector("#yuragi-count"),
  start: document.querySelector("#start"),
  restart: document.querySelector("#restart"),
  controls: document.querySelector("#controls"),
  joystick: document.querySelector("#joystick"),
  stick: document.querySelector("#stick"),
  message: document.querySelector("#message"),
  robot: document.querySelector("#robot-foreground"),
};

const CHARACTER_TEMPLATES = {
  kotaro: { id: "kotaro", type: "kotaro", x: 3.2, z: 8.1, angle: .8, speed: .42, radius: .64, turnAt: 0, seed: 2 },
  yuragi: { id: "yuragi", type: "yuragi", x: -.15, z: 8.8, angle: -1.4, speed: .28, radius: .74, turnAt: 0, seed: 7 },
  baby: { id: "baby", type: "baby", x: -3.7, z: 8.2, angle: 2.1, speed: .34, radius: .68, turnAt: 0, seed: 11 },
};
const CHARACTER_ANIMATIONS = {
  kotaro: {
    walk: "./public/assets/animation/kotaro-walk-8-normalized.png",
    stretch: "./public/assets/animation/kotaro-stretch-8-normalized.png",
    scratch: "./public/assets/animation/kotaro-scratch-8-normalized.png",
    yawn: "./public/assets/animation/kotaro-yawn-8-normalized.png",
  },
  yuragi: {
    walk: "./public/assets/animation/yuragi-walk-8-normalized.png",
    stretch: "./public/assets/animation/yuragi-stretch-8-normalized.png",
    scratch: "./public/assets/animation/yuragi-scratch-8-normalized.png",
    yawn: "./public/assets/animation/yuragi-yawn-8-normalized.png",
  },
  baby: {
    crawl: "./public/assets/animation/baby-crawl-8-normalized.png",
  },
};
const ROSTERS = [["kotaro", "baby"], ["yuragi", "baby"], ["kotaro", "yuragi"]];
let rosterTurn = 0;

const sofa = { id: "sofa", x: 3.15, z: 5.65, w: 4.35, d: 2.55, clearance: .5 };
const tableArea = { id: "table", x: -2.7, z: 6.55, w: 4.1, d: 2.65 };
const solids = [];
for (const [id, x, z] of [
  ["sofa-leg-1", 4.82, 4.7], ["sofa-leg-2", 1.48, 4.7], ["sofa-leg-3", 4.82, 6.6], ["sofa-leg-4", 1.48, 6.6],
  ["table-leg-1", -.95, 5.5], ["table-leg-2", -4.45, 5.5], ["table-leg-3", -.95, 7.6], ["table-leg-4", -4.45, 7.6],
  ["chair-a1", -3.5, 4.2], ["chair-a2", -4.3, 4.2], ["chair-a3", -3.5, 5.0], ["chair-a4", -4.3, 5.0],
  ["chair-b1", -3.6, 8.0], ["chair-b2", -4.4, 8.0], ["chair-b3", -3.6, 8.8], ["chair-b4", -4.4, 8.8],
]) solids.push({ id, kind: "circle", x, z, radius: id.startsWith("table") ? .18 : .15 });
solids.push(
  { id: "side-cabinet", kind: "rect", x: 5.28, z: 2.25, w: 1.5, d: .58 },
  { id: "left-bookcase", kind: "rect", x: -5.15, z: 6.8, w: .72, d: 2.7 },
  { id: "right-console", kind: "rect", x: 5.16, z: 8.7, w: .72, d: 2.35 },
);

const vomits = [
  { id: "v1", x: .78, z: 2.8, radius: .38 },
  { id: "v2", x: -2.25, z: 10.25, radius: .36 },
];

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8d7d1);
scene.fog = new THREE.Fog(0xe8d7d1, 14, 31);
const camera = new THREE.PerspectiveCamera(78, 1, .06, 28);
scene.add(camera);

const world = new THREE.Group();
scene.add(world);
const hairObjects = new Map();
const characterObjects = new Map();
const characterShadows = new Map();
const characterAnimationTextures = new Map();
const furnitureMeshes = { sofa: [], table: [] };
const furnitureFacades = { sofa: null, table: null };
const keys = new Set();
const input = { x: 0, y: 0, suction: false, joystickPointer: null, anchorAngle: 0 };
const visual = { x: 0, z: 0, angle: 0, pitch: .025 };
let state = makeState();
let lastFrame = performance.now();
let messageTimer = 0;
let audio = null;
let robotRing = null;
let suctionLight = null;
let hairAtlasTexture = null;

function makeState() {
  return {
    mode: "intro",
    player: { x: 0, z: 0, angle: 0, radius: .26 },
    hairs: createInitialHair(),
    grams: 0,
    counts: { kotaro: 0, yuragi: 0 },
    remaining: 60,
    lastCollisionAt: 0,
    wanderers: ROSTERS[rosterTurn++ % ROSTERS.length].map((id) => ({
      ...CHARACTER_TEMPLATES[id],
      scratchAt: performance.now() + 4500 + CHARACTER_TEMPLATES[id].seed * 420,
      scratchingUntil: 0,
      scratchDropped: false,
      action: id === "baby" ? "crawl" : "walk",
      actionStartedAt: performance.now(),
      actionUntil: 0,
      actionIndex: 0,
    })),
  };
}

function box(w, h, d, color, x, y, z, texture = null) {
  const material = new THREE.MeshStandardMaterial({ color: texture ? 0xffffff : color, roughness: .82, metalness: 0, map: texture, bumpMap: texture, bumpScale: texture ? .014 : 0 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.add(mesh);
  if (Math.max(w, h, d) < 5) {
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x604b52, transparent: true, opacity: .22 }));
    mesh.add(outline);
  }
  return mesh;
}

function roundedBox(w, h, d, radius, color, x, y, z, texture = null) {
  const r = Math.min(radius, w / 2, h / 2);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r); shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r); shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: Math.min(.045, r * .35),
    bevelThickness: .035,
    curveSegments: 5,
  });
  geometry.translate(0, 0, -d / 2);
  const material = new THREE.MeshStandardMaterial({ color: texture ? 0xffffff : color, roughness: .8, metalness: 0, map: texture, bumpMap: texture, bumpScale: texture ? .018 : 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; world.add(mesh);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), new THREE.LineBasicMaterial({ color: 0x604b52, transparent: true, opacity: .2 }));
  mesh.add(outline);
  return mesh;
}

function pixelTexture(width, height, draw, repeatX = 1, repeatY = 1) {
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const context = source.getContext("2d");
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

function buildRoom() {
  const floorTexture = pixelTexture(192, 256, (g, w, h) => {
    g.fillStyle = "#d09a78"; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = x % 64 ? "#d8a07c" : "#c58d70"; g.fillRect(x, 0, 31, h);
      g.fillStyle = "rgba(85,55,51,.2)"; g.fillRect(x + 31, 0, 1, h);
    }
    for (let y = 0; y < h; y += 64) { g.fillStyle = "rgba(255,214,184,.16)"; g.fillRect(0, y, w, 1); }
    for (let i = 0; i < 150; i += 1) {
      const x = (i * 47) % w; const y = (i * 83) % h;
      g.fillStyle = i % 3 ? "rgba(255,223,192,.12)" : "rgba(72,47,44,.10)"; g.fillRect(x, y, 2 + i % 5, 1);
    }
  }, 3, 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(11.2, 15.2), new THREE.MeshPhysicalMaterial({ map: floorTexture, roughness: .55, metalness: .02, clearcoat: .16, clearcoatRoughness: .6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 4.3);
  floor.receiveShadow = true;
  world.add(floor);

  const rugTexture = pixelTexture(96, 96, (g, w, h) => {
    g.fillStyle = "#c7bdd8"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#e4d9e4"; g.lineWidth = 4; g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = "rgba(255,245,235,.28)";
    for (let i = 0; i < 24; i += 1) g.fillRect((i * 29) % w, (i * 47) % h, 3, 3);
  }, 2.4, 1.4);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 3.25), new THREE.MeshStandardMaterial({ map: rugTexture, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(2.45, .008, 7.5); rug.receiveShadow = true; world.add(rug);

  const wallTexture = pixelTexture(96, 96, (g, w, h) => {
    g.fillStyle = "#dfc9c8"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 180; i += 1) { g.fillStyle = i % 2 ? "rgba(255,245,232,.1)" : "rgba(111,87,101,.06)"; g.fillRect((i * 31) % w, (i * 57) % h, 1, 2); }
  }, 3, 3);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(11.2, 15.2), new THREE.MeshBasicMaterial({ color: 0xeadedd, side: THREE.DoubleSide }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 8, 4.3); ceiling.receiveShadow = true; world.add(ceiling);
  box(11.2, 8, .12, 0xdfc9c8, 0, 4, 11.94, wallTexture);
  box(11.2, 8, .12, 0xdfc9c8, 0, 4, -3.16, wallTexture);
  box(.12, 8, 15.2, 0xdfc9c8, -5.54, 4, 4.3, wallTexture);
  box(.12, 8, 15.2, 0xdfc9c8, 5.54, 4, 4.3, wallTexture);
  box(11.05, .13, .16, 0xc3a6a8, 0, .08, 11.82);
  box(11.05, .13, .16, 0xc3a6a8, 0, .08, -3.04);
  box(.16, .13, 14.9, 0xc3a6a8, -5.43, .08, 4.38);
  box(.16, .13, 14.9, 0xc3a6a8, 5.43, .08, 4.38);

  const hemi = new THREE.HemisphereLight(0xfff0e4, 0x766477, 1.05);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xfff5ee, .42));
  const sun = new THREE.DirectionalLight(0xffdfbd, 1.65);
  sun.position.set(1.2, 4.8, 13.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -7; sun.shadow.camera.right = 7; sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -3;
  scene.add(sun);
  const fill = new THREE.PointLight(0xc9b6ff, .55, 9);
  fill.position.set(-4, 1.5, 5); scene.add(fill);
  buildSofa();
  buildTable();
  buildDecor();
}

async function buildBackWallArt() {
  const texture = await new THREE.TextureLoader().loadAsync("./public/assets/back-wall-v2.png");
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const wallArt = new THREE.Mesh(
    new THREE.PlaneGeometry(11.05, 7.82),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false })
  );
  wallArt.position.set(0, 4, 11.82);
  wallArt.rotation.y = Math.PI;
  world.add(wallArt);
}

async function buildSideWallArt() {
  const texture = await new THREE.TextureLoader().loadAsync("./public/assets/side-wall-v2.png");
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
  const left = new THREE.Mesh(new THREE.PlaneGeometry(15.0, 7.82), material);
  left.position.set(-5.46, 4, 4.3); left.rotation.y = Math.PI / 2; world.add(left);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(15.0, 7.82), material.clone());
  right.position.set(5.46, 4, 4.3); right.rotation.y = -Math.PI / 2; world.add(right);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(11.05, 7.82), material.clone());
  front.position.set(0, 4, -3.08); world.add(front);
}

async function buildSofaFacade() {
  const texture = await new THREE.TextureLoader().loadAsync("./public/assets/sofa-facade-cropped-v2.png");
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const facade = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 2.8),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: .04, side: THREE.FrontSide, toneMapped: false }),
  );
  facade.position.set(2.55, 1.34, 4.47);
  facade.rotation.y = Math.PI;
  facade.renderOrder = 2;
  world.add(facade);
  furnitureFacades.sofa = facade;

  const tableTexture = await new THREE.TextureLoader().loadAsync("./public/assets/table-facade-cropped-v2.png");
  tableTexture.colorSpace = THREE.SRGBColorSpace;
  tableTexture.magFilter = THREE.NearestFilter;
  tableTexture.minFilter = THREE.LinearMipmapLinearFilter;
  const tableFacade = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 2.85),
    new THREE.MeshBasicMaterial({ map: tableTexture, transparent: true, alphaTest: .04, side: THREE.FrontSide, toneMapped: false }),
  );
  tableFacade.position.set(-2.72, 1.38, 5.22);
  tableFacade.rotation.y = Math.PI;
  tableFacade.renderOrder = 2;
  world.add(tableFacade);
  furnitureFacades.table = tableFacade;
}

function buildCollisionGuides() {
  const wood = pixelTexture(32, 64, (g, w, h) => {
    g.fillStyle = "#76513f"; g.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 9) { g.fillStyle = "rgba(240,180,125,.15)"; g.fillRect(0, y, w, 1); }
    for (let i = 0; i < 14; i += 1) { g.fillStyle = "rgba(45,28,29,.14)"; g.fillRect((i * 11) % w, (i * 17) % h, 8, 1); }
  }, 1, 2);
  for (const solid of solids) {
    const sofaLeg = solid.id.startsWith("sofa");
    const tableLeg = solid.id.startsWith("table");
    const height = sofaLeg ? .34 : tableLeg ? .9 : .58;
    const width = sofaLeg ? .26 : tableLeg ? .22 : .15;
    box(width, height, width, 0x76513f, solid.x, height / 2, solid.z, wood);
  }
}

function buildSofa() {
  const childStart = world.children.length;
  const fabric = pixelTexture(64, 64, (g, w, h) => {
    g.fillStyle = "#9c8eae"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 180; i += 1) { g.fillStyle = i % 3 ? "rgba(255,244,249,.12)" : "rgba(52,41,65,.11)"; g.fillRect((i * 17) % w, (i * 31) % h, 1, 2); }
  }, 3, 2);
  roundedBox(4.18, .24, 2.24, .1, 0x877a98, 3.15, .64, 5.65, fabric);
  roundedBox(1.92, .42, 2.02, .16, 0xb1a5bc, 4.18, .95, 5.57, fabric);
  roundedBox(1.92, .42, 2.02, .16, 0xa89bb6, 2.12, .95, 5.57, fabric);
  roundedBox(4.35, 1.18, .34, .14, 0x8f819f, 3.15, 1.5, 6.66, fabric);
  roundedBox(.35, .72, 2.2, .14, 0x8f819f, 5.12, 1.21, 5.65, fabric);
  roundedBox(.35, .72, 2.2, .14, 0x8f819f, 1.18, 1.21, 5.65, fabric);
  roundedBox(1.82, .18, 1.8, .08, 0xb3a7be, 4.18, 1.29, 5.57, fabric);
  roundedBox(1.82, .18, 1.8, .08, 0xaa9db8, 2.12, 1.29, 5.57, fabric);
  const piping = new THREE.MeshStandardMaterial({ color: 0xd8ccdc, roughness: .92 });
  for (const x of [2.12, 4.18]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(1.7, .026, .026), piping);
    seam.position.set(x, 1.33, 4.55); seam.castShadow = true; world.add(seam);
  }
  const centerSeam = new THREE.Mesh(new THREE.BoxGeometry(.028, .28, .028), piping);
  centerSeam.position.set(3.15, .99, 4.54); world.add(centerSeam);
  for (const x of [2.12, 3.15, 4.18]) {
    const button = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 5), new THREE.MeshStandardMaterial({ color: 0x766983, roughness: 1 }));
    button.position.set(x, 1.54, 6.47); world.add(button);
  }
  for (const [x, z] of [[4.82,4.7],[1.48,4.7],[4.82,6.6],[1.48,6.6]]) box(.28, .52, .28, 0x594345, x, .26, z);
  const pillow = roundedBox(.82, .56, .18, .14, 0xd3a1a8, 4.25, 1.64, 6.39); pillow.rotation.z = .14;
  const blanket = pixelTexture(48, 72, (g, w, h) => {
    g.fillStyle = "#ead6c2"; g.fillRect(0, 0, w, h);
    for (let y = 6; y < h; y += 12) { g.fillStyle = "rgba(179,137,130,.22)"; g.fillRect(0, y, w, 2); }
    for (let x = 5; x < w; x += 9) { g.fillStyle = "rgba(255,247,231,.25)"; g.fillRect(x, 0, 2, h); }
  }, 1, 1);
  box(.74, .7, .06, 0xead6c2, 3.76, .92, 4.52, blanket);
  const undersideTexture = pixelTexture(128, 80, (g, w, h) => {
    g.fillStyle = "#3f354d"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#644b45"; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8); g.fillRect(0, 0, 8, h); g.fillRect(w - 8, 0, 8, h);
    g.strokeStyle = "#a18a79"; g.lineWidth = 4;
    for (let x = -40; x < w + 40; x += 24) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 40, h - 8); g.stroke(); }
    g.fillStyle = "rgba(241,224,205,.18)";
    for (let y = 14; y < h - 8; y += 13) for (let x = 13; x < w - 8; x += 17) g.fillRect(x, y, 2, 2);
  });
  const underside = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.08), new THREE.MeshStandardMaterial({ map: undersideTexture, side: THREE.DoubleSide, roughness: 1 }));
  underside.rotation.x = -Math.PI / 2; underside.position.set(3.15, .505, 5.65); world.add(underside);
  const frameWood = pixelTexture(48, 24, (g, w, h) => {
    g.fillStyle = "#6b4d43"; g.fillRect(0, 0, w, h);
    for (let y = 3; y < h; y += 6) { g.fillStyle = "rgba(237,180,132,.22)"; g.fillRect(0, y, w, 1); }
  }, 3, 1);
  for (const z of [4.78, 5.65, 6.5]) roundedBox(3.82, .095, .14, .035, 0x6b4d43, 3.15, .465, z, frameWood);
  furnitureMeshes.sofa.push(...world.children.slice(childStart));
}

function buildTable() {
  const childStart = world.children.length;
  const wood = pixelTexture(64, 64, (g, w, h) => {
    g.fillStyle = "#825b48"; g.fillRect(0, 0, w, h);
    for (let y = 5; y < h; y += 11) { g.fillStyle = "rgba(244,188,132,.15)"; g.fillRect(0, y, w, 2); }
    for (let i = 0; i < 16; i += 1) { g.fillStyle = "rgba(67,39,36,.16)"; g.fillRect((i * 23) % w, (i * 37) % h, 13, 1); }
  }, 3, 2);
  roundedBox(4.1, .18, 2.65, .07, 0x825b48, -2.7, 1.0, 6.55, wood);
  for (const [x, z] of [[-.95,5.5],[-4.45,5.5],[-.95,7.6],[-4.45,7.6]]) box(.26, .92, .26, 0x654535, x, .46, z, wood);
  const undersideTexture = pixelTexture(128, 80, (g, w, h) => {
    g.fillStyle = "#58372d"; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 22) { g.fillStyle = x % 44 ? "#684335" : "#4e3028"; g.fillRect(x, 0, 20, h); }
    g.fillStyle = "#39231f"; g.fillRect(0, 8, w, 7); g.fillRect(0, h - 15, w, 7); g.fillRect(8, 0, 7, h); g.fillRect(w - 15, 0, 7, h);
    g.strokeStyle = "rgba(226,164,108,.25)"; g.lineWidth = 2;
    for (let y = 22; y < h; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y - 6); g.stroke(); }
  });
  const underside = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 2.45), new THREE.MeshStandardMaterial({ map: undersideTexture, side: THREE.DoubleSide, roughness: .88 }));
  underside.rotation.x = -Math.PI / 2; underside.position.set(-2.7, .895, 6.55); world.add(underside);
  buildChair(-3.9, 4.6, 0x987f9f);
  buildChair(-4.0, 8.4, 0xa093ab, Math.PI);
  furnitureMeshes.table.push(...world.children.slice(childStart));
}

function buildChair(x, z, color, rotation = 0) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotation; world.add(group);
  const add = (w, h, d, px, py, pz, shade = color) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: shade, roughness: .88 }));
    mesh.position.set(px, py, pz); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  for (let i = 0; i < 4; i += 1) add(.22, .12, 1.08, -.39 + i * .26, .58, 0, i % 2 ? color : color - 0x080508);
  add(.82, .13, .12, 0, .93, .5, color);
  add(.82, .13, .12, 0, 1.17, .5, color);
  for (const [px, pz] of [[-.43,-.43],[.43,-.43],[-.43,.43],[.43,.43]]) add(.16, .58, .16, px, .29, pz, 0x5e4950);
}

function buildDecor() {
  const artTexture = pixelTexture(80, 64, (g, w, h) => {
    g.fillStyle = "#e9c5c4"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#b9b4d5"; g.fillRect(0, 30, w, 34);
    g.fillStyle = "#f6ddbd"; g.fillRect(0, 43, w, 21);
    g.fillStyle = "#87977a"; g.fillRect(8, 38, 22, 16); g.fillRect(52, 34, 20, 20);
    g.fillStyle = "#fff2dd"; g.fillRect(18, 12, 30, 9); g.fillRect(45, 21, 23, 7);
  });
  const makeWallArt = (x, z, rotation) => {
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.12), new THREE.MeshStandardMaterial({ color: 0x7f5b52, roughness: .9, side: THREE.DoubleSide }));
    frame.position.set(x, 1.55, z); frame.rotation.y = rotation; world.add(frame);
    const picture = new THREE.Mesh(new THREE.PlaneGeometry(1.34, .96), new THREE.MeshBasicMaterial({ map: artTexture, side: THREE.DoubleSide }));
    picture.position.set(x + Math.cos(rotation) * .008, 1.55, z - Math.sin(rotation) * .008); picture.rotation.y = rotation; world.add(picture);
  };
  box(1.45, .58, .5, 0xc39a82, 5.28, .29, 2.25);
  box(.75, .08, .36, 0xead6c6, 5.22, .63, 2.24);
  const sidePlant = new THREE.Group(); sidePlant.position.set(5.18, .7, 2.24); world.add(sidePlant);
  for (let i = 0; i < 7; i += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.075, 6, 4), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x748f6c : 0x91a67d, roughness: 1 }));
    leaf.scale.set(1.5, .48, .7); leaf.position.set(Math.sin(i * 2.1) * .14, (i % 3) * .1, Math.cos(i) * .08); leaf.rotation.z = i * .7; sidePlant.add(leaf);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.15, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd9a0a8, roughness: 1 }));
  ball.position.set(-4.75, .15, 11.2); ball.castShadow = true; world.add(ball);

  const shelfWood = pixelTexture(48, 48, (g, w, h) => {
    g.fillStyle = "#9b715d"; g.fillRect(0, 0, w, h);
    for (let y = 5; y < h; y += 9) { g.fillStyle = "rgba(244,190,145,.2)"; g.fillRect(0, y, w, 1); }
  }, 2, 2);
  box(.58, 1.32, 2.55, 0x9b715d, -5.16, .66, 6.8, shelfWood);
  for (const y of [.35, .72, 1.08]) box(.64, .07, 2.4, 0x795445, -4.84, y, 6.8, shelfWood);
  for (let i = 0; i < 9; i += 1) {
    const colors = [0xd6a1aa, 0x9cae91, 0xa79fc5, 0xd6b483];
    box(.12, .26 + (i % 3) * .05, .18, colors[i % colors.length], -4.78, .22 + (i % 2) * .38, 5.9 + i * .22);
  }
  box(.58, .82, 2.2, 0xa97d68, 5.16, .41, 8.7, shelfWood);
  box(.66, .09, 2.28, 0x7d5948, 4.82, .78, 8.7, shelfWood);
  for (const z of [8.05, 8.65, 9.25]) {
    const jar = new THREE.Mesh(new THREE.SphereGeometry(.14, 8, 6), new THREE.MeshStandardMaterial({ color: z === 8.65 ? 0xd5a4ad : 0xb2b9d0, roughness: .72 }));
    jar.scale.set(.68, 1, .68); jar.position.set(4.76, 1.0, z); jar.castShadow = true; world.add(jar);
  }
}

function createRobotBody() {
  suctionLight = new THREE.PointLight(0xffdfc2, .9, 3.6, 1.5);
  suctionLight.position.set(0, .02, -1.0); camera.add(suctionLight);
}

function addHairObject(hair) {
  if (!hairAtlasTexture) return null;
  const frame = hair.dropped ? 2 : hair.cat === "yuragi" && hair.id % 5 === 0 ? 7 : hair.id % 11 === 0 ? 5 : hair.id % 7 === 0 ? 6 : hair.id % 5 === 0 ? 4 : hair.id % 3 === 0 ? 3 : hair.id % 2 === 0 ? 1 : 0;
  const kind = frame === 5 ? "giant" : frame === 3 || frame === 6 || frame === 7 ? "long" : "tuft";
  const map = hairAtlasTexture.clone();
  map.repeat.set(.25, .5);
  map.offset.set((frame % 4) * .25, frame < 4 ? .5 : 0);
  map.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, alphaTest: .06, toneMapped: false });
  material.rotation = ((hair.id * 47) % 11 - 5) * .035;
  const sprite = new THREE.Sprite(material);
  const scales = [[.38,.18],[.32,.23],[.52,.31],[.78,.28],[.64,.36],[1.02,.5],[.72,.17],[.74,.29]];
  const scale = scales[frame];
  sprite.scale.set(hair.id % 2 ? -scale[0] : scale[0], scale[1], 1); sprite.center.set(.5, .12); sprite.position.set(hair.x, .028, hair.z);
  sprite.userData.kind = kind;
  sprite.userData.hairFrame = frame;
  world.add(sprite); hairObjects.set(hair.id, sprite);
  return sprite;
}

async function buildGameObjects() {
  const loader = new THREE.TextureLoader();
  const animationEntries = Object.entries(CHARACTER_ANIMATIONS).flatMap(([type, actions]) =>
    Object.entries(actions).map(([action, path]) => ({ type, action, path })),
  );
  const loaded = await Promise.all([
    ...animationEntries.map(({ path }) => loader.loadAsync(path)),
    loader.loadAsync("./public/assets/animation/hair-collectibles-8-normalized.png"),
  ]);
  const hairAtlas = loaded.pop();
  animationEntries.forEach(({ type, action }, index) => {
    const texture = loaded[index];
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.repeat.set(.25, .5);
    texture.offset.set(0, .5);
    texture.userData.cellAspect = texture.image.width / (texture.image.height * 2);
    characterAnimationTextures.set(`${type}:${action}`, texture);
  });
  hairAtlas.colorSpace = THREE.SRGBColorSpace;
  hairAtlas.magFilter = THREE.NearestFilter;
  hairAtlas.minFilter = THREE.NearestFilter;
  hairAtlas.generateMipmaps = false;
  hairAtlasTexture = hairAtlas;
  const specs = { kotaro: { height: 2.25 }, yuragi: { height: 2.48 }, baby: { height: 2.12 } };
  for (const entity of Object.values(CHARACTER_TEMPLATES)) {
    const spec = specs[entity.type];
    const initialAction = entity.type === "baby" ? "crawl" : "walk";
    const map = characterAnimationTextures.get(`${entity.type}:${initialAction}`);
    const material = new THREE.SpriteMaterial({ map, transparent: true, alphaTest: .2, depthWrite: true, color: 0xfff8f2, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(spec.height * map.userData.cellAspect, spec.height, 1);
    sprite.center.set(.5, 0);
    sprite.position.set(entity.x, -.09, entity.z);
    sprite.userData.baseHeight = spec.height;
    sprite.userData.action = initialAction;
    world.add(sprite);
    characterObjects.set(entity.id, sprite);

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(entity.radius * .72, 14), new THREE.MeshBasicMaterial({ color: 0x493b42, transparent: true, opacity: .22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.scale.y = .42; shadow.position.set(entity.x, .012, entity.z); world.add(shadow); characterShadows.set(entity.id, shadow);
  }

  for (const hair of state.hairs) {
    addHairObject(hair);
  }
  for (const item of vomits) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(item.radius, 12), new THREE.MeshStandardMaterial({ color: 0x777044, roughness: .92, polygonOffset: true, polygonOffsetFactor: -2 }));
    mesh.rotation.x = -Math.PI / 2; mesh.scale.y = .62; mesh.position.set(item.x, .012, item.z); mesh.receiveShadow = true; world.add(mesh);
  }
}

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setFurnitureBlend(roots, facade, blend) {
  if (facade) {
    facade.visible = blend > .01;
    facade.material.opacity = blend;
  }
  for (const root of roots) {
    root.visible = blend < .995;
    root.traverse((object) => {
      if (!object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material.userData.furnitureBaseOpacity === undefined) {
          material.userData.furnitureBaseOpacity = material.opacity;
          material.userData.furnitureBaseTransparent = material.transparent;
          material.userData.furnitureBaseDepthWrite = material.depthWrite;
        }
        material.opacity = material.userData.furnitureBaseOpacity * (1 - blend);
        material.transparent = material.userData.furnitureBaseTransparent || blend > .01;
        material.depthWrite = material.userData.furnitureBaseDepthWrite && blend < .5;
      }
    });
  }
}

function animationFrame(entity, now) {
  if (entity.action === "walk") return Math.floor((now * .0105 + entity.seed) % 8);
  if (entity.action === "crawl") return Math.floor((now * .012 + entity.seed) % 8);
  if (entity.action === "scratch") {
    const sequence = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1];
    return sequence[Math.floor((now - entity.actionStartedAt) / 92) % sequence.length];
  }
  const duration = Math.max(1, entity.actionUntil - entity.actionStartedAt);
  const progress = Math.min(.999, Math.max(0, (now - entity.actionStartedAt) / duration));
  return Math.min(7, Math.floor(progress * 8));
}

function setCharacterFrame(sprite, entity, now) {
  const action = entity.type === "baby" ? "crawl" : entity.action;
  const texture = characterAnimationTextures.get(`${entity.type}:${action}`);
  if (!texture) return;
  if (sprite.material.map !== texture) {
    sprite.material.map = texture;
    sprite.material.needsUpdate = true;
  }
  const frameIndex = animationFrame(entity, now);
  texture.offset.set((frameIndex % 4) * .25, frameIndex < 4 ? .5 : 0);
  sprite.userData.action = action;
  sprite.userData.frameIndex = frameIndex;
  sprite.userData.actionWidth = sprite.userData.baseHeight * texture.userData.cellAspect;
}

function syncScene(now, dt) {
  const follow = 1 - Math.exp(-dt * 9);
  visual.x += (state.player.x - visual.x) * follow;
  visual.z += (state.player.z - visual.z) * follow;
  visual.angle = normalizedAngle(visual.angle + normalizedAngle(state.player.angle - visual.angle) * follow);
  const under = isInsideRect(state.player, sofa);
  const underTable = isInsideRect(state.player, tableArea);
  const sofaDistance = Math.hypot(sofa.x - state.player.x, sofa.z - state.player.z);
  const tableDistance = Math.hypot(tableArea.x - state.player.x, tableArea.z - state.player.z);
  const sofaFacing = Math.abs(normalizedAngle(Math.atan2(sofa.x - state.player.x, sofa.z - state.player.z) - visual.angle));
  const tableFacing = Math.abs(normalizedAngle(Math.atan2(tableArea.x - state.player.x, tableArea.z - state.player.z) - visual.angle));
  const sofaBlend = !under && state.player.z < sofa.z - .45 && sofaDistance > 5.55 && sofaFacing < .68 ? 1 : 0;
  const tableBlend = !underTable && state.player.z < tableArea.z - .45 && tableDistance > 5.55 && tableFacing < .68 ? 1 : 0;
  setFurnitureBlend(furnitureMeshes.sofa, furnitureFacades.sofa, sofaBlend);
  setFurnitureBlend(furnitureMeshes.table, furnitureFacades.table, tableBlend);
  camera.position.set(visual.x, under ? .225 : .265, visual.z);
  const viewDrop = under ? .3 : underTable ? .12 : .025;
  visual.pitch += (viewDrop - visual.pitch) * follow;
  camera.lookAt(visual.x + Math.sin(visual.angle), camera.position.y - visual.pitch, visual.z + Math.cos(visual.angle));
  camera.fov = 78 + Math.sin(now * .006) * .15;
  camera.updateProjectionMatrix();
  for (const sprite of characterObjects.values()) sprite.visible = false;
  for (const shadow of characterShadows.values()) shadow.visible = false;
  for (const entity of state.wanderers) {
    const sprite = characterObjects.get(entity.id);
    if (!sprite) continue;
    setCharacterFrame(sprite, entity, now);
    const distance = Math.hypot(entity.x - state.player.x, entity.z - state.player.z);
    sprite.visible = distance > .55;
    const specWidth = sprite.userData.actionWidth || sprite.scale.x;
    const specHeight = sprite.userData.baseHeight || sprite.scale.y;
    const nearScale = Math.min(1, Math.max(.22, distance / 4.4));
    const scratching = now < entity.scratchingUntil;
    const moving = entity.type === "baby" || entity.action === "walk";
    const gait = now * (entity.type === "baby" ? .012 : .0105) + entity.seed;
    const lift = moving ? Math.abs(Math.sin(gait * Math.PI)) * (entity.type === "baby" ? .018 : .028) : 0;
    sprite.position.set(entity.x, -.09 + lift, entity.z);
    const travelView = normalizedAngle(entity.angle - Math.atan2(state.player.x - entity.x, state.player.z - entity.z));
    const side = Math.sin(travelView);
    sprite.scale.x = Math.sign(side || 1) * specWidth * nearScale * (.76 + Math.abs(Math.cos(travelView)) * .24);
    sprite.scale.y = specHeight * nearScale * (1 - lift * .12);
    sprite.material.color.set(Math.cos(travelView) < -.2 ? 0xe7ddd8 : 0xfff8f2);
    sprite.material.rotation = scratching ? Math.sin(now * .028) * .018 : Math.sin(gait) * (entity.type === "baby" ? .012 : .008);
    const shadow = characterShadows.get(entity.id);
    if (shadow) {
      shadow.position.set(entity.x, .012, entity.z);
      shadow.scale.x = 1 - lift * 1.8;
      shadow.scale.y = .42 * (1 - lift * 1.2);
      shadow.visible = sprite.visible;
    }
  }
  for (const hair of state.hairs) {
    const object = hairObjects.get(hair.id);
    if (!object) continue;
    const lift = object.userData.kind === "long" ? .004 : .009;
    object.position.set(hair.x, (object.userData.isStrandGroup ? .012 : .028) + Math.sin(now * .007 + hair.id * 1.7) * lift, hair.z);
    if (object.userData.isStrandGroup) object.rotation.y += Math.sin(now * .0013 + hair.id) * .00008;
    else object.material.rotation += Math.sin(now * .0013 + hair.id) * .00018;
  }
  if (robotRing) robotRing.material.color.set(input.suction ? 0xa8eee4 : 0x8e87a6);
  if (suctionLight) suctionLight.intensity = input.suction ? 2.2 : .62;
  canvas.dataset.view = "continuous-3d";
  canvas.dataset.world = "true-geometry";
  canvas.dataset.angle = visual.angle.toFixed(3);
  canvas.dataset.roster = state.wanderers.map((entity) => entity.id).join(",");
  canvas.dataset.droppedHairs = state.hairs.filter((hair) => hair.dropped).length.toString();
  canvas.dataset.actions = state.wanderers.map((entity) => `${entity.id}:${entity.action}`).join(",");
  canvas.dataset.frames = state.wanderers.map((entity) => `${entity.id}:${characterObjects.get(entity.id)?.userData.frameIndex ?? 0}`).join(",");
  canvas.dataset.position = `${state.player.x.toFixed(2)},${state.player.z.toFixed(2)}`;
  canvas.dataset.under = under ? "sofa" : underTable ? "table" : "room";
  canvas.setAttribute("aria-label", `床すれすれの掃除機視点のゲーム画面。現在地: ${under ? "ソファの下" : underTable ? "机の下" : "部屋"}`);
}

function update(dt, now) {
  if (state.mode !== "playing") return;
  state.remaining = Math.max(0, state.remaining - dt);
  if (state.remaining <= 0) return finish(false);
  const stickPower = Math.min(1, Math.hypot(input.x, input.y));
  let forward = 0;
  if (stickPower > .08) {
    const desiredAngle = joystickHeading(input.anchorAngle, input.x, input.y);
    const angleDelta = normalizedAngle(desiredAngle - state.player.angle);
    state.player.angle = turnToward(state.player.angle, desiredAngle, dt * 3.15);
    forward = stickPower * Math.max(.34, 1 - Math.abs(angleDelta) / Math.PI);
  } else {
    const turn = keyboardTurn(keys);
    state.player.angle = normalizedAngle(state.player.angle + turn * dt * 1.45);
    if (keys.has("ArrowUp") || keys.has("w")) forward += 1;
    if (keys.has("ArrowDown") || keys.has("s")) forward -= 1;
  }
  const move = forward * dt * 2.05;
  const next = { x: state.player.x + Math.sin(state.player.angle) * move, z: state.player.z + Math.cos(state.player.angle) * move };
  const resolved = resolveMovement(state.player, next, solids, state.player.radius);
  if (resolved.hit && now - state.lastCollisionAt > 450) { state.lastCollisionAt = now; showMessage("こつん"); }
  state.player.x = resolved.x; state.player.z = resolved.z;
  for (const entity of state.wanderers) {
    if (entity.type !== "baby" && now >= entity.scratchAt && now >= entity.actionUntil) {
      const actions = ["scratch", "stretch", "yawn"];
      const nextAction = entity.forcedAction || actions[entity.actionIndex++ % actions.length];
      entity.forcedAction = null;
      entity.action = nextAction;
      entity.actionStartedAt = now;
      entity.actionUntil = now + (entity.debugActionDuration || (nextAction === "scratch" ? 1350 : nextAction === "stretch" ? 1750 : 1850));
      entity.scratchingUntil = nextAction === "scratch" ? entity.actionUntil : 0;
      entity.scratchAt = entity.actionUntil + 4300 + entity.seed * 260;
      entity.scratchDropped = nextAction !== "scratch";
    }
    if (now < entity.actionUntil) {
      if (!entity.scratchDropped) {
        entity.scratchDropped = true;
        const dropped = createDroppedHair(entity, Math.max(...state.hairs.map((hair) => hair.id)) + 1);
        state.hairs.push(dropped);
        addHairObject(dropped);
        showMessage(`${entity.type === "kotaro" ? "虎太郎" : "ゆらぎ"} かいかい…`);
      }
    } else {
      entity.action = entity.type === "baby" ? "crawl" : "walk";
      stepWanderer(entity, dt, now);
    }
    if (circlesOverlap(state.player, state.player.radius, entity, entity.radius)) {
      const dx = state.player.x - entity.x;
      const dz = state.player.z - entity.z;
      const distance = Math.hypot(dx, dz) || 1;
      const separation = state.player.radius + entity.radius + .03;
      state.player.x = entity.x + dx / distance * separation;
      state.player.z = entity.z + dz / distance * separation;
      if (now - state.lastCollisionAt > 700) {
        state.lastCollisionAt = now;
        showMessage(entity.type === "baby" ? "あぶない、あぶない" : `${entity.type === "kotaro" ? "虎太郎" : "ゆらぎ"}、通ります`);
      }
    }
  }
  if (hitVomit(state.player, vomits)) return finish(true);
  const collected = collectTouchedHair(state.player, state.hairs);
  if (collected.grams) {
    state.grams = Math.round((state.grams + collected.grams) * 10) / 10;
    state.counts.kotaro += collected.kotaro; state.counts.yuragi += collected.yuragi;
    for (const hair of state.hairs) if (hair.collected) { const object = hairObjects.get(hair.id); if (object) object.visible = false; }
    showMessage(`+${collected.grams.toFixed(1)} g`); tickSound();
  }
  ui.grams.textContent = state.grams.toFixed(1);
  ui.time.textContent = Math.ceil(state.remaining);
}

function startGame() {
  state = makeState();
  input.x = 0; input.y = 0; input.suction = false; input.anchorAngle = state.player.angle;
  visual.x = state.player.x; visual.z = state.player.z; visual.angle = state.player.angle; visual.pitch = .025;
  for (const [id, object] of hairObjects) {
    if (id >= state.hairs.length) {
      world.remove(object); object.material.dispose(); hairObjects.delete(id);
    }
  }
  for (const hair of state.hairs) { const object = hairObjects.get(hair.id); if (object) object.visible = true; }
  state.mode = "playing";
  ui.intro.hidden = true; ui.result.hidden = true; ui.controls.hidden = false;
  ui.robot.hidden = false;
  ui.grams.textContent = "0.0"; ui.time.textContent = "60";
  ensureAudio();
}

function finish(hitHazard) {
  if (state.mode !== "playing") return;
  state.mode = "result"; input.suction = false;
  ui.controls.hidden = true; ui.robot.hidden = true; ui.result.hidden = false;
  ui.resultGrams.textContent = state.grams.toFixed(1);
  ui.kotaroCount.textContent = `${state.counts.kotaro} ふわ`; ui.yuragiCount.textContent = `${state.counts.yuragi} ふわ`;
  ui.resultKicker.textContent = hitHazard ? "OOPS" : "CLEANUP COMPLETE";
  ui.resultCopy.textContent = hitHazard ? "そこは、吸わないほうがよかった。" : state.grams >= 10 ? "毛玉ひとつぶんの大収穫。" : state.grams >= 6 ? "今日も、いい毛でした。" : "ソファの下に、まだ気配がある。";
}

function showMessage(text) {
  ui.message.textContent = text; ui.message.classList.add("show"); clearTimeout(messageTimer);
  messageTimer = setTimeout(() => ui.message.classList.remove("show"), 720);
}

function ensureAudio() {
  if (audio) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) audio = new AudioContext();
}

function tickSound() {
  if (!audio || audio.state !== "running") return;
  const osc = audio.createOscillator(); const gain = audio.createGain();
  osc.type = "sine"; osc.frequency.setValueAtTime(520, audio.currentTime); osc.frequency.exponentialRampToValueAtTime(820, audio.currentTime + .09);
  gain.gain.setValueAtTime(.05, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .12);
  osc.connect(gain).connect(audio.destination); osc.start(); osc.stop(audio.currentTime + .12);
}

function joystickMove(event) {
  if (input.joystickPointer !== event.pointerId) return;
  const rect = ui.joystick.getBoundingClientRect();
  const x = event.clientX - (rect.left + rect.width / 2); const y = event.clientY - (rect.top + rect.height / 2);
  const max = rect.width * .31; const distance = Math.hypot(x, y) || 1; const scale = Math.min(1, max / distance);
  const dx = x * scale; const dy = y * scale; input.x = dx / max; input.y = dy / max;
  ui.stick.style.transform = `translate(${dx}px, ${dy}px)`;
}

function joystickEnd(event) {
  if (input.joystickPointer !== event.pointerId) return;
  input.joystickPointer = null; input.x = input.y = 0; ui.stick.style.transform = "translate(0, 0)";
}

ui.joystick.addEventListener("pointerdown", (event) => { input.joystickPointer = event.pointerId; input.anchorAngle = state.player.angle; ui.joystick.setPointerCapture(event.pointerId); joystickMove(event); });
ui.joystick.addEventListener("pointermove", joystickMove);
ui.joystick.addEventListener("pointerup", joystickEnd);
ui.joystick.addEventListener("pointercancel", joystickEnd);
window.addEventListener("keydown", (event) => { keys.add(event.key.length === 1 ? event.key.toLowerCase() : event.key); if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key)) event.preventDefault(); });
window.addEventListener("keyup", (event) => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
window.addEventListener("resize", resize);
ui.start.addEventListener("click", startGame);
ui.restart.addEventListener("click", startGame);

function frame(now) {
  const dt = Math.min(.035, (now - lastFrame) / 1000); lastFrame = now;
  update(dt, now); syncScene(now, dt); renderer.render(scene, camera); requestAnimationFrame(frame);
}

async function init() {
  ui.start.disabled = true;
  buildRoom(); createRobotBody(); await Promise.all([buildBackWallArt(), buildSideWallArt(), buildSofaFacade(), buildGameObjects()]); resize(); syncScene(performance.now(), 1 / 60);
  ui.start.disabled = false; ui.controls.hidden = true; requestAnimationFrame(frame);
  const params = new URLSearchParams(location.search);
  if (params.has("autostart")) {
    startGame();
    if (params.get("zone") === "sofa") { state.player.x = 3.15; state.player.z = 4.55; }
    if (params.get("zone") === "table") { state.player.x = -2.7; state.player.z = 5.45; }
    visual.x = state.player.x; visual.z = state.player.z;
    if (params.has("spin")) keys.add("ArrowLeft");
    if (params.has("drive")) { input.y = -.72; input.anchorAngle = state.player.angle; }
    if (params.get("steer") === "right") { input.x = .72; input.y = -.72; input.anchorAngle = state.player.angle; }
    const requestedActor = params.get("actor");
    if (requestedActor) {
      const actor = state.wanderers.find((entity) => entity.type === requestedActor)
        || state.wanderers.find((entity) => requestedActor === "baby" ? entity.type === "baby" : entity.type !== "baby");
      if (actor) { actor.x = 0; actor.z = 2.35; actor.angle = Math.PI; }
    }
    const forcedAction = params.get("action") || (params.has("scratch") ? "scratch" : null);
    if (forcedAction) {
      const cat = state.wanderers.find((entity) => entity.type !== "baby");
      if (cat) {
        cat.forcedAction = forcedAction;
        cat.scratchAt = 0;
        if (requestedActor) cat.debugActionDuration = forcedAction === "scratch" ? 10000 : forcedAction === "stretch" ? 1750 : 1850;
      }
    }
  }
}

init().catch((error) => {
  console.error(error);
  ui.start.disabled = false;
  ui.start.textContent = "再読み込みしてください";
});
