import { ProjectedPoint, Vec3 } from './types';

export interface CameraRig {
  pos: Vec3;
  target: Vec3;
  focalLength: number;
}

export interface CameraBasis {
  pos: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  focalPx: number;
  cx: number;
  cy: number;
}

const NEAR_PLANE = 0.8;

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function buildCameraBasis(cam: CameraRig, width: number, height: number): CameraBasis {
  const forward = normalize({
    x: cam.target.x - cam.pos.x,
    y: cam.target.y - cam.pos.y,
    z: cam.target.z - cam.pos.z,
  });
  const worldUp: Vec3 = { x: 0, y: 0, z: 1 };
  const right = normalize(cross(forward, worldUp));
  const up = cross(right, forward);

  const isPortrait = width < height;
  const baseFocal = isPortrait
    ? Math.min(width * 0.86, height * 0.5)
    : Math.min(height * 0.58, width * 0.44);
  const focalPx = cam.focalLength * baseFocal;

  return {
    pos: cam.pos,
    forward,
    right,
    up,
    focalPx,
    cx: width * 0.5,
    cy: isPortrait ? height * 0.45 : height * 0.48,
  };
}

interface CamSpacePoint {
  camX: number;
  camY: number;
  depth: number;
}

function toCamSpace(basis: CameraBasis, p: Vec3): CamSpacePoint {
  const dx = p.x - basis.pos.x;
  const dy = p.y - basis.pos.y;
  const dz = p.z - basis.pos.z;
  return {
    camX: dx * basis.right.x + dy * basis.right.y + dz * basis.right.z,
    camY: dx * basis.up.x + dy * basis.up.y + dz * basis.up.z,
    depth: dx * basis.forward.x + dy * basis.forward.y + dz * basis.forward.z,
  };
}

function projectCamSpace(basis: CameraBasis, c: CamSpacePoint): { x: number; y: number } {
  const scale = basis.focalPx / c.depth;
  return {
    x: basis.cx + c.camX * scale,
    y: basis.cy - c.camY * scale,
  };
}

export function projectPoint(basis: CameraBasis, p: Vec3): ProjectedPoint {
  const c = toCamSpace(basis, p);
  if (c.depth < NEAR_PLANE) {
    return { x: 0, y: 0, scale: 0, depth: c.depth, visible: false };
  }
  const scale = basis.focalPx / c.depth;
  return {
    x: basis.cx + c.camX * scale,
    y: basis.cy - c.camY * scale,
    scale,
    depth: c.depth,
    visible: true,
  };
}

function clipPolygonToNearPlane(pts: CamSpacePoint[]): CamSpacePoint[] {
  if (pts.length === 0) return [];
  const out: CamSpacePoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const prev = pts[(i + pts.length - 1) % pts.length];
    const curIn = cur.depth >= NEAR_PLANE;
    const prevIn = prev.depth >= NEAR_PLANE;

    if (curIn !== prevIn) {
      const t = (NEAR_PLANE - prev.depth) / (cur.depth - prev.depth || 1e-6);
      out.push({
        camX: prev.camX + (cur.camX - prev.camX) * t,
        camY: prev.camY + (cur.camY - prev.camY) * t,
        depth: NEAR_PLANE,
      });
    }
    if (curIn) {
      out.push(cur);
    }
  }
  return out;
}

export function drawWorldPolygon(
  ctx: CanvasRenderingContext2D,
  basis: CameraBasis,
  points: Vec3[],
  fillStyle?: string,
  strokeStyle?: string,
  lineWidthPx = 2
): void {
  const clipped = clipPolygonToNearPlane(points.map((pt) => toCamSpace(basis, pt)));
  if (clipped.length < 3) return;

  const projected = clipped.map((c) => projectCamSpace(basis, c));

  ctx.beginPath();
  ctx.moveTo(projected[0].x, projected[0].y);
  for (let i = 1; i < projected.length; i++) {
    ctx.lineTo(projected[i].x, projected[i].y);
  }
  ctx.closePath();

  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidthPx;
    ctx.stroke();
  }
}

export function drawWorldPolyline(
  ctx: CanvasRenderingContext2D,
  basis: CameraBasis,
  points: Vec3[],
  strokeStyle: string,
  lineWidthPx = 2
): void {
  if (points.length < 2) return;
  const camPts = points.map((pt) => toCamSpace(basis, pt));

  ctx.beginPath();
  for (let i = 0; i < camPts.length - 1; i++) {
    const a = camPts[i];
    const b = camPts[i + 1];
    const aIn = a.depth >= NEAR_PLANE;
    const bIn = b.depth >= NEAR_PLANE;
    if (!aIn && !bIn) continue;

    let p0 = a;
    let p1 = b;
    if (!aIn && bIn) {
      const t = (NEAR_PLANE - a.depth) / (b.depth - a.depth || 1e-6);
      p0 = {
        camX: a.camX + (b.camX - a.camX) * t,
        camY: a.camY + (b.camY - a.camY) * t,
        depth: NEAR_PLANE,
      };
    } else if (aIn && !bIn) {
      const t = (NEAR_PLANE - a.depth) / (b.depth - a.depth || 1e-6);
      p1 = {
        camX: a.camX + (b.camX - a.camX) * t,
        camY: a.camY + (b.camY - a.camY) * t,
        depth: NEAR_PLANE,
      };
    }

    const s0 = projectCamSpace(basis, p0);
    const s1 = projectCamSpace(basis, p1);
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
  }

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidthPx;
  ctx.stroke();
}
