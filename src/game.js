import * as THREE from "../public/vendor/three.module.js";
import {
  actorContactRadius,
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
} from "./core.js?v=pixel2";

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
  kotaro: { id: "kotaro", type: "kotaro", x: 3.2, z: 8.1, angle: .8, speed: .42, radius: .5, turnAt: 0, seed: 2 },
  yuragi: { id: "yuragi", type: "yuragi", x: -.15, z: 8.8, angle: -1.4, speed: .28, radius: .58, turnAt: 0, seed: 7 },
  baby: { id: "baby", type: "baby", x: -3.7, z: 8.2, angle: 2.1, speed: .34, radius: .48, turnAt: 0, seed: 11 },
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
  { id: "left-bookcase", kind: "rect", x: -5.15, z: 6.8, w: .72, d: 2.7 },
);
const actorSolids = [
  ...solids,
  { id: "sofa-body", kind: "rect", x: sofa.x, z: sofa.z, w: sofa.w, d: sofa.d },
  { id: "table-body", kind: "rect", x: tableArea.x, z: tableArea.z, w: tableArea.w, d: tableArea.d },
];

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
const hairShadows = new Map();
const characterObjects = new Map();
const characterShadows = new Map();
const characterAnimationTextures = new Map();
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
const RENDER_SCALE = .62;

const HAIR_VARIANTS = [
  { name: "tiny-fluff", frame: 0, scale: [.2, .13], parts: [[0,.065,0,.18,.13]] },
  { name: "round-fluff", frame: 1, scale: [.27, .18], parts: [[0,.085,0,.25,.18]] },
  { name: "soft-pair", frame: 2, scale: [.36, .17], parts: [[-.085,.07,0,.18,.13],[.085,.065,.012,.17,.12]] },
  { name: "big-airy-fluff", frame: 3, scale: [.37, .23], parts: [[0,.11,0,.34,.23]] },
  { name: "asymmetric-cluster", frame: 4, scale: [.4, .2], parts: [[-.055,.09,0,.24,.17],[.125,.055,.015,.16,.11]] },
];

function playerActorRadius(entity) {
  return actorContactRadius(entity.type);
}

function actorFurnitureRadius(entity) {
  return entity.type === "baby" ? .4 : entity.type === "yuragi" ? .5 : .45;
}

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

function roundedBoxGeometry(w, h, d, radius) {
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
    bevelSize: Math.min(.085, r * .55),
    bevelThickness: Math.min(.075, d * .16),
    curveSegments: 8,
  });
  geometry.translate(0, 0, -d / 2);
  return geometry;
}

function roundedBox(w, h, d, radius, color, x, y, z, texture = null) {
  const geometry = roundedBoxGeometry(w, h, d, radius);
  const material = new THREE.MeshStandardMaterial({ color: texture ? 0xffffff : color, roughness: .8, metalness: 0, map: texture, bumpMap: texture, bumpScale: texture ? .018 : 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; world.add(mesh);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 38), new THREE.LineBasicMaterial({ color: 0x604b52, transparent: true, opacity: .045 }));
  mesh.add(outline);
  return mesh;
}

function taperedLeg(radiusTop, radiusBottom, height, x, z, texture, color = 0x714737) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16, 1, false);
  const material = new THREE.MeshStandardMaterial({ color: texture ? 0xffffff : color, map: texture, roughness: .78, metalness: 0 });
  const leg = new THREE.Mesh(geometry, material);
  leg.position.set(x, height / 2, z);
  leg.castShadow = true;
  leg.receiveShadow = true;
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 42), new THREE.LineBasicMaterial({ color: 0x4d3030, transparent: true, opacity: .08 }));
  leg.add(outline);
  world.add(leg);
  return leg;
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

function softShadowTexture() {
  const source = document.createElement("canvas");
  source.width = source.height = 64;
  const context = source.getContext("2d");
  const gradient = context.createRadialGradient(32, 32, 4, 32, 32, 30);
  gradient.addColorStop(0, "rgba(55,42,48,.74)");
  gradient.addColorStop(.55, "rgba(55,42,48,.34)");
  gradient.addColorStop(1, "rgba(55,42,48,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
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
  const fabric = pixelTexture(96, 96, (g, w, h) => {
    g.fillStyle = "#ae99b9"; g.fillRect(0, 0, w, h);
    for (let y = 3; y < h; y += 6) {
      for (let x = (y % 12) / 2; x < w; x += 6) {
        g.fillStyle = (x + y) % 12 ? "rgba(255,245,250,.24)" : "rgba(69,52,79,.18)";
        g.fillRect(x, y, (x + y) % 18 ? 1 : 2, 1);
        if ((x * 3 + y) % 24 === 0) g.fillRect(x + 1, y + 1, 1, 1);
      }
    }
  }, 1.25, 1.25);
  const sofaBase = roundedBox(4.16, .34, 2.16, .12, 0x877a98, 3.15, .66, 5.62, fabric);
  const seatRight = roundedBox(1.9, .3, 1.92, .17, 0xb1a5bc, 4.15, .93, 5.52, fabric);
  const seatLeft = roundedBox(1.9, .3, 1.92, .17, 0xa89bb6, 2.15, .93, 5.52, fabric);
  const backLeft = roundedBox(1.91, 1.08, .38, .19, 0xa28daf, 2.15, 1.38, 6.47, fabric);
  const backRight = roundedBox(1.91, 1.08, .38, .19, 0xab96b8, 4.15, 1.38, 6.47, fabric);
  sofaBase.material.color.set(0xdfcfe5);
  seatLeft.material.color.set(0xfff8ff); seatRight.material.color.set(0xfbf1fd);
  backLeft.material.color.set(0xf0e1f4); backRight.material.color.set(0xf6e9f8);
  backLeft.rotation.x = backRight.rotation.x = -.055;
  const armRight = roundedBox(.5, .9, 2.08, .19, 0x9b86a9, 5.05, 1.03, 5.57, fabric);
  const armLeft = roundedBox(.5, .9, 2.08, .19, 0x9b86a9, 1.25, 1.03, 5.57, fabric);
  armLeft.material.color.set(0xebdbee); armRight.material.color.set(0xf0e1f3);
  const piping = new THREE.MeshStandardMaterial({ color: 0xc8b4d0, roughness: .96 });
  const frontSkirt = roundedBox(3.65, .55, .24, .16, 0xa08bab, 3.15, .74, 4.55, fabric);
  frontSkirt.material.color.set(0xe7d7ec);
  for (const x of [2.2, 4.1]) {
    const frontCushion = roundedBox(1.7, .4, .14, .16, 0xb19abc, x, .8, 4.36, fabric);
    frontCushion.material.color.set(x < 3 ? 0xf5e8f8 : 0xeee0f2);
  }
  for (const x of [2.15, 4.15]) {
    const button = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 6), new THREE.MeshStandardMaterial({ color: 0x766983, roughness: 1 }));
    button.position.set(x, 1.43, 6.26); button.castShadow = true; world.add(button);
  }
  const backCenterSeam = new THREE.Mesh(new THREE.CapsuleGeometry(.013, .82, 3, 6), piping);
  backCenterSeam.position.set(3.15, 1.42, 6.255); backCenterSeam.castShadow = true; world.add(backCenterSeam);
  const seatCenterSeam = new THREE.Mesh(new THREE.CapsuleGeometry(.009, .18, 3, 6), new THREE.MeshStandardMaterial({ color: 0x94819e, roughness: 1 }));
  seatCenterSeam.position.set(3.15, .83, 4.535); seatCenterSeam.castShadow = true; world.add(seatCenterSeam);
  const legWood = pixelTexture(32, 48, (g, w, h) => {
    g.fillStyle = "#7b5144"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i += 1) {
      g.fillStyle = i % 3 ? "rgba(244,184,136,.18)" : "rgba(54,34,37,.16)";
      g.fillRect((i * 11) % w, (i * 17) % h, 1, 7 + i % 11);
    }
  }, 1, 2);
  for (const [x, z] of [[4.82,4.72],[1.48,4.72],[4.82,6.48],[1.48,6.48]]) taperedLeg(.068, .038, .48, x, z, legWood, 0x7b5144);
  const pillow = roundedBox(.76, .54, .17, .15, 0xd3a1a8, 4.28, 1.31, 6.22); pillow.rotation.z = .16; pillow.rotation.x = -.12;
  const backPanelLeft = roundedBox(1.78, .74, .055, .16, 0xad98b9, 2.16, 1.39, 6.685, fabric);
  const backPanelRight = roundedBox(1.78, .74, .055, .16, 0xb6a0c1, 4.14, 1.39, 6.685, fabric);
  backPanelLeft.material.color.set(0xe7d8ec); backPanelRight.material.color.set(0xeee0f2);
  for (const x of [2.16, 4.14]) {
    const backButton = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 6), new THREE.MeshStandardMaterial({ color: 0x8f7d99, roughness: 1 }));
    backButton.position.set(x, 1.39, 6.72); backButton.castShadow = true; world.add(backButton);
  }
  for (const x of [.94, 5.36]) {
    const sidePanel = roundedBox(.14, .7, 1.62, .065, 0xb19abc, x, 1.02, 5.58, fabric);
    sidePanel.material.color.set(0xfff4ff);
    for (const z of [5.3, 5.86]) {
      const sideButton = new THREE.Mesh(new THREE.SphereGeometry(.024, 10, 6), new THREE.MeshStandardMaterial({ color: 0xcbb8d1, roughness: 1 }));
      sideButton.position.set(x + (x < 3 ? -.045 : .045), 1.02, z); sideButton.castShadow = true; world.add(sideButton);
    }
  }
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
}

function buildTable() {
  const wood = pixelTexture(64, 64, (g, w, h) => {
    g.fillStyle = "#a86d48"; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,217,166,.13)"; g.fillRect(0, 0, w, 8);
    for (let i = 0; i < 22; i += 1) {
      g.fillStyle = i % 3 ? "rgba(255,211,157,.24)" : "rgba(70,38,27,.22)";
      g.fillRect((i * 29) % w, (i * 17) % h, 6 + i % 9, i % 4 === 0 ? 2 : 1);
    }
  }, 1.25, 1);
  const tableTop = roundedBox(4.16, .15, 2.7, .075, 0x8f583b, -2.7, .99, 6.55, wood);
  tableTop.material.roughness = .5; tableTop.material.metalness = .025;
  const tableFace = roundedBox(3.76, .18, .11, .045, 0x9d6847, -2.7, .86, 5.25, wood);
  tableFace.material.color.set(0xf1c193); tableFace.material.roughness = .56;
  for (const [x, z] of [[-.95,5.5],[-4.45,5.5],[-.95,7.6],[-4.45,7.6]]) taperedLeg(.115, .062, .95, x, z, wood, 0x654535);
  const undersideTexture = pixelTexture(128, 80, (g, w, h) => {
    g.fillStyle = "#58372d"; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 22) { g.fillStyle = x % 44 ? "#684335" : "#4e3028"; g.fillRect(x, 0, 20, h); }
    g.fillStyle = "#39231f"; g.fillRect(0, 8, w, 7); g.fillRect(0, h - 15, w, 7); g.fillRect(8, 0, 7, h); g.fillRect(w - 15, 0, 7, h);
    g.strokeStyle = "rgba(226,164,108,.25)"; g.lineWidth = 2;
    for (let y = 22; y < h; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y - 6); g.stroke(); }
  });
  const underside = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 2.45), new THREE.MeshStandardMaterial({ map: undersideTexture, side: THREE.DoubleSide, roughness: .88 }));
  underside.rotation.x = -Math.PI / 2; underside.position.set(-2.7, .805, 6.55); world.add(underside);
  buildChair(-4.35, 4.35, 0x987f9f);
  buildChair(-4.0, 8.4, 0xa093ab, Math.PI);
}

function buildChair(x, z, color, rotation = 0) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotation; world.add(group);
  const chairFabric = pixelTexture(32, 32, (g, w, h) => {
    g.fillStyle = color === 0x987f9f ? "#a28aad" : "#aaa0b8"; g.fillRect(0, 0, w, h);
    for (let y = 2; y < h; y += 4) for (let x = y % 3; x < w; x += 4) { g.fillStyle = "rgba(255,240,245,.16)"; g.fillRect(x, y, 1, 1); }
  }, 2, 2);
  const cushionMaterial = new THREE.MeshStandardMaterial({ map: chairFabric, color: 0xffffff, roughness: .9, bumpMap: chairFabric, bumpScale: .012 });
  const chairWood = new THREE.MeshStandardMaterial({ color: 0x69483e, roughness: .82 });
  const addRounded = (w, h, d, radius, px, py, pz, material) => {
    const geometry = roundedBoxGeometry(w, h, d, radius);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(px, py, pz); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  addRounded(.88, .14, .92, .08, 0, .56, 0, cushionMaterial);
  for (const px of [-.44, .44]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.055, .072, .9, 8), chairWood);
    post.position.set(px, .82, .47); post.castShadow = true; group.add(post);
  }
  for (const py of [.86, 1.08, 1.28]) addRounded(.8, .075, .09, .03, 0, py, .47, chairWood);
  for (const [px, pz] of [[-.41,-.4],[.41,-.4],[-.41,.4],[.41,.4]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.052, .073, .54, 8), chairWood);
    leg.position.set(px, .27, pz); leg.castShadow = true; group.add(leg);
  }
  return group;
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
}

function createRobotBody() {
  suctionLight = new THREE.PointLight(0xffdfc2, .9, 3.6, 1.5);
  suctionLight.position.set(0, .02, -1.0); camera.add(suctionLight);
}

function addHairObject(hair) {
  if (!hairAtlasTexture) return null;
  const variant = HAIR_VARIANTS[hair.dropped ? 1 : hair.id % HAIR_VARIANTS.length];
  const group = new THREE.Group();
  const [width, height] = variant.scale;
  for (const [x, y, z, partWidth, partHeight] of variant.parts) {
    const material = new THREE.SpriteMaterial({ map: hairAtlasTexture, transparent: true, opacity: 1, depthWrite: false, alphaTest: .01, toneMapped: false });
    material.color.set(hair.cat === "yuragi" ? 0xfff7ef : 0xf0e8e3);
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(hair.id % 2 ? -partWidth : partWidth, partHeight, 1);
    sprite.center.set(.5, .06);
    sprite.position.set(hair.id % 2 ? -x : x, y, z);
    group.add(sprite);
  }
  group.position.set(hair.x, .006, hair.z);
  group.userData.kind = variant.name;
  group.userData.hairFrame = variant.frame;
  world.add(group); hairObjects.set(hair.id, group);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(.5, 20),
    new THREE.MeshBasicMaterial({ color: 0x574a59, transparent: true, opacity: .065, depthWrite: false, toneMapped: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(width * .72, Math.max(.055, height * .32), 1);
  shadow.position.set(hair.x, .004, hair.z);
  world.add(shadow); hairShadows.set(hair.id, shadow);
  return group;
}

async function buildGameObjects() {
  const loader = new THREE.TextureLoader();
  const animationEntries = Object.entries(CHARACTER_ANIMATIONS).flatMap(([type, actions]) =>
    Object.entries(actions).map(([action, path]) => ({ type, action, path })),
  );
  const loaded = await Promise.all([
    ...animationEntries.map(({ path }) => loader.loadAsync(path)),
    loader.loadAsync("./public/assets/animation/hair-canonical-tuft-v3.png"),
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
  const specs = {
    kotaro: { height: 1.18, groundY: -.075 },
    yuragi: { height: 1.28, groundY: -.09 },
    baby: { height: 1.05, groundY: -.07 },
  };
  const characterShadowMap = softShadowTexture();
  for (const entity of Object.values(CHARACTER_TEMPLATES)) {
    const spec = specs[entity.type];
    const initialAction = entity.type === "baby" ? "crawl" : "walk";
    const map = characterAnimationTextures.get(`${entity.type}:${initialAction}`);
    const material = new THREE.SpriteMaterial({ map, transparent: true, alphaTest: .2, depthWrite: true, color: 0xfff8f2, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(spec.height * map.userData.cellAspect, spec.height, 1);
    sprite.center.set(.5, 0);
    sprite.position.set(entity.x, spec.groundY, entity.z);
    sprite.userData.baseHeight = spec.height;
    sprite.userData.groundY = spec.groundY;
    sprite.userData.action = initialAction;
    sprite.renderOrder = 2;
    world.add(sprite);
    characterObjects.set(entity.id, sprite);

    const shadow = new THREE.Sprite(new THREE.SpriteMaterial({ map: characterShadowMap, color: 0x6d5960, transparent: true, opacity: .5, depthWrite: false, depthTest: false, toneMapped: false }));
    shadow.center.set(.5, .3);
    shadow.scale.set(spec.height, spec.height * .25, 1);
    shadow.userData.baseScaleX = spec.height;
    shadow.userData.baseScaleY = spec.height * .25;
    shadow.position.set(entity.x, .025, entity.z - .42);
    shadow.renderOrder = 1;
    world.add(shadow);
    characterShadows.set(entity.id, shadow);
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
  renderer.setSize(Math.ceil(width * RENDER_SCALE), Math.ceil(height * RENDER_SCALE), false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animationFrame(entity, now) {
  if (entity.action === "walk") return Math.floor((now * .0135 + entity.seed) % 8);
  if (entity.action === "crawl") return Math.floor((now * .0145 + entity.seed) % 8);
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
    const scratching = now < entity.scratchingUntil;
    const moving = entity.type === "baby" || entity.action === "walk";
    const gait = now * (entity.type === "baby" ? .0145 : .0135) + entity.seed;
    const lift = moving ? Math.abs(Math.sin(gait * Math.PI)) * (entity.type === "baby" ? .018 : .028) : 0;
    sprite.position.set(entity.x, sprite.userData.groundY + lift, entity.z);
    const travelView = normalizedAngle(entity.angle - Math.atan2(state.player.x - entity.x, state.player.z - entity.z));
    const side = Math.sin(travelView);
    if (sprite.userData.facing === undefined) sprite.userData.facing = side < 0 ? -1 : 1;
    if (side > .22) sprite.userData.facing = 1;
    else if (side < -.22) sprite.userData.facing = -1;
    sprite.scale.x = sprite.userData.facing * specWidth;
    sprite.scale.y = specHeight * (1 - lift * .12);
    sprite.material.color.set(Math.cos(travelView) < -.2 ? 0xe7ddd8 : 0xfff8f2);
    sprite.material.rotation = scratching ? Math.sin(now * .024) * .014 : Math.sin(gait) * (entity.type === "baby" ? .008 : .005);
    const shadow = characterShadows.get(entity.id);
    if (shadow) {
      shadow.position.set(entity.x, .025, entity.z - .42);
      shadow.scale.x = shadow.userData.baseScaleX * (1 - lift * .7);
      shadow.scale.y = shadow.userData.baseScaleY * (1 - lift * .5);
      shadow.visible = sprite.visible;
    }
  }
  for (const hair of state.hairs) {
    const object = hairObjects.get(hair.id);
    if (!object) continue;
    object.position.set(hair.x, .006, hair.z);
    const shadow = hairShadows.get(hair.id);
    if (shadow) {
      shadow.position.set(hair.x, .004, hair.z);
      shadow.visible = object.visible;
    }
  }
  if (robotRing) robotRing.material.color.set(input.suction ? 0xa8eee4 : 0x8e87a6);
  if (suctionLight) suctionLight.intensity = input.suction ? 2.2 : .62;
  canvas.dataset.view = "continuous-3d";
  canvas.dataset.world = "true-geometry";
  canvas.dataset.pixelScale = RENDER_SCALE.toString();
  canvas.dataset.angle = visual.angle.toFixed(3);
  canvas.dataset.roster = state.wanderers.map((entity) => entity.id).join(",");
  canvas.dataset.droppedHairs = state.hairs.filter((hair) => hair.dropped).length.toString();
  canvas.dataset.actions = state.wanderers.map((entity) => `${entity.id}:${entity.action}`).join(",");
  canvas.dataset.frames = state.wanderers.map((entity) => `${entity.id}:${characterObjects.get(entity.id)?.userData.frameIndex ?? 0}`).join(",");
  canvas.dataset.actorScales = state.wanderers.map((entity) => `${entity.id}:${Math.abs(characterObjects.get(entity.id)?.scale.y ?? 0).toFixed(2)}`).join(",");
  canvas.dataset.actorDistances = state.wanderers.map((entity) => `${entity.id}:${Math.hypot(entity.x - state.player.x, entity.z - state.player.z).toFixed(2)}`).join(",");
  canvas.dataset.actorApparentSizes = state.wanderers.map((entity) => {
    const distance = Math.max(.01, Math.hypot(entity.x - state.player.x, entity.z - state.player.z));
    return `${entity.id}:${(Math.abs(characterObjects.get(entity.id)?.scale.y ?? 0) / distance).toFixed(3)}`;
  }).join(",");
  canvas.dataset.actorPositions = state.wanderers.map((entity) => `${entity.id}:${entity.x.toFixed(2)},${entity.z.toFixed(2)}`).join(";");
  canvas.dataset.hairVariants = new Set([...hairObjects.values()].filter((object) => object.visible).map((object) => object.userData.hairFrame)).size.toString();
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
  const playerBeforeMove = { x: state.player.x, z: state.player.z };
  const next = { x: state.player.x + Math.sin(state.player.angle) * move, z: state.player.z + Math.cos(state.player.angle) * move };
  const resolved = resolveMovement(state.player, next, solids, state.player.radius);
  if (resolved.hit && now - state.lastCollisionAt > 450) { state.lastCollisionAt = now; showMessage("こつん"); }
  state.player.x = resolved.x; state.player.z = resolved.z;
  for (const entity of state.wanderers) {
    const entityBeforeUpdate = { x: entity.x, z: entity.z };
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
      const entityBeforeMove = { x: entity.x, z: entity.z };
      stepWanderer(entity, dt, now);
      const actorResolved = resolveMovement(entityBeforeMove, entity, actorSolids, actorFurnitureRadius(entity));
      entity.x = actorResolved.x;
      entity.z = actorResolved.z;
      if (actorResolved.hit) {
        entity.targetAngle = normalizedAngle(entity.angle + Math.PI * (.72 + entity.seed * .013));
        entity.turnAt = now + 650;
      }
    }
    const actorContactRadius = playerActorRadius(entity);
    if (circlesOverlap(state.player, state.player.radius, entity, actorContactRadius)) {
      const separation = state.player.radius + actorContactRadius + .03;
      if (Math.hypot(state.player.x - playerBeforeMove.x, state.player.z - playerBeforeMove.z) > .0001) {
        state.player.x = playerBeforeMove.x;
        state.player.z = playerBeforeMove.z;
        entity.x = entityBeforeUpdate.x;
        entity.z = entityBeforeUpdate.z;
      } else {
        const dx = entity.x - state.player.x;
        const dz = entity.z - state.player.z;
        const distance = Math.hypot(dx, dz) || 1;
        const actorTarget = {
          x: state.player.x + dx / distance * separation,
          z: state.player.z + dz / distance * separation,
        };
        const actorResolved = resolveMovement(entity, actorTarget, actorSolids, actorFurnitureRadius(entity));
        entity.x = actorResolved.x;
        entity.z = actorResolved.z;
      }
      const dx = entity.x - state.player.x;
      const dz = entity.z - state.player.z;
      entity.targetAngle = Math.atan2(dx, dz);
      entity.turnAt = now + 500;
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
    for (const hair of state.hairs) if (hair.collected) {
      const object = hairObjects.get(hair.id);
      const shadow = hairShadows.get(hair.id);
      if (object) object.visible = false;
      if (shadow) shadow.visible = false;
    }
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
      world.remove(object);
      object.traverse((part) => part.material?.dispose());
      hairObjects.delete(id);
      const shadow = hairShadows.get(id);
      if (shadow) {
        world.remove(shadow); shadow.geometry.dispose(); shadow.material.dispose(); hairShadows.delete(id);
      }
    }
  }
  for (const hair of state.hairs) {
    const object = hairObjects.get(hair.id);
    const shadow = hairShadows.get(hair.id);
    if (object) object.visible = true;
    if (shadow) shadow.visible = true;
  }
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
  buildRoom(); createRobotBody(); await Promise.all([buildBackWallArt(), buildSideWallArt(), buildGameObjects()]); resize(); syncScene(performance.now(), 1 / 60);
  ui.start.disabled = false; ui.controls.hidden = true; requestAnimationFrame(frame);
  const params = new URLSearchParams(location.search);
  if (params.has("autostart")) {
    startGame();
    if (params.get("zone") === "sofa") { state.player.x = 3.15; state.player.z = 4.55; }
    if (params.get("zone") === "table") { state.player.x = -2.7; state.player.z = 5.45; }
    const focusedHairId = params.has("hair") ? Number(params.get("hair")) : Number.NaN;
    const focusedHair = state.hairs.find((hair) => hair.id === focusedHairId);
    if (focusedHair) {
      focusedHair.x = 0;
      focusedHair.z = 1.25;
      state.player.x = 0;
      state.player.z = 0;
      state.player.angle = 0;
    }
    visual.x = state.player.x; visual.z = state.player.z;
    if (params.has("spin")) keys.add("ArrowLeft");
    if (params.has("drive")) { input.y = -.72; input.anchorAngle = state.player.angle; }
    if (params.get("steer") === "right") { input.x = .72; input.y = -.72; input.anchorAngle = state.player.angle; }
    const requestedActor = params.get("actor");
    if (requestedActor) {
      let actor = state.wanderers.find((entity) => entity.type === requestedActor);
      if (!actor) {
        const replacementIndex = state.wanderers.findIndex((entity) => requestedActor === "baby" ? entity.type === "baby" : entity.type !== "baby");
        if (replacementIndex >= 0) {
          const template = CHARACTER_TEMPLATES[requestedActor];
          const previous = state.wanderers[replacementIndex];
          state.wanderers[replacementIndex] = {
            ...previous,
            ...template,
            action: requestedActor === "baby" ? "crawl" : "walk",
            actionStartedAt: performance.now(),
          };
          actor = state.wanderers[replacementIndex];
        }
      }
      if (actor) {
        const actorZone = params.get("actorZone");
        if (actorZone === "sofa") { actor.x = sofa.x; actor.z = 3.7; actor.angle = 0; }
        else if (actorZone === "table") { actor.x = tableArea.x; actor.z = 4.65; actor.angle = 0; }
        else { actor.x = 0; actor.z = 3.8; actor.angle = Math.PI; }
      }
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
