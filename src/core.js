export const ROOM = { minX: -5.6, maxX: 5.6, minZ: -1, maxZ: 15.8 };

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function circlesOverlap(a, ar, b, br) {
  return distance(a, b) < ar + br;
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

export function isInsideRect(point, rect, padding = 0) {
  return point.x > rect.x - rect.w / 2 - padding && point.x < rect.x + rect.w / 2 + padding &&
    point.z > rect.z - rect.d / 2 - padding && point.z < rect.z + rect.d / 2 + padding;
}

export function resolveMovement(player, next, solids, radius = 0.25) {
  const bounded = {
    x: clamp(next.x, ROOM.minX + radius, ROOM.maxX - radius),
    z: clamp(next.z, ROOM.minZ + radius, ROOM.maxZ - radius),
  };
  for (const solid of solids) {
    if (solid.kind === "circle" && circlesOverlap(bounded, radius, solid, solid.radius)) return { ...player, hit: solid.id };
    if (solid.kind === "rect" && isInsideRect(bounded, solid, radius)) return { ...player, hit: solid.id };
  }
  return { ...bounded, hit: null };
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
  for (const hair of hairs) {
    if (!canVacuum(player, hair, suction)) continue;
    hair.collected = true;
    grams += hair.grams;
    if (hair.cat === "kotaro") kotaro += 1;
    else yuragi += 1;
  }
  return { grams, kotaro, yuragi };
}

export function collectTouchedHair(player, hairs, maxDistance = .55) {
  let grams = 0;
  let kotaro = 0;
  let yuragi = 0;
  for (const hair of hairs) {
    if (hair.collected || distance(player, hair) > maxDistance) continue;
    hair.collected = true;
    grams += hair.grams;
    if (hair.cat === "kotaro") kotaro += 1;
    else yuragi += 1;
  }
  return { grams, kotaro, yuragi };
}

export function stepWanderer(entity, dt, now, room = ROOM) {
  if (now >= entity.turnAt) {
    const phase = Math.sin(now * 0.001 + entity.seed * 4.13);
    entity.angle = normalizedAngle(entity.angle + phase * 1.8 + 0.55);
    entity.turnAt = now + 1150 + (entity.seed % 5) * 210;
  }
  const speed = entity.speed * dt;
  entity.x += Math.sin(entity.angle) * speed;
  entity.z += Math.cos(entity.angle) * speed;
  if (entity.x < room.minX + .8 || entity.x > room.maxX - .8) entity.angle *= -1;
  if (entity.z < room.minZ + 1.2 || entity.z > room.maxZ - .8) entity.angle = Math.PI - entity.angle;
  entity.x = clamp(entity.x, room.minX + .75, room.maxX - .75);
  entity.z = clamp(entity.z, room.minZ + 1.1, room.maxZ - .75);
  return entity;
}

export function hitVomit(player, vomits, radius = .31) {
  return vomits.some((item) => circlesOverlap(player, radius, item, item.radius));
}

export function createInitialHair() {
  const raw = [
    [-.48, 1.55, .6, "kotaro"], [.62, 1.95, .8, "yuragi"], [-4.75, 2.7, .7, "kotaro"],
    [4.78, 2.35, .7, "yuragi"], [5.0, 5.5, .5, "kotaro"], [4.7, 13.8, .9, "yuragi"],
    [-4.2, 5.75, .8, "yuragi"], [-3.0, 6.2, .6, "kotaro"], [-2.0, 6.75, 1.0, "yuragi"],
    [2.1, 4.8, .6, "kotaro"], [2.9, 7.1, .7, "yuragi"], [.7, 11.8, .5, "kotaro"],
    [-3.9, 14.4, .8, "yuragi"], [3.6, 10.3, .6, "kotaro"], [-.8, 3.5, .5, "kotaro"],
    [1.5, 14.8, .9, "yuragi"], [-3.1, 1.2, .5, "kotaro"], [3.9, 3.4, .8, "yuragi"],
  ];
  return raw.map(([x, z, grams, cat], id) => ({ id, x, z, grams, cat, collected: false }));
}
