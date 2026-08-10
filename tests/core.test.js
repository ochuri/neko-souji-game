import test from "node:test";
import assert from "node:assert/strict";
import { canVacuum, collectNearbyHair, hitVomit, normalizedAngle, resolveMovement, stepWanderer } from "../src/core.js";

test("vacuum only collects hair in front while suction is active", () => {
  const player = { x: 0, z: 0, angle: 0 };
  assert.equal(canVacuum(player, { x: 0.2, z: 1, collected: false }, true), true);
  assert.equal(canVacuum(player, { x: 0, z: -1, collected: false }, true), false);
  assert.equal(canVacuum(player, { x: 0, z: 1, collected: false }, false), false);
});

test("collection returns exact grams and breed counts", () => {
  const hairs = [
    { x: 0, z: 1, grams: .7, cat: "kotaro", collected: false },
    { x: .1, z: 1.4, grams: .9, cat: "yuragi", collected: false },
  ];
  assert.deepEqual(collectNearbyHair({ x: 0, z: 0, angle: 0 }, hairs, true), { grams: 1.6, kotaro: 1, yuragi: 1 });
  assert.equal(hairs.every((hair) => hair.collected), true);
});

test("furniture collision blocks movement", () => {
  const player = { x: 0, z: 0 };
  const moved = resolveMovement(player, { x: 1, z: 1 }, [{ id: "leg", kind: "circle", x: 1, z: 1, radius: .22 }]);
  assert.equal(moved.hit, "leg");
  assert.equal(moved.x, 0);
});

test("vomit collision is a fail condition", () => {
  assert.equal(hitVomit({ x: 1, z: 1 }, [{ x: 1.2, z: 1.1, radius: .36 }]), true);
  assert.equal(hitVomit({ x: 0, z: 0 }, [{ x: 3, z: 3, radius: .36 }]), false);
});

test("moving obstacle remains within the room", () => {
  const obstacle = { x: 5.4, z: 15.5, angle: .7, speed: 4, turnAt: 0, seed: 3 };
  stepWanderer(obstacle, 3, 1000);
  assert.ok(obstacle.x <= 4.85 && obstacle.z <= 15.05);
});

test("camera heading stays continuous across full rotations", () => {
  assert.ok(Math.abs(normalizedAngle(Math.PI * 2 + .2) - .2) < 1e-9);
  assert.ok(Math.abs(normalizedAngle(-Math.PI * 2 - .2) + .2) < 1e-9);
});
