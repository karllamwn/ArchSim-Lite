// view/viewport.js — the 3D world: site, context, massing and shadows.
//
// Subscribes to the state and redraws the volumes whenever anything changes.
// The sun is a directional light positioned from view/sun.js, so what you see
// on screen and what the shadow tool measures come from the same maths.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { state, subscribe, volumeHeight } from '../core/state.js';
import { SITE, PARK, CONTEXT, buildableBounds } from '../core/site.js';
import { sunVector, sunPosition } from './sun.js';
import { volumeToSlabs } from '../core/form.js';

// ── Colours, in one place so the palette is easy to change ───────────────────
// Matched to the ArchSim V2 dark theme in css/style.css.

// Each surface has to be told apart at a glance from across a lecture room, so
// the values step clearly rather than sitting in one dark band: ground darkest,
// then context, then the parcel, with the park the only green and the design the
// only bright thing on the board.
// Sampled from the V2 workspace screenshot rather than invented. The important
// finding: the model view there is NEUTRAL. Teal belongs to the interface
// chrome; inside the viewport the ground is a dark warm grey, the context is
// cool blue-grey line work, and the building itself is near-white. Keeping the
// scene neutral is what lets the one accent colour mean "selected".
const COLOR = {
  sky:         0x1d1c21, // 44% of the pixels in V2's viewport are this
  ground:      0x1d1c21, // ground and background read as one surface there
  site:        0x2b2b33, // the parcel, a step up from the ground
  park:        0x405543, // muted planting green: identifiable, not cartoon
  context:     0x2e333c, // the existing blocks: filled, but well below the design
  contextEdge: 0x454f60, // their corners, a step up so the massing stays readable
  volume:      0xd8d8d8, // the massing, measured off V2's tower
  selected:    0x45d1b3, // --accent, the one saturated thing in the scene
  volumeEdge:  0x6d7078,
  volumeSelected: 0xf2f2f2, // a shade brighter, not a different hue
  boundary:    0xe8483c, // the property line: the one red in the scene
  setback:     0x8a5a52, // the buildable edge inside it, deliberately quieter
  setbackLabel: 0xb08076 // the same line's name, lifted enough to read
};

// Half the height of the visible world, in metres. Big enough to hold the site,
// the park to the north and the surrounding blocks in one frame.
const VIEW_EXTENT = 78;

// Module-level handles, set up once in initViewport().
let scene, camera, renderer, controls, sunLight;
let volumeGroup;   // every design volume lives in here, cleared and rebuilt
let host;          // the div the canvas lives in, used for sizing

// When a frame in the filmstrip is being reviewed, the viewport draws this
// instead of the live design. Editing anything clears it: you should always be
// looking at the thing you are changing.
let reviewing = null;   // { round, volumes, sun } or null

/**
 * Create the scene and start rendering.
 * @param {HTMLElement} container the div the canvas goes into
 */
export function initViewport(container) {
  host = container;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR.sky);

  // Camera: a high view from the south-east, pulled back far enough to hold the
  // site, the park and the surrounding blocks in one frame. It is aimed between
  // the site and the park rather than at the site alone, because the thing worth
  // looking at is the shadow running from one into the other.
  // Orthographic, not perspective. The V2 workspace draws the site as an
  // axonometric: parallel lines stay parallel, so two towers the same height
  // read the same height wherever they sit on the plot. For judging a massing
  // against a boundary that matters more than depth cues do.
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  camera.position.set(150, 135, 165);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, -12);   // between the site centre and the park
  controls.maxPolarAngle = Math.PI / 2 - 0.05;   // stop the camera going underground
  controls.enableDamping = true;

  buildLights();
  buildGround();
  buildContext();

  volumeGroup = new THREE.Group();
  scene.add(volumeGroup);

  // Redraw whenever the design changes. A live edit also ends any review, so
  // the view can never show one design while the sliders describe another.
  subscribe(s => {
    if (reviewing) endReview();
    rebuild(s);
  });

  initFilmstrip();

  renderer.setAnimationLoop(() => {
    matchCanvasToContainer();
    controls.update();
    renderer.render(scene, camera);
  });
}

/**
 * Keep the drawing buffer the same size as the div on screen.
 *
 * Checking this once per frame is the standard Three.js approach and it is
 * more dependable than a resize event: the canvas is correct no matter how the
 * layout got its size (window resize, panel toggle, first paint). The check is
 * two number comparisons, so the cost is nothing.
 */
function matchCanvasToContainer() {
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (width === 0 || height === 0) return;   // hidden, nothing to do

  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  const wantWidth = Math.floor(width * pixelRatio);
  const wantHeight = Math.floor(height * pixelRatio);

  const canvas = renderer.domElement;
  if (canvas.width === wantWidth && canvas.height === wantHeight) return;

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);   // false: CSS controls the display size

  // An orthographic camera has no aspect property: its frustum is set in world
  // metres, so the visible extent has to be rebuilt from the pane's shape.
  const aspect = width / height;
  camera.left   = -VIEW_EXTENT * aspect;
  camera.right  =  VIEW_EXTENT * aspect;
  camera.top    =  VIEW_EXTENT;
  camera.bottom = -VIEW_EXTENT;
  camera.updateProjectionMatrix();
}

// ── Fixed parts of the scene, built once ─────────────────────────────────────

function buildLights() {
  // Soft fill so faces away from the sun are not solid black. Tinted to the
  // dark teal theme rather than neutral white.
    // Lambert shading multiplies the material colour by the light, so a dim
  // ambient makes every surface render darker than the value written above.
  // This is set so an unlit face lands close to its stated colour, which is the
  // only way the sampled palette means anything.
  scene.add(new THREE.HemisphereLight(0xdfe4ec, 0x2a2933, 2.6));

  // The sun. Position is set from the date/time in updateSun() below.
  sunLight = new THREE.DirectionalLight(0xfff8f0, 1.6);
  sunLight.castShadow = true;

  // The shadow camera is an orthographic box: it has to cover everything that
  // might cast or receive a shadow, here the site plus the park to the north.
  const s = sunLight.shadow;
  s.mapSize.set(2048, 2048);
  s.camera.left = -90;
  s.camera.right = 90;
  s.camera.top = 90;
  s.camera.bottom = -90;
  s.camera.near = 1;
  s.camera.far = 400;
  s.bias = -0.0005;

  scene.add(sunLight);
  scene.add(sunLight.target);
}

function buildGround() {
  // A large ground plane so shadows have something to land on beyond the site.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshLambertMaterial({ color: COLOR.ground })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  // No grid. V2's viewport has none, and on a dark ground it competes with the
  // shadow, which is the one thing on screen worth reading closely.
}

function buildContext() {
  // The buildable parcel.
  scene.add(flatRect(SITE.width, SITE.depth, 0, 0, COLOR.site, 0.02));

  // The property line, dashed and red. The only red in the scene, because it is
  // the one edge the design is not allowed to cross.
  const half = { w: SITE.width / 2, d: SITE.depth / 2 };
  scene.add(dashedLoop([
    [-half.w, -half.d], [half.w, -half.d], [half.w, half.d], [-half.w, half.d]
  ], COLOR.boundary, 0.08, 2.2, 1.6));

  // The setback line inside it: where a building may actually stand. Dimmer,
  // finer dashes, so the hierarchy reads at a glance — hard edge, soft edge.
  // This is the line the architect agent is measuring against when it says a
  // volume is short on the south, so it is worth being able to see.
  const b = buildableBounds();
  scene.add(dashedLoop([
    [b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]
  ], COLOR.setback, 0.07, 1.1, 1.1));

  // Name both lines. An unlabelled dashed rectangle is just a dashed rectangle,
  // and these two are the thing the architect agent measures against.
  scene.add(placeLabel('Site Boundary', COLOR.boundary, half.w - 9, half.d + 4.5));
  // North-west corner: the default massing sits in the southern half, so this
  // is the part of the parcel least likely to be built over.
  scene.add(placeLabel('Setback line', COLOR.setbackLabel, b.minX + 10, b.minZ + 3));

  // The park to the north — the thing the shadow argument is about. It carries
  // a little emissive green so it stays identifiable even when it is entirely
  // in shadow, which is exactly the moment you most need to see where it is.
  scene.add(flatRect(PARK.width, PARK.depth, PARK.x, PARK.z, COLOR.park, 0.03, 0x18261a));

  // The surrounding city: solid, but dark. Sampling V2's viewport, the context
  // blues cover about an eighth of the frame, which only happens if the blocks
  // have faces — they are not wireframes. Filled and quiet, with a lighter edge
  // so the corners stay legible against each other.
  for (const building of CONTEXT) {
    const box = new THREE.BoxGeometry(building.width, building.height, building.depth);

    const mesh = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: COLOR.context }));
    mesh.position.set(building.x, building.height / 2, building.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: COLOR.contextEdge })
    );
    edges.position.copy(mesh.position);
    scene.add(edges);
  }
}

/**
 * A short text label standing on the ground plane.
 *
 * Drawn to a canvas and used as a sprite, so there is no font file to load and
 * no dependency beyond Three.js itself. Sprites always face the camera, which
 * is what you want for a plan annotation: it stays readable however the view
 * is orbited.
 */
function placeLabel(text, color, x, z, worldHeight = 3.4) {
  const fontSize = 48;
  const pad = 10;
  const canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');

  ctx.font = `${fontSize}px "Courier New", monospace`;
  canvas.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  canvas.height = fontSize + pad * 2;

  // Resizing the canvas resets the context, so the font has to be set again.
  ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px "Courier New", monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.fillText(text, pad, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false      // an annotation should not be hidden by a building
  }));
  sprite.position.set(x, 1.2, z);
  sprite.scale.set(worldHeight * (canvas.width / canvas.height), worldHeight, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * A closed dashed loop lying flat on the ground.
 *
 * Dashes in Three.js are computed from distance along the line, so
 * computeLineDistances() has to run or the material draws a solid line. The
 * loop is closed by repeating the first point rather than using LineLoop,
 * which does not carry the distances round the closing segment.
 */
function dashedLoop(points, color, y, dashSize, gapSize) {
  const closed = [...points, points[0]];
  const geometry = new THREE.BufferGeometry().setFromPoints(
    closed.map(([x, z]) => new THREE.Vector3(x, y, z))
  );
  const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({
    color, dashSize, gapSize
  }));
  line.computeLineDistances();
  return line;
}

/** A thin coloured rectangle lying on the ground. Used for site and park. */
function flatRect(width, depth, x, z, color, y, emissive = 0x000000) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshLambertMaterial({ color, emissive })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

// ── The changing part: volumes and the sun ───────────────────────────────────

/** Called on every state change. Rebuilds the massing and moves the sun. */
function rebuild(s) {
  const shown = reviewing ?? s;
  updateSun(shown);
  updateVolumes(shown);
}

function updateSun(s) {
  const { month, day, hour } = s.sun;
  const v = sunVector(month, day, hour, SITE.latitude);
  const { isUp } = sunPosition(month, day, hour, SITE.latitude);

  // Put the light far away along the sun direction so its rays arrive parallel.
  const distance = 200;
  sunLight.position.set(v.x * distance, Math.max(v.y, 0.01) * distance, v.z * distance);
  sunLight.target.position.set(0, 0, 0);
  sunLight.target.updateMatrixWorld();

  // Below the horizon: no direct light, no shadows.
  sunLight.intensity = isUp ? 1.6 : 0;
}

function updateVolumes(s) {
  // Simplest correct approach: throw the old meshes away and rebuild. The
  // scene is tiny, so this costs nothing and keeps the code easy to follow.
  volumeGroup.clear();

  for (const volume of s.volumes) {
    const isSelected = !reviewing && volume.id === s.selectedId;
    // The massing stays near-white whether or not it is selected, the way the
    // V2 tower does. Selection is shown on the outline instead: recolouring the
    // whole solid meant the white building was almost never on screen.
    const material = new THREE.MeshLambertMaterial({
      color: isSelected ? COLOR.volumeSelected : COLOR.volume
    });
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: isSelected ? COLOR.selected : COLOR.volumeEdge,
      linewidth: 1
    });

    // One mesh per band. core/form.js decides what the bands are, so a podium,
    // a taper and a stepped tower all arrive here as the same kind of list —
    // and it is the same list the shadow tool casts rays at.
    for (const slab of volumeToSlabs(volume)) {
      const geometry = slabGeometry(slab);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(slab.x, slab.y0, slab.z);
      mesh.rotation.y = -slab.rotation * Math.PI / 180;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      volumeGroup.add(mesh);

      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
      edges.position.copy(mesh.position);
      edges.rotation.copy(mesh.rotation);
      volumeGroup.add(edges);

      // A line at every floor level. Without them a massing is an abstract
      // block; with them you can count the storeys the agents are arguing
      // about, which is most of what makes it read as a building.
      for (const floorLine of floorPlates(slab, volume.floorHeight, edgeMaterial)) {
        floorLine.position.set(slab.x, slab.y0 + floorLine.userData.y, slab.z);
        floorLine.rotation.y = -slab.rotation * Math.PI / 180;
        volumeGroup.add(floorLine);
      }
    }
  }
}

/**
 * One horizontal outline per floor within a slab, so the storeys are countable.
 * Reuses the same plan outline the solid is extruded from, which is why an
 * ellipse or a courtyard gets correct floor lines for free.
 */
function floorPlates(slab, floorHeight, material) {
  const lines = [];
  const height = slab.y1 - slab.y0;

  for (let y = floorHeight; y < height - 0.01; y += floorHeight) {
    for (const outline of planOutlines(slab)) {
      const geometry = new THREE.BufferGeometry().setFromPoints(
        outline.map(p => new THREE.Vector3(p.x, 0, p.y))
      );
      const loop = new THREE.LineLoop(geometry, material);
      loop.userData.y = y;
      lines.push(loop);
    }
  }
  return lines;
}

/** The plan outline(s) of a slab as point lists: the edge, plus any void. */
function planOutlines(slab) {
  const shape = planShape(slab);
  const outlines = [shape.getPoints(slab.plan === 'ellipse' ? 48 : 12)];
  for (const hole of shape.holes) outlines.push(hole.getPoints(12));
  return outlines;
}

/**
 * Build one band as geometry, sitting on y = 0 so it can be positioned by its
 * base. Every plan shape goes through THREE.Shape, so adding a plan means
 * describing its outline once and nothing else changes.
 */
function slabGeometry(slab) {
  const height = slab.y1 - slab.y0;
  const geometry = new THREE.ExtrudeGeometry(planShape(slab), {
    depth: height, bevelEnabled: false
  });
  // Shapes are drawn in XY and extruded along +Z; stand it up so the extrusion
  // runs vertically and the plan lies flat.
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** The plan of a slab as a THREE.Shape. One place plan shape becomes geometry. */
function planShape(slab) {
  const hw = slab.w / 2;
  const hd = slab.d / 2;

  const shape = new THREE.Shape();

  if (slab.plan === 'ellipse') {
    shape.absellipse(0, 0, hw, hd, 0, Math.PI * 2, false, 0);

  } else if (slab.plan === 'lshape') {
    // A rectangle with one corner quadrant removed.
    const cutW = slab.w * slab.planRatio;
    const cutD = slab.d * slab.planRatio;
    shape.moveTo(-hw, -hd);
    shape.lineTo(hw, -hd);
    shape.lineTo(hw, hd - cutD);
    shape.lineTo(hw - cutW, hd - cutD);
    shape.lineTo(hw - cutW, hd);
    shape.lineTo(-hw, hd);
    shape.closePath();

  } else {
    shape.moveTo(-hw, -hd);
    shape.lineTo(hw, -hd);
    shape.lineTo(hw, hd);
    shape.lineTo(-hw, hd);
    shape.closePath();

    if (slab.plan === 'courtyard') {
      const iw = hw * slab.planRatio;
      const id = hd * slab.planRatio;
      const hole = new THREE.Path();
      hole.moveTo(-iw, -id);
      hole.lineTo(-iw, id);
      hole.lineTo(iw, id);
      hole.lineTo(iw, -id);
      hole.closePath();
      shape.holes.push(hole);
    }
  }

  return shape;
}


// ── Round thumbnails ─────────────────────────────────────────────────────────

/**
 * Grab the current view as a small image and add it to the filmstrip.
 * Called after each round, so the strip becomes a visual history of the design.
 */
export function captureFrame(round) {
  if (!renderer) return;

  // Draw once more right now: the animation loop may have cleared the buffer.
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/webp', 0.6);

  const strip = document.getElementById('filmstrip');
  if (!strip) return;
  strip.querySelector('.filmstrip-empty')?.remove();

  // Only the newest is "LATEST"; the ones behind it take their round number,
  // which is how the V2 strip reads.
  for (const frame of strip.querySelectorAll('.frame-latest')) {
    frame.classList.remove('frame-latest');
    const label = frame.querySelector('.frame-label');
    if (label) label.textContent = label.dataset.round;
  }

  const frame = document.createElement('div');
  frame.className = 'frame frame-latest';
  frame.title = `Round ${round} — click to look at it again`;

  // The design exactly as it stood when this frame was taken. Deep-copied, so
  // later edits cannot reach back and change history.
  const snapshot = {
    round,
    volumes: state.volumes.map(v => ({ ...v })),
    sun: { ...state.sun }
  };
  frame.onclick = () => beginReview(snapshot, frame);

  const img = document.createElement('img');
  img.src = url;
  img.alt = `Round ${round}`;
  frame.appendChild(img);

  const label = document.createElement('div');
  label.className = 'frame-label';
  label.dataset.round = `R${String(round).padStart(3, '0')}`;
  label.textContent = 'LATEST';
  frame.appendChild(label);

  strip.prepend(frame);
}

/** Show a past round in the viewport. Nothing is written back to the design. */
function beginReview(snapshot, frame) {
  const strip = document.getElementById('filmstrip');

  // Clicking the frame you are already reviewing takes you back to the present.
  if (reviewing && reviewing.round === snapshot.round) {
    endReview();
    rebuild(state);
    return;
  }

  reviewing = snapshot;
  for (const f of strip.querySelectorAll('.frame')) f.classList.remove('frame-reviewing');
  frame.classList.add('frame-reviewing');
  setStageLabel(`ROUND ${snapshot.round} · REVIEW`, true);
  rebuild(state);
}

/** Back to the live design. */
function endReview() {
  reviewing = null;
  const strip = document.getElementById('filmstrip');
  for (const f of strip?.querySelectorAll('.frame') ?? []) f.classList.remove('frame-reviewing');
  setStageLabel('SITE VIEW', false);
}

function setStageLabel(text, isReview) {
  const el = document.getElementById('stageView');
  if (el) el.textContent = text;
  el?.closest('.stage-label')?.classList.toggle('reviewing', isReview);
}

/** The strip before any round has run. Without this it is a blank bar. */
export function initFilmstrip() {
  const strip = document.getElementById('filmstrip');
  if (!strip || strip.children.length) return;
  const note = document.createElement('div');
  note.className = 'filmstrip-empty';
  note.textContent = 'Rounds appear here as they finish. Click one to look at it again.';
  strip.appendChild(note);
}
