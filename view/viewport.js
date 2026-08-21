// view/viewport.js — the 3D world: site, context, massing and shadows.
//
// Subscribes to the state and redraws the volumes whenever anything changes.
// The sun is a directional light positioned from view/sun.js, so what you see
// on screen and what the shadow tool measures come from the same maths.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { state, subscribe, volumeHeight } from '../core/state.js';
import { SITE, PARK, NEIGHBOUR } from '../core/site.js';
import { sunVector, sunPosition } from './sun.js';

// ── Colours, in one place so the palette is easy to change ───────────────────

const COLOR = {
  sky:       0xdfe6ec,
  ground:    0xcfd6d3,
  site:      0xe8e2d6,
  park:      0x9fc08a,
  neighbour: 0x9aa3a8,
  volume:    0xf2f4f6,
  selected:  0x4a90d9,
  north:     0xd94a3d
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

  // Camera: a high view from the south-east. It is aimed between the site and
  // the park rather than at the site alone, because the thing worth looking at
  // is the shadow running from one into the other.
  camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
  camera.position.set(85, 95, 105);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, -14);   // between the site centre and the park
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
  // Soft fill so faces away from the sun are not solid black.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d9199, 1.1));

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

  // One-metre grid over the site area, so students can read dimensions.
  const grid = new THREE.GridHelper(120, 120, 0xaab3ae, 0xc2c9c5);
  grid.position.y = 0.01;
  scene.add(grid);
}

function buildContext() {
  // The buildable parcel.
  scene.add(flatRect(SITE.width, SITE.depth, 0, 0, COLOR.site, 0.02));

  // The park to the north — the thing the shadow argument is about.
  scene.add(flatRect(PARK.width, PARK.depth, PARK.x, PARK.z, COLOR.park, 0.03));

  // The existing neighbour block to the east. It casts a real shadow too.
  const neighbour = new THREE.Mesh(
    new THREE.BoxGeometry(NEIGHBOUR.width, NEIGHBOUR.height, NEIGHBOUR.depth),
    new THREE.MeshLambertMaterial({ color: COLOR.neighbour })
  );
  neighbour.position.set(NEIGHBOUR.x, NEIGHBOUR.height / 2, NEIGHBOUR.z);
  neighbour.castShadow = true;
  neighbour.receiveShadow = true;
  scene.add(neighbour);
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
function flatRect(width, depth, x, z, color, y) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshLambertMaterial({ color })
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
    const height = volumeHeight(volume);
    const isSelected = volume.id === s.selectedId;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(volume.w, height, volume.d),
      new THREE.MeshLambertMaterial({
        color: isSelected ? COLOR.selected : COLOR.volume
      })
    );
    mesh.position.set(volume.x, height / 2, volume.z);
    mesh.rotation.y = -volume.rotation * Math.PI / 180;   // clockwise in plan
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    volumeGroup.add(mesh);

    // A thin outline makes the edges readable against the pale ground.
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x4a5257 })
    );
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    volumeGroup.add(edges);
  }
}
