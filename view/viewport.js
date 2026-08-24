// view/viewport.js — the 3D world: site, context, massing and shadows.
//
// Subscribes to the state and redraws the volumes whenever anything changes.
// The sun is a directional light positioned from view/sun.js, so what you see
// on screen and what the shadow tool measures come from the same maths.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { state, subscribe, volumeHeight } from '../core/state.js';
import { SITE, PARK, CONTEXT } from '../core/site.js';
import { sunVector, sunPosition } from './sun.js';
import { volumeToSlabs } from '../core/form.js';

// ── Colours, in one place so the palette is easy to change ───────────────────
// Matched to the ArchSim V2 dark theme in css/style.css.

// Each surface has to be told apart at a glance from across a lecture room, so
// the values step clearly rather than sitting in one dark band: ground darkest,
// then context, then the parcel, with the park the only green and the design the
// only bright thing on the board.
const COLOR = {
  sky:         0x0d1716, // --bg
  ground:      0x161f1e,
  site:        0x2a4540, // the buildable parcel, lifted off the ground plane
  park:        0x4f9b66, // the one green: this is what the argument protects
  neighbour:   0x36504c, // existing context, present but quiet
  contextEdge: 0x4c6a65,
  volume:      0xe4efeb, // the design reads pale against everything else
  selected:    0x45d1b3, // --accent
  grid:        0x2b4a45,
  gridSub:     0x1e332f,
  north:       0xff7f50  // --accent2
};

// Module-level handles, set up once in initViewport().
let scene, camera, renderer, controls, sunLight;
let volumeGroup;   // every design volume lives in here, cleared and rebuilt
let host;          // the div the canvas lives in, used for sizing

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
  camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
  camera.position.set(115, 130, 150);

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
  buildNorthArrow();

  volumeGroup = new THREE.Group();
  scene.add(volumeGroup);

  // Redraw whenever the design changes.
  subscribe(rebuild);

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
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

// ── Fixed parts of the scene, built once ─────────────────────────────────────

function buildLights() {
  // Soft fill so faces away from the sun are not solid black. Tinted to the
  // dark teal theme rather than neutral white.
  scene.add(new THREE.HemisphereLight(0xbfe6dc, 0x0d1716, 1.0));

  // The sun. Position is set from the date/time in updateSun() below.
  sunLight = new THREE.DirectionalLight(0xfff3e0, 2.2);
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

  // One-metre grid, sized to reach past the surrounding blocks so the ground
  // does not fall away into a void behind them.
  const grid = new THREE.GridHelper(180, 180, COLOR.grid, COLOR.gridSub);
  grid.position.y = 0.01;
  scene.add(grid);
}

function buildContext() {
  // The buildable parcel.
  scene.add(flatRect(SITE.width, SITE.depth, 0, 0, COLOR.site, 0.02));

  // The park to the north — the thing the shadow argument is about. It carries
  // a little emissive green so it stays identifiable even when it is entirely
  // in shadow, which is exactly the moment you most need to see where it is.
  scene.add(flatRect(PARK.width, PARK.depth, PARK.x, PARK.z, COLOR.park, 0.03, 0x14301f));

  // The surrounding city, drawn as line work rather than solid blocks so the
  // design being argued about is the only thing with mass on screen. They still
  // cast shadows: an invisible box in the shadow map is still a box.
  for (const building of CONTEXT) {
    const box = new THREE.BoxGeometry(building.width, building.height, building.depth);

    const shell = new THREE.Mesh(box, new THREE.MeshLambertMaterial({
      color: COLOR.neighbour, transparent: true, opacity: 0.35
    }));
    shell.position.set(building.x, building.height / 2, building.z);
    shell.castShadow = true;
    shell.receiveShadow = true;
    scene.add(shell);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: COLOR.contextEdge })
    );
    edges.position.copy(shell.position);
    scene.add(edges);
  }
}

function buildNorthArrow() {
  const arrow = new THREE.Group();

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 8, 12),
    new THREE.MeshBasicMaterial({ color: COLOR.north })
  );
  shaft.rotation.x = Math.PI / 2;   // lie it flat, pointing along Z
  arrow.add(shaft);

  const head = new THREE.Mesh(
    new THREE.ConeGeometry(1.4, 3.5, 16),
    new THREE.MeshBasicMaterial({ color: COLOR.north })
  );
  head.rotation.x = -Math.PI / 2;   // point toward -Z, which is north
  head.position.z = -5.5;
  arrow.add(head);

  arrow.position.set(-42, 0.2, -20);
  scene.add(arrow);
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
  updateSun(s);
  updateVolumes(s);
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
  sunLight.intensity = isUp ? 2.2 : 0;
}

function updateVolumes(s) {
  // Simplest correct approach: throw the old meshes away and rebuild. The
  // scene is tiny, so this costs nothing and keeps the code easy to follow.
  volumeGroup.clear();

  for (const volume of s.volumes) {
    const isSelected = volume.id === s.selectedId;
    const material = new THREE.MeshLambertMaterial({
      color: isSelected ? COLOR.selected : COLOR.volume
    });
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: isSelected ? 0x0d1716 : 0x6f8a84
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
    }
  }
}

/**
 * Build one band as geometry, sitting on y = 0 so it can be positioned by its
 * base. Every plan shape goes through THREE.Shape, so adding a plan means
 * describing its outline once and nothing else changes.
 */
function slabGeometry(slab) {
  const height = slab.y1 - slab.y0;
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

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  // Shapes are drawn in XY and extruded along +Z; stand it up so the extrusion
  // runs vertically and the plan lies flat.
  geometry.rotateX(-Math.PI / 2);
  return geometry;
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
  for (const frame of strip.querySelectorAll('.frame-latest')) {
    frame.classList.remove('frame-latest');
  }

  const frame = document.createElement('div');
  frame.className = 'frame frame-latest';
  const img = document.createElement('img');
  img.src = url;
  img.alt = `Round ${round}`;
  frame.appendChild(img);
  const label = document.createElement('div');
  label.className = 'frame-label';
  label.textContent = `R${String(round).padStart(3, '0')}`;
  frame.appendChild(label);

  strip.prepend(frame);
}
