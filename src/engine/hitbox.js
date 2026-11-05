/**
 * Vaelthorn: The Oath of Darkness — Hitbox & Collision Math Engine
 * File: src/engine/hitbox.js
 * 
 * Pure mathematical 2.5D collision engine governing AABB intersections,
 * dynamic attack swing bounding boxes, Stygian Lance piercing beam bounds,
 * slab-method raycasts, duplicate hit suppression, and 2.5D directional knockback.
 */

/**
 * Mathematical and geometric constants for the 2.5D hitbox system.
 */
const HITBOX_CONSTANTS = Object.freeze({
    DEFAULT_WEAPON_REACH: 2.4,
    DEFAULT_SWING_HEIGHT: 1.8,
    DEFAULT_SWING_Y_OFFSET: 0.9,
    DEFAULT_SWING_REAR_OFFSET: 0.2,
    STYGIAN_LANCE_RANGE: 16.0,
    STYGIAN_LANCE_THICKNESS: 1.0,
    STYGIAN_LANCE_Y_OFFSET: 1.2,
    DEFAULT_KNOCKBACK_FORCE: 6.0,
    KNOCKBACK_VERTICAL_POP_RATIO: 0.3,
    PLANE_DEPTH_TOLERANCE: 0.5,
    EPSILON: 1e-5
});

/**
 * Creates and normalizes a 2.5D Axis-Aligned Bounding Box.
 * Automatically orders coordinates such that min <= max.
 * 
 * @param {number} minX - First X boundary
 * @param {number} minY - First Y boundary
 * @param {number} maxX - Second X boundary
 * @param {number} maxY - Second Y boundary
 * @param {number} [minZ=-0.5] - Minimum Z boundary
 * @param {number} [maxZ=0.5]  - Maximum Z boundary
 * @returns {Object} Normalized bounding box
 */
function createAABB(minX, minY, maxX, maxY, minZ = -0.5, maxZ = 0.5) {
    const safeMinX = Number.isFinite(minX) ? minX : 0.0;
    const safeMaxX = Number.isFinite(maxX) ? maxX : 0.0;
    const safeMinY = Number.isFinite(minY) ? minY : 0.0;
    const safeMaxY = Number.isFinite(maxY) ? maxY : 0.0;
    const safeMinZ = Number.isFinite(minZ) ? minZ : -0.5;
    const safeMaxZ = Number.isFinite(maxZ) ? maxZ : 0.5;

    return {
        minX: Math.min(safeMinX, safeMaxX),
        maxX: Math.max(safeMinX, safeMaxX),
        minY: Math.min(safeMinY, safeMaxY),
        maxY: Math.max(safeMinY, safeMaxY),
        minZ: Math.min(safeMinZ, safeMaxZ),
        maxZ: Math.max(safeMinZ, safeMaxZ)
    };
}

/**
 * Constructs an AABB from center coordinates and half-extents.
 * 
 * @param {number} cx - Center X coordinate
 * @param {number} cy - Center Y coordinate
 * @param {number} halfWidth - Half-width along X axis (meters)
 * @param {number} halfHeight - Half-height along Y axis (meters)
 * @param {number} [cz=0] - Center Z coordinate (meters)
 * @param {number} [halfDepth=0.5] - Half-depth along Z axis (meters)
 * @returns {Object}
 */
function createAABBFromCenter(cx, cy, halfWidth, halfHeight, cz = 0, halfDepth = 0.5) {
    const safeCx = Number.isFinite(cx) ? cx : 0.0;
    const safeCy = Number.isFinite(cy) ? cy : 0.0;
    const safeCz = Number.isFinite(cz) ? cz : 0.0;
    const safeHW = Math.max(0, Number.isFinite(halfWidth) ? halfWidth : 0.0);
    const safeHH = Math.max(0, Number.isFinite(halfHeight) ? halfHeight : 0.0);
    const safeHD = Math.max(0, Number.isFinite(halfDepth) ? halfDepth : 0.5);

    return {
        minX: safeCx - safeHW,
        maxX: safeCx + safeHW,
        minY: safeCy - safeHH,
        maxY: safeCy + safeHH,
        minZ: safeCz - safeHD,
        maxZ: safeCz + safeHD
    };
}

/**
 * Evaluates whether two 2.5D AABBs intersect on the (X, Y) plane
 * while confirming depth alignment.
 * 
 * @param {Object} boxA - First bounding box
 * @param {Object} boxB - Second bounding box
 * @param {boolean} [inclusive=true] - If true, touching boundary edges count as overlapping
 * @returns {boolean} True if boxes intersect; false otherwise
 */
function check2DOverlap(boxA, boxB, inclusive = true) {
    if (!boxA || !boxB) return false;

    const aMinX = Math.min(boxA.minX, boxA.maxX);
    const aMaxX = Math.max(boxA.minX, boxA.maxX);
    const aMinY = Math.min(boxA.minY, boxA.maxY);
    const aMaxY = Math.max(boxA.minY, boxA.maxY);

    const bMinX = Math.min(boxB.minX, boxB.maxX);
    const bMaxX = Math.max(boxB.minX, boxB.maxX);
    const bMinY = Math.min(boxB.minY, boxB.maxY);
    const bMaxY = Math.max(boxB.minY, boxB.maxY);

    const overlapX = inclusive
        ? (aMinX <= bMaxX && aMaxX >= bMinX)
        : (aMinX < bMaxX && aMaxX > bMinX);

    const overlapY = inclusive
        ? (aMinY <= bMaxY && aMaxY >= bMinY)
        : (aMinY < bMaxY && aMaxY > bMinY);

    if (!overlapX || !overlapY) return false;

    // Optional Z depth alignment check if both specify Z bounds
    if (boxA.minZ !== undefined && boxA.maxZ !== undefined &&
        boxB.minZ !== undefined && boxB.maxZ !== undefined) {
        const aMinZ = Math.min(boxA.minZ, boxA.maxZ);
        const aMaxZ = Math.max(boxA.minZ, boxA.maxZ);
        const bMinZ = Math.min(boxB.minZ, boxB.maxZ);
        const bMaxZ = Math.max(boxB.minZ, boxB.maxZ);

        const overlapZ = inclusive
            ? (aMinZ <= bMaxZ && aMaxZ >= bMinZ)
            : (aMinZ < bMaxZ && aMaxZ > bMinZ);
        if (!overlapZ) return false;
    }

    return true;
}

/**
 * Computes the 2.5D bounding box for an active melee weapon swing.
 * 
 * @param {{ x: number, y: number, z?: number }} attackerPos - Attacker base coordinates
 * @param {number} [facing=1] - Facing direction (+1 for Right, -1 for Left)
 * @param {Object} [options={}] - Custom dimensions
 * @returns {Object} World-space active attack hitbox
 */
function computeSwingHitbox(attackerPos, facing = 1, options = {}) {
    const x = (attackerPos && Number.isFinite(attackerPos.x)) ? attackerPos.x : 0.0;
    const y = (attackerPos && Number.isFinite(attackerPos.y)) ? attackerPos.y : 0.0;

    const reach = Number.isFinite(options.reach) ? options.reach : HITBOX_CONSTANTS.DEFAULT_WEAPON_REACH;
    const height = Number.isFinite(options.height) ? options.height : HITBOX_CONSTANTS.DEFAULT_SWING_HEIGHT;
    const yOffset = Number.isFinite(options.yOffset) ? options.yOffset : HITBOX_CONSTANTS.DEFAULT_SWING_Y_OFFSET;
    const rearOffset = Number.isFinite(options.rearOffset) ? options.rearOffset : HITBOX_CONSTANTS.DEFAULT_SWING_REAR_OFFSET;
    const depthTol = Number.isFinite(options.depthTolerance) ? options.depthTolerance : HITBOX_CONSTANTS.PLANE_DEPTH_TOLERANCE;

    const minX = facing > 0 ? (x - rearOffset) : (x - reach);
    const maxX = facing > 0 ? (x + reach) : (x + rearOffset);
    const minY = y + yOffset - height * 0.5;
    const maxY = y + yOffset + height * 0.5;

    return createAABB(minX, minY, maxX, maxY, -depthTol, depthTol);
}

/**
 * Computes simple forward weapon reach hitbox matching prototype & engine loader signature.
 * 
 * @param {{ x: number, y: number }} attackerPos
 * @param {number} [facing=1]
 * @param {number} [reach=2.4]
 * @param {number} [height=1.8]
 * @returns {Object}
 */
function computeSwordHitbox(attackerPos, facing = 1, reach = 2.4, height = 1.8) {
    const x = (attackerPos && Number.isFinite(attackerPos.x)) ? attackerPos.x : 0.0;
    const y = (attackerPos && Number.isFinite(attackerPos.y)) ? attackerPos.y : 0.0;
    const r = Number.isFinite(reach) ? reach : 2.4;
    const h = Number.isFinite(height) ? height : 1.8;

    const minX = facing > 0 ? x : x - r;
    const maxX = facing > 0 ? x + r : x;
    const minY = y - 0.2;
    const maxY = y + h;
    return {
        minX: Math.min(minX, maxX),
        maxX: Math.max(minX, maxX),
        minY: Math.min(minY, maxY),
        maxY: Math.max(minY, maxY),
        minZ: 0.0,
        maxZ: 0.0
    };
}

/**
 * Computes the bounding volume for a piercing linear beam (e.g. Stygian Lance).
 * 
 * @param {{ x: number, y: number, z?: number }} origin - Beam launch origin (meters)
 * @param {number} [facing=1] - Facing direction (+1 for Right, -1 for Left)
 * @param {number} [length=16.0] - Beam reach distance along X (meters)
 * @param {number} [thickness=1.0] - Beam vertical thickness along Y (meters)
 * @param {number} [depthTolerance=0.5] - Depth bound on Z (meters)
 * @returns {Object} World-space piercing beam bounding box
 */
function createBeamAABB(origin, facing = 1, length = 16.0, thickness = 1.0, depthTolerance = 0.5) {
    const ox = (origin && Number.isFinite(origin.x)) ? origin.x : 0.0;
    const oy = (origin && Number.isFinite(origin.y)) ? origin.y : 0.0;
    const len = Number.isFinite(length) ? length : 16.0;
    const th = Number.isFinite(thickness) ? thickness : 1.0;
    const dTol = Number.isFinite(depthTolerance) ? depthTolerance : 0.5;

    const minX = facing > 0 ? ox : ox - len;
    const maxX = facing > 0 ? ox + len : ox;
    const minY = oy - th * 0.5;
    const maxY = oy + th * 0.5;

    return createAABB(minX, minY, maxX, maxY, -dTol, dTol);
}

/**
 * Raycast hit helper testing linear beam vs target AABB.
 * Matches engine loader and tier test expectations.
 * 
 * @param {{ x: number, y: number }} origin
 * @param {number} [facing=1]
 * @param {number} [length=16.0]
 * @param {Object} [targetBox={}]
 * @param {number} [thickness=1.0]
 * @returns {boolean}
 */
function checkRaycastHit(origin, facing = 1, length = 16.0, targetBox = {}, thickness = 1.0) {
    const ox = (origin && Number.isFinite(origin.x)) ? origin.x : 0.0;
    const oy = (origin && Number.isFinite(origin.y)) ? origin.y : 0.0;
    const len = Number.isFinite(length) ? length : 16.0;
    const th = Number.isFinite(thickness) ? thickness : 1.0;

    const rayMinX = facing > 0 ? ox : ox - len;
    const rayMaxX = facing > 0 ? ox + len : ox;
    const rayMinY = oy + 1.2 - th * 0.5;
    const rayMaxY = oy + 1.2 + th * 0.5;

    const rayBox = { minX: rayMinX, maxX: rayMaxX, minY: rayMinY, maxY: rayMaxY };
    return check2DOverlap(rayBox, targetBox);
}

/**
 * Calculates intersection between a directed ray segment and a 2.5D AABB using the Slab Method.
 * 
 * @param {{ x: number, y: number, z?: number }} rayOrigin - Ray start position
 * @param {{ x: number, y: number, z?: number }} rayDir - Ray direction vector
 * @param {number} maxDistance - Maximum ray travel distance (meters)
 * @param {Object} box - Target bounding box
 * @returns {{ hit: boolean, distance: number, point: { x: number, y: number, z: number } }}
 */
function checkRayAABBOverlap(rayOrigin, rayDir, maxDistance, box) {
    const ox = (rayOrigin && Number.isFinite(rayOrigin.x)) ? rayOrigin.x : 0.0;
    const oy = (rayOrigin && Number.isFinite(rayOrigin.y)) ? rayOrigin.y : 0.0;
    const dx = (rayDir && Number.isFinite(rayDir.x)) ? rayDir.x : 0.0;
    const dy = (rayDir && Number.isFinite(rayDir.y)) ? rayDir.y : 0.0;
    const maxDist = Math.max(0, Number.isFinite(maxDistance) ? maxDistance : 0.0);

    if (!box) {
        return { hit: false, distance: 0, point: { x: ox, y: oy, z: 0 } };
    }

    const bMinX = Math.min(box.minX, box.maxX);
    const bMaxX = Math.max(box.minX, box.maxX);
    const bMinY = Math.min(box.minY, box.maxY);
    const bMaxY = Math.max(box.minY, box.maxY);

    let tMinX = -Infinity;
    let tMaxX = Infinity;

    if (Math.abs(dx) > 1e-7) {
        const tx1 = (bMinX - ox) / dx;
        const tx2 = (bMaxX - ox) / dx;
        tMinX = Math.min(tx1, tx2);
        tMaxX = Math.max(tx1, tx2);
    } else {
        if (ox < bMinX || ox > bMaxX) {
            return { hit: false, distance: 0, point: { x: ox, y: oy, z: 0 } };
        }
    }

    let tMinY = -Infinity;
    let tMaxY = Infinity;

    if (Math.abs(dy) > 1e-7) {
        const ty1 = (bMinY - oy) / dy;
        const ty2 = (bMaxY - oy) / dy;
        tMinY = Math.min(ty1, ty2);
        tMaxY = Math.max(ty1, ty2);
    } else {
        if (oy < bMinY || oy > bMaxY) {
            return { hit: false, distance: 0, point: { x: ox, y: oy, z: 0 } };
        }
    }

    const tEnter = Math.max(tMinX, tMinY);
    const tExit = Math.min(tMaxX, tMaxY);

    const hit = (tEnter <= tExit) && (tExit >= 0) && (tEnter <= maxDist);
    if (!hit) {
        return { hit: false, distance: 0, point: { x: ox, y: oy, z: 0 } };
    }

    const hitDist = Math.max(0, tEnter);
    return {
        hit: true,
        distance: hitDist,
        point: {
            x: ox + dx * hitDist,
            y: oy + dy * hitDist,
            z: 0.0
        }
    };
}

/**
 * Calculates the directional knockback impulse vector applied to a struck target.
 * Guarantees horizontal directionality, upward pop ratio (0.3), strict Z=0 lock,
 * and coincident center resolution.
 * 
 * @param {{ x: number, y: number, z?: number }} attackerPos - Attacker position
 * @param {{ x: number, y: number, z?: number }} targetPos - Target position
 * @param {number} [force=6.0] - Knockback velocity scalar (m/s)
 * @param {number} [attackerFacing=1] - Fallback facing direction if positions coincide (+1 or -1)
 * @param {number} [resistance=0] - Target knockback dampening factor [0..1]
 * @returns {{ vx: number, vy: number, vz: number }} Instantaneous knockback velocity
 */
function calculateKnockback(attackerPos, targetPos, force = 6.0, attackerFacing = 1, resistance = 0) {
    const ax = (attackerPos && Number.isFinite(attackerPos.x)) ? attackerPos.x : 0.0;
    const tx = (targetPos && Number.isFinite(targetPos.x)) ? targetPos.x : 0.0;
    const f = Number.isFinite(force) ? Math.max(0, force) : HITBOX_CONSTANTS.DEFAULT_KNOCKBACK_FORCE;
    const res = Number.isFinite(resistance) ? Math.max(0, Math.min(1.0, resistance)) : 0.0;

    const dx = tx - ax;
    let dirX = 1;
    if (Math.abs(dx) > 1e-5) {
        dirX = dx > 0 ? 1 : -1;
    } else {
        // Coincident positions: fallback to attacker facing
        dirX = (attackerFacing === -1) ? -1 : 1;
    }

    const effectiveForce = f * (1.0 - res);
    return {
        vx: dirX * effectiveForce,
        vy: HITBOX_CONSTANTS.KNOCKBACK_VERTICAL_POP_RATIO * effectiveForce,
        vz: 0.0
    };
}

/**
 * Tracks entities hit during an attack swing to prevent duplicate damage registration.
 */
class HitTracker {
    constructor() {
        /** @type {Set<string | number>} */
        this._hits = new Set();
        /** @type {string | number | null} */
        this._activeSwingId = null;
    }

    /**
     * Checks if a target has already been hit during the current tracking cycle.
     * @param {string | number} targetId
     * @returns {boolean}
     */
    hasHit(targetId) {
        if (targetId === null || targetId === undefined) return false;
        return this._hits.has(targetId);
    }

    /**
     * Registers a target hit. Returns true if newly registered, false if already hit.
     * @param {string | number} targetId
     * @returns {boolean}
     */
    registerHit(targetId) {
        if (targetId === null || targetId === undefined) return false;
        if (this._hits.has(targetId)) return false;
        this._hits.add(targetId);
        return true;
    }

    /**
     * Clears all recorded hits. Call at the start of a new swing.
     */
    reset() {
        this._hits.clear();
        this._activeSwingId = null;
    }

    /**
     * Alias for reset() to support engine loader and test callers.
     */
    clear() {
        this.reset();
    }

    /**
     * Context-aware tracking: auto-resets if swingId changes.
     * @param {string | number} swingId
     * @param {string | number} targetId
     * @returns {boolean}
     */
    track(swingId, targetId) {
        if (this._activeSwingId !== swingId) {
            this._hits.clear();
            this._activeSwingId = swingId;
        }
        return this.registerHit(targetId);
    }

    /**
     * Returns total number of unique targets struck.
     * @returns {number}
     */
    get count() {
        return this._hits.size;
    }
}

// Module export bindings for CommonJS and ESM
const hitboxModule = {
    HITBOX_CONSTANTS,
    createAABB,
    createAABBFromCenter,
    check2DOverlap,
    computeSwingHitbox,
    computeSwordHitbox,
    createBeamAABB,
    checkRaycastHit,
    checkRayAABBOverlap,
    calculateKnockback,
    HitTracker
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = hitboxModule;
}
if (typeof window !== 'undefined') {
    window.VaelthornHitbox = hitboxModule;
}
