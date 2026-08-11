import test from "node:test";
import assert from "node:assert/strict";
import { actorContactRadius, canVacuum, circlesOverlap, collectNearbyHair, collectTouchedHair, createDroppedHair, hitVomit, joystickHeading, keyboardTurn, normalizedAngle, resolveMovement, stepWanderer, sweptCirclesOverlap, sweptEllipseOverlap, turnToward } from "../src/core.js";

test("actor contact starts at the visible foot area, not the full sprite width", () => {
  const robot = { x: 0, z: 0 };
  const yuragi = { x: .55, z: 0 };
  assert.equal(circlesOverlap(robot, .26, yuragi, actorContactRadius("yuragi")), false);
  yuragi.x = .33;
  assert.equal(circlesOverlap(robot, .26, yuragi, actorContactRadius("yuragi")), true);
});

test("moving actors cannot tunnel through the robot between rendered frames", () => {
  const robotBefore = { x: 0, z: 0 };
  const robotAfter = { x: 0, z: .16 };
  const actorBefore = { x: 0, z: .72 };
  const actorAfter = { x: 0, z: .38 };
  assert.equal(sweptCirclesOverlap(robotBefore, robotAfter, .26, actorBefore, actorAfter, .25), true);
});

test("actor foot collision is wide sideways without stopping early in front", () => {
  const still = { x: 0, z: 0 };
  assert.equal(sweptEllipseOverlap(still, still, { x: .53, z: .16 }, { x: .53, z: .16 }, .64, .43, 0), true);
  assert.equal(sweptEllipseOverlap(still, still, { x: 0, z: .5 }, { x: 0, z: .5 }, .64, .43, 0), false);
});

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

test("robot automatically collects hair it drives over", () => {
  const hairs = [
    { x: .3, z: .2, grams: .7, cat: "kotaro", collected: false },
    { x: 1.2, z: 0, grams: .9, cat: "yuragi", collected: false },
  ];
  assert.deepEqual(collectTouchedHair({ x: 0, z: 0 }, hairs), { grams: .7, kotaro: 1, yuragi: 0 });
  assert.equal(hairs[0].collected, true);
  assert.equal(hairs[1].collected, false);
});

test("furniture collision slides along the open axis without entering the leg", () => {
  const player = { x: 0, z: 0 };
  const moved = resolveMovement(player, { x: 1, z: 1 }, [{ id: "leg", kind: "circle", x: 1, z: 1, radius: .22 }]);
  assert.equal(moved.hit, "leg");
  assert.notDeepEqual({ x: moved.x, z: moved.z }, { x: 1, z: 1 });
  assert.ok(moved.x === 1 || moved.z === 1);
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

test("keyboard left and right turn in the expected directions", () => {
  assert.equal(keyboardTurn(new Set(["ArrowLeft"])), 1);
  assert.equal(keyboardTurn(new Set(["ArrowRight"])), -1);
  assert.equal(keyboardTurn(new Set(["a"])), 1);
  assert.equal(keyboardTurn(new Set(["d"])), -1);
});

test("joystick diagonal chooses one stable heading instead of accumulating rotation", () => {
  const target = joystickHeading(0, .72, -.72);
  assert.ok(Math.abs(target - Math.PI / 4) < 1e-9);
  let angle = 0;
  for (let i = 0; i < 30; i += 1) angle = turnToward(angle, target, .08);
  assert.ok(Math.abs(angle - target) < 1e-9);
  assert.equal(turnToward(angle, target, .08), angle);
});

test("a scratching cat drops a new collectible hair beside itself", () => {
  const hair = createDroppedHair({ x: 2, z: 3, angle: 0, type: "yuragi" }, 24);
  assert.equal(hair.id, 24);
  assert.equal(hair.cat, "yuragi");
  assert.equal(hair.grams, .8);
  assert.equal(hair.dropped, true);
  assert.equal(hair.collected, false);
  assert.ok(Math.hypot(hair.x - 2, hair.z - 3) > .3);
  assert.deepEqual(collectTouchedHair({ x: hair.x, z: hair.z }, [hair]), { grams: .8, kotaro: 0, yuragi: 1 });
  assert.equal(hair.collected, true);
});
