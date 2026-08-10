import * as THREE from "../public/vendor/three.module.js";
import {
  circlesOverlap,
  collectNearbyHair,
  createInitialHair,
  hitVomit,
  isInsideRect,
  normalizedAngle,
  resolveMovement,
  stepWanderer,
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
  vacuum: document.querySelector("#vacuum"),
  message: document.querySelector("#message"),
};

const sofa = { id: "sofa", x: -3.15, z: 6.65, w: 4.35, d: 2.55, clearance: .34 };
const solids = [];
for (const [id, x, z] of [
  ["sofa-leg-1", -4.82, 5.7], ["sofa-leg-2", -1.48, 5.7], ["sofa-leg-3", -4.82, 7.6], ["sofa-leg-4", -1.48, 7.6],
  ["table-leg-1", .95, 6.5], ["table-leg-2", 4.45, 6.5], ["table-leg-3", .95, 8.6], ["table-leg-4", 4.45, 8.6],
  ["chair-a1", 3.05, 4.02], ["chair-a2", 3.95, 4.02], ["chair-a3", 3.05, 4.88], ["chair-a4", 3.95, 4.88],
  ["chair-b1", .34, 6.7], ["chair-b2", 1.16, 6.7], ["chair-b3", .34, 7.52], ["chair-b4", 1.16, 7.52],
]) solids.push({ id, kind: "circle", x, z, radius: id.startsWith("table") ? .18 : .15 });

const vomits = [
  { id: "v1", x: .78, z: 2.8, radius: .38 },
  { id: "v2", x: -2.25, z: 12.25, radius: .36 },
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
const camera = new THREE.PerspectiveCamera(71, 1, .06, 28);
scene.add(camera);

const world = new THREE.Group();
scene.add(world);
const environment = new THREE.Group();
scene.add(environment);
const hairObjects = new Map();
const characterObjects = new Map();
const characterShadows = new Map();
const keys = new Set();
const input = { x: 0, y: 0, suction: false, joystickPointer: null };
const visual = { x: 0, z: 0, angle: 0 };
let state = makeState();
let lastFrame = performance.now();
let messageTimer = 0;
let audio = null;
let robotRing = null;
let suctionLight = null;

function makeState() {
  return {
    mode: "intro",
    player: { x: 0, z: 0, angle: 0, radius: .26 },
    hairs: createInitialHair(),
    grams: 0,
    counts: { kotaro: 0, yuragi: 0 },
    remaining: 60,
    lastCollisionAt: 0,
    wanderers: [
      { id: "kotaro", type: "kotaro", x: -1.35, z: 4.25, angle: .8, speed: .42, radius: .48, turnAt: 0, seed: 2 },
      { id: "yuragi", type: "yuragi", x: .55, z: 6.15, angle: -1.4, speed: .28, radius: .58, turnAt: 0, seed: 7 },
      { id: "baby", type: "baby", x: 1.05, z: 3.95, angle: 2.1, speed: .34, radius: .52, turnAt: 0, seed: 11 },
    ],
  };
}

function box(w, h, d, color, x, y, z, texture = null) {
  const material = new THREE.MeshStandardMaterial({ color: texture ? 0xffffff : color, roughness: .82, metalness: 0, map: texture });
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
    g.fillStyle = "#c78f72"; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = x % 64 ? "#cc9678" : "#bd856c"; g.fillRect(x, 0, 31, h);
      g.fillStyle = "rgba(85,55,51,.2)"; g.fillRect(x + 31, 0, 1, h);
    }
    for (let y = 0; y < h; y += 64) { g.fillStyle = "rgba(255,214,184,.16)"; g.fillRect(0, y, w, 1); }
    for (let i = 0; i < 150; i += 1) {
      const x = (i * 47) % w; const y = (i * 83) % h;
      g.fillStyle = i % 3 ? "rgba(255,223,192,.12)" : "rgba(72,47,44,.10)"; g.fillRect(x, y, 2 + i % 5, 1);
    }
  }, 3, 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(11.2, 17.2), new THREE.MeshStandardMaterial({ map: floorTexture, roughness: .7, metalness: .03 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 7.4);
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

async function buildEnvironment() {
  const loader = new THREE.TextureLoader();
  const textures = await Promise.all([
    loader.loadAsync("./public/assets/room-env-a.png"),
    loader.loadAsync("./public/assets/room-env-b.png"),
    loader.loadAsync("./public/assets/room-env-c.png"),
  ]);
  const atlas = document.createElement("canvas");
  atlas.width = 3072; atlas.height = 1024;
  const g = atlas.getContext("2d");
  const sequence = [0, 1, 2, 0, 1, 2];
  const panelWidth = atlas.width / sequence.length;
  sequence.forEach((textureIndex, index) => g.drawImage(textures[textureIndex].image, index * panelWidth, 0, panelWidth + 1, atlas.height));
  const panorama = new THREE.CanvasTexture(atlas);
  panorama.colorSpace = THREE.SRGBColorSpace;
  panorama.magFilter = THREE.NearestFilter;
  panorama.minFilter = THREE.LinearMipmapLinearFilter;
  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(17, 17, 28, 96, 1, true),
    new THREE.MeshBasicMaterial({ map: panorama, side: THREE.BackSide, toneMapped: false })
  );
  cylinder.position.y = -1.35;
  cylinder.rotation.y = Math.PI / 2;
  environment.add(cylinder);
}

function buildSofa() {
  const lavender = 0x9f91ae;
  const fabric = pixelTexture(64, 64, (g, w, h) => {
    g.fillStyle = "#9f91ae"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 180; i += 1) { g.fillStyle = i % 3 ? "rgba(255,244,249,.09)" : "rgba(70,55,80,.1)"; g.fillRect((i * 17) % w, (i * 31) % h, 1, 2); }
  }, 3, 2);
  box(4.35, .72, 2.35, lavender, -3.15, .71, 6.65, fabric);
  box(4.35, 1.12, .35, 0x9384a4, -3.15, 1.24, 7.66, fabric);
  box(.32, .36, .32, 0x5b4748, -4.82, .18, 5.7); box(.32, .36, .32, 0x5b4748, -1.48, .18, 5.7);
  box(.32, .36, .32, 0x5b4748, -4.82, .18, 7.6); box(.32, .36, .32, 0x5b4748, -1.48, .18, 7.6);
  box(1.85, .18, 1.88, 0xb3a6be, -4.2, 1.12, 6.57); box(1.85, .18, 1.88, 0xaa9db8, -2.1, 1.12, 6.57);
  const pillow = box(.82, .58, .18, 0xd09ca1, -4.25, 1.42, 7.4); pillow.rotation.z = -.15;
  box(.68, .62, .045, 0xd9a4a7, -3.45, .79, 5.46);
  for (let i = 0; i < 6; i += 1) box(.045, .12 + (i % 2) * .03, .045, 0xc88791, -3.72 + i * .11, .42, 5.44);
}

function buildTable() {
  const wood = pixelTexture(64, 64, (g, w, h) => {
    g.fillStyle = "#825b48"; g.fillRect(0, 0, w, h);
    for (let y = 5; y < h; y += 11) { g.fillStyle = "rgba(244,188,132,.15)"; g.fillRect(0, y, w, 2); }
    for (let i = 0; i < 16; i += 1) { g.fillStyle = "rgba(67,39,36,.16)"; g.fillRect((i * 23) % w, (i * 37) % h, 13, 1); }
  }, 3, 2);
  box(4.1, .18, 2.65, 0x825b48, 2.7, .94, 7.55, wood);
  for (const [x, z] of [[.95,6.5],[4.45,6.5],[.95,8.6],[4.45,8.6]]) box(.26, .9, .26, 0x654535, x, .45, z, wood);
  buildChair(3.5, 4.45, 0x8f7898);
  buildChair(.75, 7.1, 0xa093ab, Math.PI);
}

function buildChair(x, z, color, rotation = 0) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotation; world.add(group);
  const add = (w, h, d, px, py, pz, shade = color) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: shade, roughness: .88 }));
    mesh.position.set(px, py, pz); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  add(1.2, .16, 1.18, 0, .58, 0);
  add(.72, .16, .12, 0, .92, .5, color);
  for (const [px, pz] of [[-.43,-.43],[.43,-.43],[-.43,.43],[.43,.43]]) add(.16, .58, .16, px, .29, pz, 0x5e4950);
}

function buildDecor() {
  box(1.35, .8, .45, 0x9b715d, -1.0, .4, 14.9);
  box(.38, .85, .38, 0xc7aaa6, -1.0, 1.22, 14.95);
  const plant = new THREE.Group(); plant.position.set(-1.0, 1.78, 14.85); world.add(plant);
  for (let i = 0; i < 10; i += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.14, 6, 4), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x768d66 : 0x91a978, roughness: 1 }));
    leaf.scale.set(1.5, .55, .65); leaf.position.set(Math.sin(i * 2.2) * .28, (i % 4) * .17, Math.cos(i * 1.8) * .18); leaf.rotation.z = i; plant.add(leaf);
  }

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
  makeWallArt(-5.52, 2.25, Math.PI / 2);
  makeWallArt(-5.52, 11.6, Math.PI / 2);
  makeWallArt(5.52, 2.25, -Math.PI / 2);
  makeWallArt(5.52, 11.9, -Math.PI / 2);

  box(1.45, .58, .5, 0xc39a82, 5.28, .29, 2.25);
  box(.75, .08, .36, 0xead6c6, 5.22, .63, 2.24);
  const sidePlant = new THREE.Group(); sidePlant.position.set(5.18, .7, 2.24); world.add(sidePlant);
  for (let i = 0; i < 7; i += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.075, 6, 4), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x748f6c : 0x91a67d, roughness: 1 }));
    leaf.scale.set(1.5, .48, .7); leaf.position.set(Math.sin(i * 2.1) * .14, (i % 3) * .1, Math.cos(i) * .08); leaf.rotation.z = i * .7; sidePlant.add(leaf);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.15, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd9a0a8, roughness: 1 }));
  ball.position.set(-4.75, .15, 11.2); ball.castShadow = true; world.add(ball);
}

function createRobotBody() {
  suctionLight = new THREE.PointLight(0xa8eee4, 0, 2.2);
  suctionLight.position.set(0, -.08, -1.0); camera.add(suctionLight);
}

function tuftTexture() {
  return pixelTexture(48, 48, (g) => {
    g.clearRect(0, 0, 48, 48); g.strokeStyle = "rgba(244,234,222,.95)"; g.lineWidth = 2; g.lineCap = "round";
    for (let i = 0; i < 15; i += 1) {
      const a = i / 15 * Math.PI * 2; const r = 8 + i % 5;
      g.beginPath(); g.moveTo(24, 27); g.quadraticCurveTo(24 + Math.cos(a + .6) * r, 18 + Math.sin(a) * 4, 24 + Math.cos(a) * (r + 7), 27 + Math.sin(a) * 8); g.stroke();
    }
  });
}

async function buildGameObjects() {
  const loader = new THREE.TextureLoader();
  const master = await loader.loadAsync("./public/assets/characters-master.png");
  master.colorSpace = THREE.SRGBColorSpace;
  master.magFilter = THREE.NearestFilter;
  master.minFilter = THREE.NearestFilter;
  const specs = {
    kotaro: { sx: 245, sy: 205, sw: 350, sh: 460, height: .84 },
    yuragi: { sx: 680, sy: 185, sw: 455, sh: 500, height: .94 },
    baby: { sx: 1200, sy: 285, sw: 370, sh: 370, height: .78 },
  };
  for (const entity of state.wanderers) {
    const spec = specs[entity.type];
    const map = master.clone();
    map.repeat.set(spec.sw / 1774, spec.sh / 887);
    map.offset.set(spec.sx / 1774, 1 - (spec.sy + spec.sh) / 887);
    map.needsUpdate = true;
    const material = new THREE.SpriteMaterial({ map, transparent: true, alphaTest: .2, depthWrite: true, color: 0xfff8f2, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(spec.height * spec.sw / spec.sh, spec.height, 1);
    sprite.center.set(.5, 0);
    sprite.position.set(entity.x, .03, entity.z);
    world.add(sprite);
    characterObjects.set(entity.id, sprite);

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(entity.radius * .72, 14), new THREE.MeshBasicMaterial({ color: 0x493b42, transparent: true, opacity: .22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.scale.y = .42; shadow.position.set(entity.x, .012, entity.z); world.add(shadow); characterShadows.set(entity.id, shadow);
  }

  const hairMaterial = new THREE.SpriteMaterial({ map: tuftTexture(), transparent: true, depthWrite: false, alphaTest: .05 });
  for (const hair of state.hairs) {
    const sprite = new THREE.Sprite(hairMaterial.clone());
    sprite.scale.set(.25, .17, 1); sprite.center.set(.5, .15); sprite.position.set(hair.x, .025, hair.z);
    world.add(sprite); hairObjects.set(hair.id, sprite);
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

function syncScene(now, dt) {
  const follow = 1 - Math.exp(-dt * 9);
  visual.x += (state.player.x - visual.x) * follow;
  visual.z += (state.player.z - visual.z) * follow;
  visual.angle = normalizedAngle(visual.angle + normalizedAngle(state.player.angle - visual.angle) * follow);
  const under = isInsideRect(state.player, sofa);
  camera.position.set(visual.x, under ? .225 : .265, visual.z);
  camera.lookAt(visual.x + Math.sin(visual.angle), camera.position.y - .025, visual.z + Math.cos(visual.angle));
  camera.fov = 71 + Math.sin(now * .006) * .15;
  camera.updateProjectionMatrix();
  for (const entity of state.wanderers) {
    const sprite = characterObjects.get(entity.id);
    if (!sprite) continue;
    sprite.position.set(entity.x, .025 + Math.sin(now * .006 + entity.seed) * .01, entity.z);
    const distance = Math.hypot(entity.x - state.player.x, entity.z - state.player.z);
    sprite.visible = distance > .55;
    const specWidth = sprite.userData.baseWidth || sprite.scale.x;
    sprite.userData.baseWidth = specWidth;
    const travelView = normalizedAngle(entity.angle - Math.atan2(state.player.x - entity.x, state.player.z - entity.z));
    const side = Math.sin(travelView);
    sprite.scale.x = Math.sign(side || 1) * specWidth * (.76 + Math.abs(Math.cos(travelView)) * .24);
    sprite.material.color.set(Math.cos(travelView) < -.2 ? 0xe7ddd8 : 0xfff8f2);
    sprite.material.rotation = Math.sin(now * .007 + entity.seed) * (entity.type === "baby" ? .035 : .018);
    const shadow = characterShadows.get(entity.id);
    if (shadow) { shadow.position.set(entity.x, .012, entity.z); shadow.visible = sprite.visible; }
  }
  for (const hair of state.hairs) hairObjects.get(hair.id)?.position.set(hair.x, .025 + Math.sin(now * .009 + hair.id) * .008, hair.z);
  if (robotRing) robotRing.material.color.set(input.suction ? 0xa8eee4 : 0x8e87a6);
  if (suctionLight) suctionLight.intensity = input.suction ? 2.2 : 0;
  canvas.dataset.view = "continuous-3d";
}

function update(dt, now) {
  if (state.mode !== "playing") return;
  state.remaining = Math.max(0, state.remaining - dt);
  if (state.remaining <= 0) return finish(false);
  let turn = input.x;
  let forward = -input.y;
  if (keys.has("ArrowLeft") || keys.has("a")) turn -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) turn += 1;
  if (keys.has("ArrowUp") || keys.has("w")) forward += 1;
  if (keys.has("ArrowDown") || keys.has("s")) forward -= 1;
  state.player.angle = normalizedAngle(state.player.angle + turn * dt * 1.75);
  const move = forward * dt * 2.05;
  const next = { x: state.player.x + Math.sin(state.player.angle) * move, z: state.player.z + Math.cos(state.player.angle) * move };
  const resolved = resolveMovement(state.player, next, solids, state.player.radius);
  if (resolved.hit && now - state.lastCollisionAt > 450) { state.lastCollisionAt = now; showMessage("こつん"); }
  state.player.x = resolved.x; state.player.z = resolved.z;
  for (const entity of state.wanderers) {
    stepWanderer(entity, dt, now);
    if (circlesOverlap(state.player, state.player.radius, entity, entity.radius)) {
      state.player.x -= Math.sin(state.player.angle) * dt * 2.7;
      state.player.z -= Math.cos(state.player.angle) * dt * 2.7;
      if (now - state.lastCollisionAt > 700) {
        state.lastCollisionAt = now;
        showMessage(entity.type === "baby" ? "あぶない、あぶない" : `${entity.type === "kotaro" ? "虎太郎" : "ゆらぎ"}、通ります`);
      }
    }
  }
  if (hitVomit(state.player, vomits)) return finish(true);
  const collected = collectNearbyHair(state.player, state.hairs, input.suction || keys.has(" "));
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
  input.x = 0; input.y = 0; input.suction = false;
  visual.x = state.player.x; visual.z = state.player.z; visual.angle = state.player.angle;
  for (const hair of state.hairs) { const object = hairObjects.get(hair.id); if (object) object.visible = true; }
  state.mode = "playing";
  ui.intro.hidden = true; ui.result.hidden = true; ui.controls.hidden = false;
  ui.grams.textContent = "0.0"; ui.time.textContent = "60";
  ensureAudio();
}

function finish(hitHazard) {
  if (state.mode !== "playing") return;
  state.mode = "result"; input.suction = false; ui.vacuum.classList.remove("active");
  ui.controls.hidden = true; ui.result.hidden = false;
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

ui.joystick.addEventListener("pointerdown", (event) => { input.joystickPointer = event.pointerId; ui.joystick.setPointerCapture(event.pointerId); joystickMove(event); });
ui.joystick.addEventListener("pointermove", joystickMove);
ui.joystick.addEventListener("pointerup", joystickEnd);
ui.joystick.addEventListener("pointercancel", joystickEnd);
for (const eventName of ["pointerdown", "pointerenter"]) ui.vacuum.addEventListener(eventName, (event) => {
  if (eventName === "pointerenter" && event.buttons !== 1) return;
  input.suction = true; ui.vacuum.classList.add("active"); if (eventName === "pointerdown") ui.vacuum.setPointerCapture(event.pointerId);
});
for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) ui.vacuum.addEventListener(eventName, () => { input.suction = false; ui.vacuum.classList.remove("active"); });
window.addEventListener("keydown", (event) => { keys.add(event.key.length === 1 ? event.key.toLowerCase() : event.key); if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(event.key)) event.preventDefault(); });
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
  buildRoom(); createRobotBody(); await Promise.all([buildEnvironment(), buildGameObjects()]); resize(); syncScene(performance.now(), 1 / 60);
  ui.start.disabled = false; ui.controls.hidden = true; requestAnimationFrame(frame);
  const params = new URLSearchParams(location.search);
  if (params.has("autostart")) {
    startGame();
    if (params.has("spin")) input.x = .62;
    if (params.has("drive")) input.y = -.72;
  }
}

init().catch((error) => {
  console.error(error);
  ui.start.disabled = false;
  ui.start.textContent = "再読み込みしてください";
});
