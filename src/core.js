export const ROOM = { minX: -5.6, maxX: 5.6, minZ: -3.1, maxZ: 11.8 };

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function circlesOverlap(a, ar, b, br) {
  return distance(a, b) < ar + br;
}

export function sweptCirclesOverlap(a0, a1, ar, b0, b1, br) {
  const startX = a0.x - b0.x;
  const startZ = a0.z - b0.z;
  const moveX = (a1.x - a0.x) - (b1.x - b0.x);
  const moveZ = (a1.z - a0.z) - (b1.z - b0.z);
  const movementSquared = moveX * moveX + moveZ * moveZ;
  const progress = movementSquared > 0
    ? clamp(-(startX * moveX + startZ * moveZ) / movementSquared, 0, 1)
    : 0;
  const closestX = startX + moveX * progress;
  const closestZ = startZ + moveZ * progress;
  const radius = ar + br;
  return closestX * closestX + closestZ * closestZ < radius * radius;
}

export function sweptEllipseOverlap(a0, a1, b0, b1, rightRadius, forwardRadius, angle) {
  const rightX = Math.cos(angle);
  const rightZ = -Math.sin(angle);
  const forwardX = Math.sin(angle);
  const forwardZ = Math.cos(angle);
  const relative = (a, b) => {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return {
      x: (dx * rightX + dz * rightZ) / rightRadius,
      z: (dx * forwardX + dz * forwardZ) / forwardRadius,
    };
  };
  const start = relative(a0, b0);
  const end = relative(a1, b1);
  const moveX = end.x - start.x;
  const moveZ = end.z - start.z;
  const movementSquared = moveX * moveX + moveZ * moveZ;
  const progress = movementSquared > 0
    ? clamp(-(start.x * moveX + start.z * moveZ) / movementSquared, 0, 1)
    : 0;
  const closestX = start.x + moveX * progress;
  const closestZ = start.z + moveZ * progress;
  return closestX * closestX + closestZ * closestZ < 1;
}

export function actorContactRadius(type) {
  if (type === "baby") return .08;
  if (type === "yuragi") return .08;
  return .08;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizedAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function keyboardTurn(keys) {
  let turn = 0;
  if (keys.has("ArrowLeft") || keys.has("a")) turn += 1;
  if (keys.has("ArrowRight") || keys.has("d")) turn -= 1;
  return turn;
}

export function joystickHeading(anchorAngle, x, y) {
  return normalizedAngle(anchorAngle + Math.atan2(x, -y));
}

export function turnToward(currentAngle, targetAngle, maxStep) {
  const delta = normalizedAngle(targetAngle - currentAngle);
  return normalizedAngle(currentAngle + clamp(delta, -maxStep, maxStep));
}

export function isInsideRect(point, rect, padding = 0) {
  return point.x > rect.x - rect.w / 2 - padding && point.x < rect.x + rect.w / 2 + padding &&
    point.z > rect.z - rect.d / 2 - padding && point.z < rect.z + rect.d / 2 + padding;
}

export function resolveMovement(player, next, solids, radius = 0.25) {
  const full = {
    x: clamp(next.x, ROOM.minX + radius, ROOM.maxX - radius),
    z: clamp(next.z, ROOM.minZ + radius, ROOM.maxZ - radius),
  };
  const collisionAt = (point) => solids.find((solid) =>
    solid.kind === "circle" ? circlesOverlap(point, radius, solid, solid.radius) :
      solid.kind === "rect" ? isInsideRect(point, solid, radius) : false
  );
  const hit = collisionAt(full);
  if (!hit) return { ...full, hit: null };

  const slideX = { x: full.x, z: player.z };
  if (!collisionAt(slideX)) return { ...slideX, hit: hit.id };
  const slideZ = { x: player.x, z: full.z };
  if (!collisionAt(slideZ)) return { ...slideZ, hit: hit.id };
  return { ...player, hit: hit.id };
}

export function canVacuum(player, hair, suction, maxDistance = 2.05) {
  if (!suction || hair.collected) return false;
  const dx = hair.x - player.x;
  const dz = hair.z - player.z;
  const d = Math.hypot(dx, dz);
  if (d > maxDistance) return false;
  const targetAngle = Math.atan2(dx, dz);
  return Math.abs(normalizedAngle(targetAngle - player.angle)) < 0.48;
}

export function collectNearbyHair(player, hairs, suction) {
  let grams = 0;
  let kotaro = 0;
  let yuragi = 0;
  let kotaroGrams = 0;
  let yuragiGrams = 0;
  for (const hair of hairs) {
    if (!canVacuum(player, hair, suction)) continue;
    hair.collected = true;
    grams += hair.grams;
    if (hair.cat === "kotaro") { kotaro += 1; kotaroGrams += hair.grams; }
    else { yuragi += 1; yuragiGrams += hair.grams; }
  }
  return { grams, kotaro, yuragi, kotaroGrams, yuragiGrams };
}

export function collectTouchedHair(player, hairs, maxDistance = .55) {
  let grams = 0;
  let kotaro = 0;
  let yuragi = 0;
  let kotaroGrams = 0;
  let yuragiGrams = 0;
  for (const hair of hairs) {
    if (hair.collected || distance(player, hair) > maxDistance) continue;
    hair.collected = true;
    grams += hair.grams;
    if (hair.cat === "kotaro") { kotaro += 1; kotaroGrams += hair.grams; }
    else { yuragi += 1; yuragiGrams += hair.grams; }
  }
  return { grams, kotaro, yuragi, kotaroGrams, yuragiGrams };
}

export function createDroppedHair(entity, id) {
  const sideAngle = entity.angle + Math.PI / 2;
  return {
    id,
    x: entity.x + Math.sin(sideAngle) * .34,
    z: entity.z + Math.cos(sideAngle) * .34,
    grams: entity.type === "yuragi" ? .8 : .6,
    cat: entity.type,
    collected: false,
    dropped: true,
  };
}

export function stepWanderer(entity, dt, now, room = ROOM) {
  if (now >= entity.turnAt) {
    const phase = Math.sin(now * 0.001 + entity.seed * 4.13);
    entity.targetAngle = normalizedAngle(entity.angle + phase * 1.8 + 0.55);
    entity.turnAt = now + 1150 + (entity.seed % 5) * 210;
  }
  entity.angle = turnToward(entity.angle, entity.targetAngle ?? entity.angle, dt * 2.4);
  const speed = entity.speed * dt;
  entity.x += Math.sin(entity.angle) * speed;
  entity.z += Math.cos(entity.angle) * speed;
  if (entity.x < room.minX + .8 || entity.x > room.maxX - .8) entity.targetAngle = normalizedAngle(-entity.angle);
  if (entity.z < room.minZ + 1.2 || entity.z > room.maxZ - .8) entity.targetAngle = normalizedAngle(Math.PI - entity.angle);
  entity.x = clamp(entity.x, room.minX + .75, room.maxX - .75);
  entity.z = clamp(entity.z, room.minZ + 1.1, room.maxZ - .75);
  return entity;
}

export function hitVomit(player, vomits, radius = .31) {
  return vomits.some((item) => circlesOverlap(player, radius, item, item.radius));
}

export function shouldAutostart(params) {
  return params.has("debug") && params.has("autostart");
}

export function createInitialHair() {
  const raw = [
    [2.4, 3.2, .6, "kotaro"], [.62, 1.95, .8, "yuragi"], [-4.75, 2.7, .7, "kotaro"],
    [4.78, 2.35, .7, "yuragi"], [5.0, 5.5, .5, "kotaro"], [4.7, 10.7, .9, "yuragi"],
    [-4.2, 5.0, .8, "yuragi"], [-3.0, 5.7, .6, "kotaro"], [-2.0, 6.35, 1.0, "yuragi"],
    [2.1, 4.25, .6, "kotaro"], [2.9, 6.5, .7, "yuragi"], [.7, 9.7, .5, "kotaro"],
    [-3.9, 10.4, .8, "yuragi"], [3.6, 8.9, .6, "kotaro"], [-.8, 3.5, .5, "kotaro"],
    [1.5, 10.8, .9, "yuragi"], [-3.1, 1.2, .5, "kotaro"], [3.9, 3.4, .8, "yuragi"],
  ];
  return raw.map(([x, z, grams, cat], id) => ({ id, x, z, grams, cat, collected: false }));
}
