// SEED
let SEED = "26539245";


// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("game") });
renderer.setSize(window.innerWidth, window.innerHeight);

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 20, 10);
scene.add(light);

// Lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(50, 100, 50);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
scene.add(sun);

// Day/night cycle variables
let timeOfDay = 0; // 0 = midnight, 12 = noon, 24 = midnight

// Camera position
camera.position.set(0, 50, 20);
camera.lookAt(0, 0, 0);

// Controls: WASD + pointer lock mouse look
const keys = {};
document.addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = true));
document.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

function getVoxelCoordsFromHit(hit, inward = true) {
  // Step inside or outside the face
  const offset = inward ? -0.5 : 0.5;
  const p = hit.point.clone().add(hit.face.normal.clone().multiplyScalar(offset));

  // Snap to voxel grid
  const wx = Math.floor(p.x + 0.5);
  const wy = Math.floor(p.y + 0.5);
  const wz = Math.floor(p.z + 0.5);

  const { cx, cy, cz } = worldToChunkCoords(wx, wy, wz);
  const { lx, ly, lz } = worldToLocalBlock(wx, wy, wz, cx, cy, cz);

  return { cx, cy, cz, lx, ly, lz, wx, wy, wz };
}

const MAX_RANGE = 6; // block reach distance

document.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return; // left click
  if (inventoryOpen || !controlsEnabled) return;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
  const hits = raycaster.intersectObjects(Object.values(chunks), true);
  if (hits.length === 0) return;

  const hit = hits[0];
  const distance = camera.position.distanceTo(hit.point);
  if (distance > MAX_RANGE) return; // out of range
  document.getElementById("breaksound").pause();
  document.getElementById("breaksound").currentTime = 0;
  document.getElementById("breaksound").play();

  const { cx, cy, cz, lx, ly, lz } = getVoxelCoordsFromHit(hit, true);
  if (lx<0||lx>=CHUNK_SIZE||lz<0||lz>=CHUNK_SIZE||ly<0||ly>=CHUNK_HEIGHT) return;

  const key = keyOf(cx, cy, cz);
  const data = ensureChunkData(cx, cy, cz);
  if (data[lx][lz][ly] !== 0) {
    data[lx][lz][ly] = 0;
    rebuildChunk(cx, cy, cz);
  }
});

document.addEventListener("mousedown", (e) => {
  if (e.button !== 2) return; // right click
  if (inventoryOpen || !controlsEnabled) return;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
  const hits = raycaster.intersectObjects(Object.values(chunks), true);
  if (hits.length === 0) return;

  const hit = hits[0];
  const distance = camera.position.distanceTo(hit.point);
  if (distance > MAX_RANGE) return;
  document.getElementById("placesound").pause();
  document.getElementById("placesound").currentTime = 0.1;
  document.getElementById("placesound").play();

  const { cx, cy, cz, lx, ly, lz } = getVoxelCoordsFromHit(hit, false);
  if (lx<0||lx>=CHUNK_SIZE||lz<0||lz>=CHUNK_SIZE||ly<0||ly>=CHUNK_HEIGHT) return;

  const data = ensureChunkData(cx, cy, cz);
  if (data[lx][lz][ly] === 0) {
    const blockId = inventory[selectedIndex];
    data[lx][lz][ly] = blockId;
    rebuildChunk(cx, cy, cz);
  }
});

// Prevent context menu on right-click
document.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.code === "Space" && isGrounded && controlsEnabled) {
    velocityY = 0.25;
    document.getElementById("jumpsound").play();
    isGrounded = false;
  }
});

document.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

let yaw = 0,
  pitch = 0;
function onMouseMove(event) {
  yaw -= event.movementX * 0.002;
  pitch -= event.movementY * 0.002;
  pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
  camera.rotation.set(pitch, yaw, 0, "YXZ");
}

// Gravity variables
let velocityY = 0;
const gravity = -0.01;
const playerHeight = 1.8;
let isGrounded = false;

let controlsEnabled = false;

// Highlight box (wireframe outline)
const highlightGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01); // slightly bigger than block
const highlightMat = new THREE.LineBasicMaterial({ color: 0xFF0000 }); // red outline
const highlight = new THREE.LineSegments(new THREE.EdgesGeometry(highlightGeo), highlightMat);
highlight.visible = false; // hidden until we aim at a block
scene.add(highlight);

// Sun mesh
const sunGeo = new THREE.SphereGeometry(7, 32, 32);
const sunMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
scene.add(sunMesh);

// Moon mesh
const moonGeo = new THREE.SphereGeometry(7, 32, 32);
const moonMat = new THREE.MeshBasicMaterial({ color: 0xddddff });
const moonMesh = new THREE.Mesh(moonGeo, moonMat);
scene.add(moonMesh);

const sunLight = new THREE.DirectionalLight(0xffffff, 1);
sunLight.castShadow = true;
scene.add(sunLight);

const moonLight = new THREE.DirectionalLight(0x9999ff, 0.3); // bluish moonlight
scene.add(moonLight);

// Pointer lock setup
const instructions = document.getElementById("instructions");

let gamestarted = false;

// Shuffle the list (Fisher–Yates)
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

instructions.addEventListener("click", () => {
    renderer.domElement.requestPointerLock();
    if (!gamestarted) {
        gamestarted = true;
        // Prepare list of music tracks
        const tracks = [];
        for (let i = 1; i <= 15; i++) {
            tracks.push(`music/music${i}.mp3`); // adjust filenames to match your files
        }

        const shuffled = shuffle(tracks);
        const player = document.getElementById("player");

        // Pick the first track from the shuffled list
        player.src = shuffled[0];
        player.play().catch(err => {
            console.log("Autoplay blocked:", err);
        });
    }
});

// Listen for pointer lock changes (include vendor prefix if needed)
document.addEventListener("pointerlockchange", onPointerLockChange, false);
document.addEventListener("webkitpointerlockchange", onPointerLockChange, false);

function onPointerLockChange() {
  const lockedElement = document.pointerLockElement;
  const locked = lockedElement === renderer.domElement;

  if (locked) {
    // Pointer is locked → enable controls
    controlsEnabled = true;
    document.getElementById("settings").style.display = "none";
    instructions.style.display = "none";
    document.addEventListener("mousemove", onMouseMove, false);
  } else {
    // Pointer is unlocked
    controlsEnabled = false;

    // Only show instructions if inventory is NOT open
    instructions.style.display = inventoryOpen ? "none" : "";
    document.getElementById("settings").style.display = inventoryOpen ? "none" : "";

    document.removeEventListener("mousemove", onMouseMove, false);
  }
}

// 3D block textures for meshes
const loader = new THREE.TextureLoader();
const blockDefs = {
  1: "textures/grass.png",
  2: "textures/dirt.png",
  3: "textures/stone.png",
  4: "textures/wood.png",
  5: "textures/leaves.png"
};

// Build 3D textures
const blockTextures3D = {};
for (const id in blockDefs) {
  blockTextures3D[id] = loader.load(blockDefs[id]);
}

// Build UI icons (just reuse the paths)
const blockIcons = { ...blockDefs };

const inventory = Object.keys(blockIcons).map(Number); // block IDs (stone, dirt, wood, etc.)
let selectedIndex = 0;

function renderInventory() {
  const invDiv = document.getElementById("inventory");
  invDiv.innerHTML = "";
  inventory.forEach((blockId, i) => {
    const slot = document.createElement("div");
    slot.className = "slot" + (i === selectedIndex ? " selected" : "");
    slot.style.backgroundImage = `url(${blockIcons[blockId]})`; // your block icons
    invDiv.appendChild(slot);
  });
}

// Number keys (1–9) select directly
document.addEventListener("keydown", (e) => {
  if (e.key >= "1" && e.key <= "9") {
    selectedIndex = parseInt(e.key) - 1;
    renderInventory();
    updateHand();
  }
});

// Scroll wheel cycles through inventory
document.addEventListener("wheel", (e) => {
  if (e.deltaY > 0) {
    // Scrolling down → next slot
    selectedIndex = (selectedIndex + 1) % inventory.length;
  } else {
    // Scrolling up → previous slot
    selectedIndex = (selectedIndex - 1 + inventory.length) % inventory.length;
  }
  renderInventory();
  updateHand();
});

let inventoryOpen = false;

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "e") {
    inventoryOpen = !inventoryOpen;

    const panel = document.getElementById("inventoryPanel");
    panel.style.display = inventoryOpen ? "grid" : "none";

    if (inventoryOpen) {
      // Unlock mouse
      document.exitPointerLock();
      instructions.style.display = "none";
    } else {
        renderer.domElement.requestPointerLock();
    }
  }
});

const handGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const handMat = new THREE.MeshBasicMaterial({ map: blockTextures3D[inventory[selectedIndex]] });
const handMesh = new THREE.Mesh(handGeo, handMat);
scene.add(handMesh);
handMesh.position.set(0.5, -0.5, -1);
handMesh.parent = camera; // optional, to keep it relative

function updateHand() {
  handMesh.material.map = blockTextures3D[inventory[selectedIndex]];
  handMesh.material.needsUpdate = true;
}

function renderInventoryPanel() {
  const panel = document.getElementById("inventoryPanel");
  panel.innerHTML = "";
  inventory.forEach((blockId, i) => {
    const slot = document.createElement("div");
    slot.className = "slot" + (i === selectedIndex ? " selected" : "");
    slot.style.backgroundImage = `url(${blockIcons[blockId]})`;
    slot.addEventListener("click", () => {
      selectedIndex = i;
      renderInventoryPanel();
      renderInventory();
      updateHand();
    });
    panel.appendChild(slot);
  });
}

renderInventoryPanel();
renderInventory();

// Noise generator
const noise = new SimplexNoise(SEED);

// Chunk management variables
const CHUNK_SIZE = 16;      // X/Z size
const CHUNK_HEIGHT = 16;    // Y size
const chunkData = {}; 
const chunks = {};

const radiusSlider = document.getElementById("radius");
const radiusValue = document.getElementById("radiusValue");
const volumeSlider = document.getElementById("volume");
const volumeValue = document.getElementById("volumeValue");
const sfxVolumeSlider = document.getElementById("sfxVolume");
const sfxVolumeValue = document.getElementById("sfxVolumeValue");
const player = document.getElementById("player");

let currentIndex = 0;
player.addEventListener("ended", () => {
  currentIndex++;
  if (currentIndex >= shuffled.length) {
    // reshuffle once we've played everything
    shuffled = shuffle(tracks);   // reuse your Fisher–Yates shuffle function
    currentIndex = 0;
  }
  player.src = shuffled[currentIndex];
  player.play().catch(err => {
    console.log("Playback failed:", err);
  });
});

let RADIUS = 4; // how many chunks around player to keep

// Update radius
radiusSlider.addEventListener("input", () => {
    const r = parseInt(radiusSlider.value, 10);
    radiusValue.textContent = r;
    RADIUS = r;
});

volumeSlider.addEventListener("input", () => {
    const v = parseFloat(volumeSlider.value);
    volumeValue.textContent = v.toFixed(2);
    player.volume = v; // set audio volume
});

document.getElementById("breaksound").volume = 1;
document.getElementById("placesound").volume = 1;
document.getElementById("jumpsound").volume = 1;

sfxVolumeSlider.addEventListener("input", () => {
    const v = parseFloat(sfxVolumeSlider.value);
    sfxVolumeValue.textContent = v.toFixed(2);
    document.getElementById("breaksound").volume = v;
    document.getElementById("placesound").volume = v;
    document.getElementById("jumpsound").volume = v;
});

function generateChunk(cx, cy, cz) {
  const data = ensureChunkData(cx, cy, cz);
  const mesh = buildMeshFromData(cx, cy, cz, data);
  return mesh;
}

function keyOf(cx, cy, cz) {
  return `${cx},${cy},${cz}`;
}

function worldToChunkCoords(wx, wy, wz) {
  const cx = Math.floor(wx / CHUNK_SIZE);
  const cz = Math.floor(wz / CHUNK_SIZE);
  const cy = Math.floor(wy / CHUNK_HEIGHT);
  return { cx, cy, cz };
}

function worldToLocalBlock(wx, wy, wz, cx, cy, cz) {
  const lx = Math.floor(wx - cx * CHUNK_SIZE);
  const lz = Math.floor(wz - cz * CHUNK_SIZE);
  const ly = Math.floor(wy - cy * CHUNK_HEIGHT);
  return { lx, ly, lz };
}

function ensureChunkData(cx, cy, cz) {
    const key = keyOf(cx, cy, cz);
    if (chunkData[key]) return chunkData[key];

    // Pre-init whole chunk so neighbors exist
    const data = new Array(CHUNK_SIZE);
    for (let x = 0; x < CHUNK_SIZE; x++) {
        data[x] = new Array(CHUNK_SIZE);
        for (let z = 0; z < CHUNK_SIZE; z++) {
        data[x][z] = new Array(CHUNK_HEIGHT).fill(0);
        }
    }

    const BASE_LEVEL = 32;
    const AMPLITUDE = 8;

    // First pass: terrain
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;
        const surfaceH = Math.floor(BASE_LEVEL + AMPLITUDE * noise.noise2D(wx / 50, wz / 50));

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
            const wy = cy * CHUNK_HEIGHT + y;

            if (wy > surfaceH) continue;            // air
            else if (wy === surfaceH) data[x][z][y] = 1; // grass
            else if (wy >= surfaceH - 3) data[x][z][y] = 2; // dirt
            else data[x][z][y] = 3;                 // stone
        }
        }
    }

    // Second pass: trees (only in the chunk that contains the surface)
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;
        const surfaceH = Math.floor(BASE_LEVEL + AMPLITUDE * noise.noise2D(wx / 50, wz / 50));

        // Only place trees where the surface lies within this chunk
        if (Math.floor(surfaceH / CHUNK_HEIGHT) !== cy) continue;

        const localSurfaceY = surfaceH - cy * CHUNK_HEIGHT;

        // Must have grass at the surface
        if (localSurfaceY < 0 || localSurfaceY >= CHUNK_HEIGHT) continue;
        if (data[x][z][localSurfaceY] !== 1) continue;

        // Deterministic-ish chance using noise (stable per seed)
        const treeNoise = noise.noise2D(wx / 100, wz / 100);
        if (treeNoise > 0.35 && canPlaceTree(wx, wz)) {
            treeCenters.add(`${wx},${wz}`);
            generateTree(data, x, z, localSurfaceY);
        }
    }
  }

  chunkData[key] = data;
  return data;
}

function generateTree(data, x, z, surfaceY) {
  const trunkHeight = 4 + Math.floor(Math.random() * 2); // 4–5
  if (surfaceY + trunkHeight + 2 >= CHUNK_HEIGHT) return; // not enough space
  const topY = surfaceY + trunkHeight;

  // Trunk (clamped to current chunk)
  for (let y = surfaceY + 1; y <= topY; y++) {
    if (y >= 0 && y < CHUNK_HEIGHT) {
      data[x][z][y] = 4; // wood
    }
  }

  // Leaves (clamped to current chunk and chunk bounds in X/Z)
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = 0; dy <= 2; dy++) {
        const lx = x + dx;
        const lz = z + dz;
        const ly = topY + dy;

        if (lx < 0 || lx >= CHUNK_SIZE) continue;
        if (lz < 0 || lz >= CHUNK_SIZE) continue;
        if (ly < 0 || ly >= CHUNK_HEIGHT) continue;

        if (data[lx][lz][ly] === 0) {
          data[lx][lz][ly] = 5; // leaves
        }
      }
    }
  }
}

const treeCenters = new Set();

function canPlaceTree(x, z) {
  const radius = 4;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      if (treeCenters.has(`${x+dx},${z+dz}`)) {
        return false;
      }
    }
  }
  return true;
}

const geometry = new THREE.BoxGeometry(1,1,1);

// Preload materials for each block type
const materials = {
  1: new THREE.MeshStandardMaterial({ map: loader.load("textures/grass.png") }),
  2: new THREE.MeshStandardMaterial({ map: loader.load("textures/dirt.png") }),
  3: new THREE.MeshStandardMaterial({ map: loader.load("textures/stone.png") }),
  4: new THREE.MeshStandardMaterial({ map: loader.load("textures/wood.png") }),
  5: new THREE.MeshStandardMaterial({ map: loader.load("textures/leaves.png") })
};

function buildMeshFromData(cx, cy, cz, data) {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();

  // One InstancedMesh per block type
  const instancedMeshes = {};
  for (const id in materials) {
    instancedMeshes[id] = new THREE.InstancedMesh(
      geometry,
      materials[id],
      CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT
    );
    instancedMeshes[id].count = 0;
    group.add(instancedMeshes[id]);
  }

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const type = data[x][z][y];
        if (!type) continue;

        const wx = cx * CHUNK_SIZE + x;
        const wy = cy * CHUNK_HEIGHT + y; // world Y from cy
        const wz = cz * CHUNK_SIZE + z;

        dummy.position.set(wx, wy, wz);
        dummy.updateMatrix();

        const mesh = instancedMeshes[type];
        mesh.setMatrixAt(mesh.count++, dummy.matrix);
      }
    }
  }

  for (const id in instancedMeshes) {
    instancedMeshes[id].instanceMatrix.needsUpdate = true;
  }

  scene.add(group);
  return group;
}

function rebuildChunk(cx, cy, cz) {
  const key = keyOf(cx, cy, cz);
  const data = ensureChunkData(cx, cy, cz);

  if (chunks[key]) {
    scene.remove(chunks[key]);
  }
  chunks[key] = buildMeshFromData(cx, cy, cz, data);
}

function updateChunks() {
  const { cx, cy, cz } = worldToChunkCoords(
    camera.position.x,
    camera.position.y,
    camera.position.z
  );

  const needed = new Set();

  // Build camera frustum
  const frustum = new THREE.Frustum();
  const projScreenMatrix = new THREE.Matrix4();
  projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projScreenMatrix);

  const maxDistance = RADIUS * CHUNK_SIZE;

  for (let dx = -RADIUS; dx <= RADIUS; dx++) {
    for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      for (let dy = -RADIUS; dy <= RADIUS; dy++) {
        const kcx = cx + dx, kcy = cy + dy, kcz = cz + dz;
        const key = keyOf(kcx, kcy, kcz);

        // World center of chunk
        const chunkCenter = new THREE.Vector3(
          kcx * CHUNK_SIZE + CHUNK_SIZE / 2,
          kcy * CHUNK_HEIGHT + CHUNK_HEIGHT / 2,
          kcz * CHUNK_SIZE + CHUNK_SIZE / 2
        );

        // Distance culling
        const distSq = chunkCenter.distanceToSquared(camera.position);
        if (distSq > (maxDistance + CHUNK_SIZE) ** 2) continue;

        // Frustum culling (sphere test)
        const radius = Math.sqrt(CHUNK_SIZE ** 2 + CHUNK_HEIGHT ** 2) / 2;
        if (!frustum.intersectsSphere(new THREE.Sphere(chunkCenter, radius))) continue;

        needed.add(key);

        if (!chunks[key]) {
          ensureChunkData(kcx, kcy, kcz);
          chunks[key] = generateChunk(kcx, kcy, kcz);
        }
      }
    }
  }

  // Remove far/out-of-view chunks
  for (const key in chunks) {
    if (!needed.has(key)) {
      scene.remove(chunks[key]);
      delete chunks[key];
    }
  }
}

// Flashlight spotlight
const flashlight = new THREE.SpotLight(
  0xffffff,   // color
  6,          // intensity (brighter than default 1)
  200,        // distance (how far it reaches)
  Math.PI/8,  // angle (narrower cone = more focused beam)
  0.3,        // penumbra (soft edge)
  1           // decay (light falloff)
);

flashlight.castShadow = true;
camera.add(flashlight);
camera.add(flashlight.target);
scene.add(camera);

// Aim forward
flashlight.target.position.set(0, 0.7, -0.9);

let fps = 0;

let lastTime = performance.now();
function updateFPS() {
  const now = performance.now();
  const delta = (now - lastTime) / 1000;
  lastTime = now;
  const fps = 1 / delta;
  document.getElementById("fps").textContent = `FPS: ${Math.round(fps)}`;
}

function updateMemory() {
  const el = document.getElementById("memory");
  if (performance && performance.memory) {
    const usedMB = performance.memory.usedJSHeapSize / 1048576;
    const totalMB = performance.memory.totalJSHeapSize / 1048576;
    const limitMB = performance.memory.jsHeapSizeLimit / 1048576;
    const percent = (usedMB / limitMB) * 100;

    el.textContent = `Memory: ${usedMB.toFixed(2)} MB / ${totalMB.toFixed(2)} MB (limit: ${limitMB.toFixed(0)} MB)`;
    el.style.color = percent > 80 ? "red" : percent > 50 ? "orange" : "lime";
  } else {
    el.textContent = "Memory: not supported";
    el.style.color = "gray";
  }
}

let lastUpdate = 0;
function animate() {
    requestAnimationFrame(animate);

    // --- Player movement ---
    const speed = 0.2;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);

    if (controlsEnabled && !inventoryOpen) {
        // Horizontal movement only (X/Z)
        const move = new THREE.Vector3();
        if (keys["w"]) move.add(forward);
        if (keys["s"]) move.sub(forward);

        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        if (keys["d"]) move.add(right);
        if (keys["a"]) move.sub(right);

        move.normalize(); // prevent diagonal speed boost
        camera.position.addScaledVector(move, speed);
    }

    // --- Gravity (Y only) ---
    velocityY += gravity;
    camera.position.y += velocityY;

    // --- Ground collision ---
    const groundRay = new THREE.Raycaster(
        camera.position,
        new THREE.Vector3(0, -1, 0),
        0,
        100
    );
    const groundHits = groundRay.intersectObjects(Object.values(chunks));

    if (groundHits.length > 0) {
        const groundY = groundHits[0].point.y;
        const tolerance = 0.05; // small margin to prevent jitter

        if (camera.position.y <= groundY + playerHeight + tolerance) {
            camera.position.y = groundY + playerHeight;
            velocityY = 0;
            isGrounded = true;
            document.getElementById("jumpsound").pause();
            document.getElementById("jumpsound").currentTime = 0;
        } else {
            isGrounded = false;
        }
    }

    // --- Day/night cycle ---
    timeOfDay += 0.01;
    if (timeOfDay >= 24) timeOfDay = 0;

    const orbitRadius = 200;
    const angle = (timeOfDay / 24) * Math.PI * 2;

    const px = camera.position.x;
    const py = camera.position.y;
    const pz = camera.position.z;

    // Sun orbit
    sunMesh.position.set(
        px + Math.cos(angle) * orbitRadius,
        py + Math.sin(angle) * orbitRadius,
        pz
    );

    // Moon orbit opposite
    moonMesh.position.set(
        px + Math.cos(angle + Math.PI) * orbitRadius,
        py + Math.sin(angle + Math.PI) * orbitRadius,
        pz
    );

    // Sun height factor (-1 = midnight, +1 = noon)
    const sunHeight = (sunMesh.position.y - py) / orbitRadius;

    // --- Sky colour blending ---
    const dayColor = new THREE.Color(0x87ceeb);   // sky blue
    const sunsetColor = new THREE.Color(0xff8c00); // orange
    const nightColor = new THREE.Color(0x000011); // dark blue

    let skyColor;
    if (sunHeight > 0) {
        // Daytime: fade through sunset as sun lowers
        const t = 1 - (sunHeight + 1) / 2; // 0 at noon, 1 at horizon
        skyColor = dayColor.clone().lerp(sunsetColor, t);
    } else {
        // Nighttime: fade directly to night (no orange)
        const t = Math.abs(sunHeight); // 0 at horizon, 1 at midnight
        skyColor = nightColor.clone().lerp(dayColor, Math.max(0, 0.1 - t)); // slight dawn tint
    }
    scene.background = skyColor;

    // --- Lighting ---
    sunLight.position.copy(sunMesh.position);
    sunLight.intensity = Math.max(0, sunHeight); // bright at noon, 0 at night

    moonLight.position.copy(moonMesh.position);
    moonLight.intensity = Math.max(0, -sunHeight * 0.3); // faint bluish light at night

    ambient.intensity = 0.2 + sunHeight * 0.5;

    // --- Highlight block under crosshair ---
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    const hits = raycaster.intersectObjects(Object.values(chunks), true);

    if (hits.length > 0) {
        const hit = hits[0];

        const MAX_RANGE = 6;
        const distance = camera.position.distanceTo(hit.point);

        if (distance <= MAX_RANGE) {
            const { cx, cy, cz, lx, ly, lz } = getVoxelCoordsFromHit(hit, true);

            // Convert local voxel coords back to world position
            const wx = cx * CHUNK_SIZE + lx;
            const wy = cy * CHUNK_HEIGHT + ly;
            const wz = cz * CHUNK_SIZE + lz;

            highlight.position.set(wx, wy, wz);
            highlight.visible = true;
        } else {
            highlight.visible = false;
        }
    } else {
        highlight.visible = false;
    }

    // Update HUD
    updateFPS();
    updateMemory();
    document.getElementById("position").textContent = `X: ${camera.position.x.toFixed(2)} Y: ${camera.position.y.toFixed(2)} Z: ${camera.position.z.toFixed(2)}`;

    const now = performance.now();
    if (now - lastUpdate > 100) { // every 100ms
      updateChunks();
      lastUpdate = now;
    }

    renderer.render(scene, camera);
}

function detectEnvironment() {
    const ua = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(ua);

    return { isMobile };
}

function hideAllExcept(idToShow) {
  // Get all elements in the document
  const allElements = document.querySelectorAll("body *");

  allElements.forEach(el => {
    if (el.id === idToShow) {
      el.style.display = "block"; // show the target
    } else {
      el.style.display = "none";  // hide everything else
    }
  });
}

const env = detectEnvironment();
if (env.isMobile) {
  hideAllExcept("warning");
} else {
  animate();
}