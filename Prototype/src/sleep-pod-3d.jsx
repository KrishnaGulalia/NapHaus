import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// ── Scale: 1 unit = 10 cm ──────────────────────────────────────
// Interior: 220 cm L × 90 cm W × 100 cm H
const L = 22, W = 9, H = 10;
const T = 0.75;   // thick insulating wall  (~7.5 cm each side, matches hatched wall in spatial design)
const CR = 0.55;  // corner rounding radius for alloy frame

// Interior 360° viewpoint (local pod coordinates — head of bed, eye height while reclined)
// pod is later shifted to y = H/2 + T so floor sits at world y = 0
const INTERIOR_LOCAL = { x: 0, y: -H / 2 + 2.4, z: -L / 2 + 4.2 };
const FOV_ORBIT = 34;
const FOV_INTERIOR = 78;

export default function NapHaus3D() {
  const mountRef  = useRef(null);
  const stateRef  = useRef({
    // Orbit
    theta: 0.45, phi: 0.60, radius: 36,
    // Interior look
    yaw: 0.05, pitch: 0.10,
    // Common
    mode: "orbit",          // "orbit" | "interior"
    isDragging: false, prev: null,
    // Smooth animated transition between modes
    trans: null,            // { t0, dur, fromMode, toMode, fromPos, toPos, fromQuat, toQuat, fromFov, toFov }
  });
  const cameraRef = useRef(null);
  const rendRef   = useRef(null);
  const podRef    = useRef(null);
  const targetVec = useRef(new THREE.Vector3(0, H / 2 + T + 0.4, 0));
  const dimGroupRef = useRef(null);
  const interiorWorldRef = useRef(new THREE.Vector3());
  const [activeView, setActiveView] = useState("Perspective");
  const [hov, setHov] = useState(null);
  const [interior, setInterior] = useState(false);
  const [hintFade, setHintFade] = useState(1);

  const computeInteriorWorld = useCallback(() => {
    // pod is positioned at (0, H/2 + T, 0)
    return new THREE.Vector3(
      INTERIOR_LOCAL.x,
      H / 2 + T + INTERIOR_LOCAL.y,
      INTERIOR_LOCAL.z
    );
  }, []);

  const applyOrbit = useCallback((cam) => {
    const { theta, phi, radius } = stateRef.current;
    const t = targetVec.current;
    cam.position.set(
      t.x + radius * Math.sin(phi) * Math.sin(theta),
      t.y + radius * Math.cos(phi),
      t.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    cam.lookAt(t);
  }, []);

  const applyInterior = useCallback((cam) => {
    const st = stateRef.current;
    const p = interiorWorldRef.current;
    cam.position.copy(p);
    const cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
    const cy = Math.cos(st.yaw),   sy = Math.sin(st.yaw);
    cam.lookAt(p.x + cp * sy, p.y + sp, p.z + cp * cy);
  }, []);

  const updateCamera = useCallback(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    const st = stateRef.current;
    if (st.trans) return; // transition tick will handle it
    if (st.mode === "orbit") applyOrbit(cam);
    else applyInterior(cam);
  }, [applyOrbit, applyInterior]);

  useEffect(() => {
    const el = mountRef.current;
    const cW = el.clientWidth, cH = el.clientHeight;

    // ── Scene ────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    // Soft sky→floor vertical gradient via canvas background
    const bgC = document.createElement('canvas');
    bgC.width = 8; bgC.height = 256;
    const bgX = bgC.getContext('2d');
    const bgG = bgX.createLinearGradient(0, 0, 0, 256);
    bgG.addColorStop(0,   '#e6ecf5');
    bgG.addColorStop(0.55,'#eef2f7');
    bgG.addColorStop(1,   '#d6dde6');
    bgX.fillStyle = bgG; bgX.fillRect(0, 0, 8, 256);
    const bgTex = new THREE.CanvasTexture(bgC);
    bgTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = bgTex;
    scene.fog = new THREE.Fog(0xe4eaf2, 70, 140);

    // ── Camera ───────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(FOV_ORBIT, cW / cH, 0.05, 300);
    cameraRef.current = camera;
    interiorWorldRef.current = computeInteriorWorld();
    updateCamera();

    // ── Renderer ─────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(cW, cH);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    rendRef.current = renderer;

    // ── Environment map (PMREM RoomEnvironment) for realistic PBR reflections ──
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    // ── Lighting ─────────────────────────────────────────────────
    // Hemisphere for soft global ambient (sky↔ground gradient)
    const hemi = new THREE.HemisphereLight(0xe8eef8, 0xbfa884, 0.55);
    hemi.position.set(0, 30, 0);
    scene.add(hemi);

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    const sun = new THREE.DirectionalLight(0xfff3dc, 2.4);
    sun.position.set(22, 35, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 110;
    sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
    sun.shadow.camera.top  =  32; sun.shadow.camera.bottom = -32;
    sun.shadow.bias = -0.00012;
    sun.shadow.radius = 4;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0xb8d0ff, 0.55);
    fill.position.set(-18, 14, -12);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffe4c2, 0.40);
    rim.position.set(0, -4, 24);
    scene.add(rim);

    // Warm LED glow inside pod (under canopy lip)
    const ledGlow = new THREE.PointLight(0xff9a33, 2.4, 22, 1.6);
    ledGlow.position.set(0, H / 2 + T - 1.6, -L / 2 + 1.8);
    ledGlow.castShadow = false;
    scene.add(ledGlow);

    // Second interior warm bounce (over bed)
    const bedGlow = new THREE.PointLight(0xffd6a0, 0.9, 18, 1.4);
    bedGlow.position.set(0, H / 2 + T - 0.6, 1.5);
    scene.add(bedGlow);

    // Reading lamp light source
    const readLight = new THREE.PointLight(0xffeb9e, 1.2, 9, 1.8);
    readLight.position.set(W / 2 - 0.8, H / 2 + T + (-2.6), -L / 2 + 5.2);
    scene.add(readLight);

    // B1 front face glow
    const b1Glow = new THREE.PointLight(0x3a78ff, 0.9, 10, 1.4);
    b1Glow.position.set(0, -H / 2 + 1.5, L / 2 + T + 0.5);
    scene.add(b1Glow);

    // ── Procedural Textures ──────────────────────────────────────
    // Lightweight canvas-based textures for added surface realism without external assets.
    const makeCanvas = (w, h, draw) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    };

    // Warm oak wood grain (color + roughness)
    const oakMap = makeCanvas(512, 512, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#c47a2a'); grd.addColorStop(1, '#a86420');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        const y = Math.random() * h;
        g.strokeStyle = `rgba(${60 + Math.random()*40},${30 + Math.random()*20},10,${0.06 + Math.random()*0.10})`;
        g.lineWidth = 0.5 + Math.random() * 1.4;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x*0.018 + i)*1.6 + (Math.random()-0.5)*1.2);
        g.stroke();
      }
      for (let i = 0; i < 14; i++) {
        const cx = Math.random()*w, cy = Math.random()*h, r = 4 + Math.random()*9;
        const k = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        k.addColorStop(0, 'rgba(50,28,8,0.55)'); k.addColorStop(1, 'rgba(50,28,8,0)');
        g.fillStyle = k; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.fill();
      }
    });
    const oakRough = makeCanvas(256, 256, (g, w, h) => {
      g.fillStyle = '#888'; g.fillRect(0,0,w,h);
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = `rgba(${Math.random()*50+90},${Math.random()*50+90},${Math.random()*50+90},${Math.random()*0.5})`;
        g.fillRect(Math.random()*w, Math.random()*h, 1, 1);
      }
    });

    // Amber leather grain
    const leatherMap = makeCanvas(512, 512, (g, w, h) => {
      g.fillStyle = '#a8651c'; g.fillRect(0,0,w,h);
      for (let i = 0; i < 7000; i++) {
        const x = Math.random()*w, y = Math.random()*h;
        const sh = 30 + Math.random()*70;
        g.fillStyle = `rgba(${sh+40},${sh+10},${sh-10},${Math.random()*0.18})`;
        g.beginPath(); g.arc(x, y, 0.5 + Math.random()*2.2, 0, Math.PI*2); g.fill();
      }
      // soft creases
      for (let i = 0; i < 24; i++) {
        g.strokeStyle = `rgba(60,30,10,${0.04 + Math.random()*0.06})`;
        g.lineWidth = 0.6 + Math.random()*1.2;
        g.beginPath();
        const sx = Math.random()*w, sy = Math.random()*h;
        g.moveTo(sx, sy);
        for (let k = 0; k < 20; k++) g.lineTo(sx + (Math.random()-0.5)*180, sy + (Math.random()-0.5)*180);
        g.stroke();
      }
    });
    const leatherNorm = makeCanvas(512, 512, (g, w, h) => {
      g.fillStyle = '#8080ff'; g.fillRect(0,0,w,h);
      for (let i = 0; i < 9000; i++) {
        const x = Math.random()*w, y = Math.random()*h;
        const r = 0.5 + Math.random()*2.0;
        const dx = (Math.random()-0.5);
        const dy = (Math.random()-0.5);
        g.fillStyle = `rgb(${128 + dx*60 | 0},${128 + dy*60 | 0},${200 + Math.random()*30 | 0})`;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI*2); g.fill();
      }
    });

    // Soft white fabric weave (pillow / mattress)
    const fabricMap = makeCanvas(256, 256, (g, w, h) => {
      g.fillStyle = '#f6f1e8'; g.fillRect(0,0,w,h);
      for (let i = 0; i < 9000; i++) {
        const x = Math.random()*w, y = Math.random()*h;
        g.fillStyle = `rgba(${230 - Math.random()*30},${225 - Math.random()*30},${210 - Math.random()*30},${Math.random()*0.4})`;
        g.fillRect(x, y, 1, 1);
      }
      g.strokeStyle = 'rgba(200,190,170,0.20)';
      for (let i = 0; i < 64; i++) { g.beginPath(); g.moveTo(0, i*4); g.lineTo(w, i*4); g.stroke(); }
      for (let i = 0; i < 64; i++) { g.beginPath(); g.moveTo(i*4, 0); g.lineTo(i*4, h); g.stroke(); }
    });

    // Brushed metal (alloy frame) — vertical brushed lines
    const brushedMap = makeCanvas(256, 512, (g, w, h) => {
      g.fillStyle = '#2a2c38'; g.fillRect(0,0,w,h);
      for (let x = 0; x < w; x++) {
        g.fillStyle = `rgba(${60 + Math.random()*30 | 0},${65 + Math.random()*30 | 0},${85 + Math.random()*30 | 0},${0.20 + Math.random()*0.30})`;
        g.fillRect(x, 0, 1, h);
      }
    });

    // Acoustic foam (subtle perforated grid)
    const acousticMap = makeCanvas(256, 256, (g, w, h) => {
      g.fillStyle = '#d0cbc2'; g.fillRect(0,0,w,h);
      g.fillStyle = 'rgba(150,140,125,0.45)';
      for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) {
        g.beginPath(); g.arc(x + (y%16?0:4), y, 1.2, 0, Math.PI*2); g.fill();
      }
    });

    // Anti-slip vinyl (subtle speckle)
    const vinylMap = makeCanvas(256, 256, (g, w, h) => {
      g.fillStyle = '#3a3e4c'; g.fillRect(0,0,w,h);
      for (let i = 0; i < 14000; i++) {
        g.fillStyle = `rgba(${Math.random()*60+30 | 0},${Math.random()*60+30 | 0},${Math.random()*70+40 | 0},${Math.random()*0.6})`;
        g.fillRect(Math.random()*w, Math.random()*h, 1, 1);
      }
    });

    // Birch plywood — light grain
    const birchMap = makeCanvas(512, 256, (g, w, h) => {
      g.fillStyle = '#d2a948'; g.fillRect(0,0,w,h);
      for (let i = 0; i < 30; i++) {
        const y = Math.random()*h;
        g.strokeStyle = `rgba(120,80,30,${0.05 + Math.random()*0.10})`;
        g.lineWidth = 0.5 + Math.random()*1.0;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= w; x += 12) g.lineTo(x, y + Math.sin(x*0.02 + i)*1.2);
        g.stroke();
      }
    });

    // Repeat configurations
    oakMap.repeat.set(2, 1.4);  oakRough.repeat.set(2, 1.4);
    leatherMap.repeat.set(1.5, 1.0); leatherNorm.repeat.set(1.5, 1.0);
    fabricMap.repeat.set(2, 2);
    brushedMap.repeat.set(1, 6);
    acousticMap.repeat.set(8, 1.5);
    vinylMap.repeat.set(4, 12);
    birchMap.repeat.set(2.5, 1.5);

    // ── Materials ────────────────────────────────────────────────
    // Spatial Design palette: near-black frame, warm oak interior, amber leather, off-white bedding
    const mat = {
      // Outer shell — soft-touch matte charcoal (slightly textured via subtle clearcoat)
      shell:    new THREE.MeshPhysicalMaterial({ color:0x1d1e26, metalness:0.55, roughness:0.45, clearcoat:0.35, clearcoatRoughness:0.55 }),
      // Rounded corner alloy — brushed metallic
      corner:   new THREE.MeshPhysicalMaterial({ color:0x2a2c38, metalness:0.92, roughness:0.32, map: brushedMap, clearcoat:0.4, clearcoatRoughness:0.3 }),
      // Frame face edge strips (front ring)
      faceEdge: new THREE.MeshPhysicalMaterial({ color:0x26283a, metalness:0.80, roughness:0.25, clearcoat:0.5, clearcoatRoughness:0.25 }),

      // Interior — warm oak finish (matches golden-amber in spatial design)
      oak:      new THREE.MeshStandardMaterial({ color:0xffffff, map: oakMap, roughnessMap: oakRough, roughness:0.85, metalness:0.02 }),
      oakLight: new THREE.MeshStandardMaterial({ color:0xffffff, map: oakMap, roughness:0.72, metalness:0.02 }),
      // Birch plywood platform
      birch:    new THREE.MeshStandardMaterial({ color:0xffffff, map: birchMap, roughness:0.70 }),
      // Thick-insulating wall lining (cream/off-white ABS)
      abs:      new THREE.MeshStandardMaterial({ color:0xf0ece4, roughness:0.88 }),
      // Overhead canopy / storage area (very dark)
      canopy:   new THREE.MeshPhysicalMaterial({ color:0x16181e, roughness:0.40, metalness:0.30, clearcoat:0.30 }),
      // Acoustic ceiling — perforated foam
      acoustic: new THREE.MeshStandardMaterial({ color:0xffffff, map: acousticMap, roughness:0.98 }),
      // Anti-slip vinyl floor
      vinyl:    new THREE.MeshStandardMaterial({ color:0xffffff, map: vinylMap, roughness:0.94 }),

      // Bedding — woven cotton
      mattress: new THREE.MeshStandardMaterial({ color:0xfffaf2, map: fabricMap, roughness:0.96 }),
      pillow:   new THREE.MeshStandardMaterial({ color:0xffffff, map: fabricMap, roughness:1.0 }),
      blanket:  new THREE.MeshStandardMaterial({ color:0xe8e0d4, map: fabricMap, roughness:0.98 }),
      blanket2: new THREE.MeshStandardMaterial({ color:0xd8d0c4, map: fabricMap, roughness:0.97 }),
      // Folded towel stack
      towel:    new THREE.MeshStandardMaterial({ color:0xf2ede6, map: fabricMap, roughness:0.95 }),

      // Leather headboard — amber/caramel with grain + soft sheen
      leather:  new THREE.MeshPhysicalMaterial({
        color:0xffffff, map: leatherMap, normalMap: leatherNorm,
        roughness:0.50, metalness:0.02, sheen:0.6, sheenColor:0xffaa55, sheenRoughness:0.5,
        clearcoat:0.18, clearcoatRoughness:0.6,
      }),
      leatherDk:new THREE.MeshPhysicalMaterial({ color:0xa06018, map: leatherMap, roughness:0.55, metalness:0.02 }),
      // Stitching
      stitch:   new THREE.MeshStandardMaterial({ color:0x8a5010, roughness:0.5 }),

      // Storage box (HDPE) — mid-gray with subtle clearcoat
      hdpe:     new THREE.MeshPhysicalMaterial({ color:0x5a6878, roughness:0.55, metalness:0.08, clearcoat:0.25, clearcoatRoughness:0.4 }),
      hdpeFace: new THREE.MeshPhysicalMaterial({ color:0x4a5868, roughness:0.45, metalness:0.12, clearcoat:0.30, clearcoatRoughness:0.35 }),
      // Drawer handle (brushed alloy)
      metal:    new THREE.MeshPhysicalMaterial({ color:0xb6c2d2, metalness:0.95, roughness:0.18, clearcoat:0.5, clearcoatRoughness:0.2 }),

      // LED ambient strip
      led:      new THREE.MeshStandardMaterial({ color:0xffcc44, emissive:0xff9900, emissiveIntensity:3.8, roughness:0.2 }),
      // Study lamp
      lampBody: new THREE.MeshPhysicalMaterial({ color:0xcdd6e2, metalness:0.80, roughness:0.22, clearcoat:0.4 }),
      lampGlow: new THREE.MeshStandardMaterial({ color:0xffee88, emissive:0xffcc22, emissiveIntensity:2.2, roughness:0.3 }),
      // Foldable table — MDF top, alu legs
      tableTop: new THREE.MeshStandardMaterial({ color:0xdcd4b8, roughness:0.55 }),
      tableAlu: new THREE.MeshPhysicalMaterial({ color:0xaabbc0, metalness:0.92, roughness:0.18, clearcoat:0.5 }),
      // Mesh shelf
      meshShelf:new THREE.MeshPhysicalMaterial({ color:0x8899aa, metalness:0.6, roughness:0.45 }),
      // Galvanised steel vents
      galv:     new THREE.MeshPhysicalMaterial({ color:0x96a4b4, metalness:0.88, roughness:0.30, clearcoat:0.4 }),
      // PP shutter (dark)
      shutter:  new THREE.MeshPhysicalMaterial({ color:0x282c3a, roughness:0.30, metalness:0.42, clearcoat:0.35 }),
      shutSlat: new THREE.MeshPhysicalMaterial({ color:0x323648, roughness:0.24, metalness:0.50, clearcoat:0.45 }),
      // Inner curtain fabric
      curtain:  new THREE.MeshStandardMaterial({ color:0xccc4bc, roughness:0.99, side:THREE.DoubleSide }),
      // Power panel
      panel:    new THREE.MeshPhysicalMaterial({ color:0x20242e, roughness:0.40, metalness:0.55, clearcoat:0.5, clearcoatRoughness:0.3 }),
      usb:      new THREE.MeshPhysicalMaterial({ color:0x14181e, metalness:0.85, roughness:0.20, clearcoat:0.6 }),
      // Rear panel
      rear:     new THREE.MeshPhysicalMaterial({ color:0xaab4be, roughness:0.50, metalness:0.22, clearcoat:0.3 }),
      rearDk:   new THREE.MeshPhysicalMaterial({ color:0x92a0aa, roughness:0.40, metalness:0.30, clearcoat:0.3 }),
      // Glass / soft accent for small interior detail surfaces
      glass:    new THREE.MeshPhysicalMaterial({ color:0xc8e0ff, metalness:0, roughness:0.05, transmission:0.85, thickness:0.2, ior:1.45 }),
    };

    const pod = new THREE.Group();
    scene.add(pod);
    podRef.current = pod;

    // ── Helpers ──────────────────────────────────────────────────
    const box = (m, w, h, d, x, y, z, rz=0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      if (rz) mesh.rotation.z = rz;
      mesh.castShadow = true; mesh.receiveShadow = true;
      pod.add(mesh); return mesh;
    };

    // Rounded box — beveled hero surfaces (slabs, mattress, pillows, drawer)
    const rbox = (m, w, h, d, x, y, z, radius=0.10, segments=3, rz=0) => {
      const r = Math.min(radius, Math.min(w, h, d) * 0.49);
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, segments, r), m);
      mesh.position.set(x, y, z);
      if (rz) mesh.rotation.z = rz;
      mesh.castShadow = true; mesh.receiveShadow = true;
      pod.add(mesh); return mesh;
    };

    const cyl = (m, r, h, x, y, z, rx=0, rz=0) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), m);
      mesh.position.set(x, y, z);
      if (rx) mesh.rotation.x = rx;
      if (rz) mesh.rotation.z = rz;
      mesh.castShadow = true; mesh.receiveShadow = true;
      pod.add(mesh); return mesh;
    };

    // ─────────────────────────────────────────────────────────────
    // 1. OUTER SHELL — soft-edge charcoal monolith, thick walls
    // ─────────────────────────────────────────────────────────────
    // Top slab (rounded)
    rbox(mat.shell, W + T*2, T, L + T*2, 0, H/2 + T/2, 0, 0.30, 4);
    // Bottom slab (rounded)
    rbox(mat.shell, W + T*2, T, L + T*2, 0, -H/2 - T/2, 0, 0.30, 4);
    // Left wall
    rbox(mat.shell, T, H, L + T*2, -W/2 - T/2, 0, 0, 0.30, 4);
    // Right wall
    rbox(mat.shell, T, H, L + T*2, W/2 + T/2, 0, 0, 0.30, 4);
    // Rear wall
    rbox(mat.shell, W + T*2, H + T*2, T, 0, 0, -L/2 - T/2, 0.30, 4);

    // ─────────────────────────────────────────────────────────────
    // 2. ROUNDED ALLOY FRAME — vertical corner cylinders
    //    Key feature from "Round Alloy Frame" annotation
    // ─────────────────────────────────────────────────────────────
    const cxs = [-(W/2 + T - CR*0.5), W/2 + T - CR*0.5];
    const czs = [-(L/2 + T - CR*0.5), L/2 + T - CR*0.5];
    cxs.forEach(cx => czs.forEach(cz => {
      cyl(mat.corner, CR, H + T*2, cx, 0, cz);
    }));
    // Top horizontal edge rounding (front + rear)
    [-L/2 - T + CR, L/2 + T - CR].forEach(ez => {
      box(mat.corner, W + T*2 - CR*2, CR*2, CR*2, 0, H/2 + T - CR, ez);
      box(mat.corner, W + T*2 - CR*2, CR*2, CR*2, 0, -H/2 - T + CR, ez);
    });
    // Side horizontal edge rounding (left + right)
    [-W/2 - T + CR, W/2 + T - CR].forEach(ex => {
      box(mat.corner, CR*2, CR*2, L + T*2 - CR*2, ex, H/2 + T - CR, 0);
      box(mat.corner, CR*2, CR*2, L + T*2 - CR*2, ex, -H/2 - T + CR, 0);
    });

    // ─────────────────────────────────────────────────────────────
    // 3. FRONT FACE OPENING FRAME — thick bezel ring (matches front view dark border)
    // ─────────────────────────────────────────────────────────────
    const fz = L/2 + T/2;
    // Top bar
    box(mat.faceEdge, W + T*2, T*1.6, T, 0, H/2 - T*0.2, fz);
    // Bottom bar
    box(mat.faceEdge, W + T*2, T*1.6, T, 0, -H/2 + T*0.2, fz);
    // Left post
    box(mat.faceEdge, T, H - T*3.2, T, -W/2 - T/2, 0, fz);
    // Right post
    box(mat.faceEdge, T, H - T*3.2, T, W/2 + T/2, 0, fz);
    // Corner rounding on front face
    cxs.forEach(cx => {
      cyl(mat.corner, CR, T, cx, H/2 + T - CR, fz, Math.PI/2);
      cyl(mat.corner, CR, T, cx, -H/2 - T + CR, fz, Math.PI/2);
    });

    // ─────────────────────────────────────────────────────────────
    // 4. INTERIOR SURFACES — thick walls create deep tunnel effect
    // ─────────────────────────────────────────────────────────────
    box(mat.vinyl,   W, 0.05, L, 0, -H/2 + 0.025, 0);   // anti-slip vinyl floor
    box(mat.acoustic,W, 0.05, L, 0,  H/2 - 0.025, 0);   // acoustic foam ceiling
    box(mat.abs, 0.04, H, L, -W/2 + 0.02, 0, 0);         // ABS left wall
    box(mat.abs, 0.04, H, L,  W/2 - 0.02, 0, 0);         // ABS right wall
    box(mat.oak, W, H, 0.04, 0, 0, -L/2 + 0.02);         // oak back wall (warm)

    // ─────────────────────────────────────────────────────────────
    // 5. OVERHEAD CANOPY / STORAGE AREA (dark top section in front view)
    //    Occupies upper ~30% of interior at head end
    // ─────────────────────────────────────────────────────────────
    const canopyZ = -L/2 + 2.8;
    const canopyH = 3.2;  // height of dark canopy section
    box(mat.canopy, W - 0.1, canopyH, 5.6,  0, H/2 - canopyH/2, canopyZ);
    // Canopy face (front-facing)
    box(mat.canopy, W - 0.1, canopyH, 0.08, 0, H/2 - canopyH/2, canopyZ + 2.8);

    // Storage shelf inside canopy (cable shelf at top — top view annotation)
    box(mat.canopy, W - 0.3, 0.55, 5.4, 0, H/2 - canopyH + 0.28, canopyZ);
    // LED strip below canopy lip
    box(mat.led, W - 0.6, 0.08, 0.08, 0, H/2 - canopyH, canopyZ + 2.5);

    // ─────────────────────────────────────────────────────────────
    // 6. HEADBOARD — leather panel (amber, prominent in front view)
    // ─────────────────────────────────────────────────────────────
    const leatherH = 2.4;
    const leatherY = H/2 - canopyH - leatherH/2;
    // Tufted leather panels (3 columns) with soft rounded edges
    const panW = (W - 0.3) / 3 - 0.04;
    [-1, 0, 1].forEach(k => {
      rbox(mat.leather, panW, leatherH - 0.08, 0.32, k * (panW + 0.04), leatherY, -L/2 + 0.30, 0.10, 4);
    });
    // Stitching lines
    [-W/4 + 0.15, W/4 - 0.15].forEach(lx =>
      box(mat.stitch, 0.04, leatherH - 0.1, 0.01, lx, leatherY, -L/2 + 0.34)
    );
    // Horizontal stitching seams
    [-0.5, 0.5].forEach(ly =>
      box(mat.stitch, W - 0.5, 0.025, 0.01, 0, leatherY + ly, -L/2 + 0.34)
    );

    // ─────────────────────────────────────────────────────────────
    // 7. SIDE STORAGE SHELF (annotated in side view & top view)
    //    Vertical oak shelf panel on left inner wall
    // ─────────────────────────────────────────────────────────────
    // Head-end storage shelf (visible in top view, left of bedding)
    box(mat.oakLight, 0.55, H * 0.55, 0.06, -W/2 + 0.32, H/2 - H*0.55/2 - 0.1, -L/2 + 1.8);
    // Small shelf lip
    box(mat.oak, 0.55, 0.06, 0.38, -W/2 + 0.32, H/2 - H*0.55 - 0.1, -L/2 + 1.9);
    // Right side matching shelf
    box(mat.oakLight, 0.55, H * 0.55, 0.06, W/2 - 0.32, H/2 - H*0.55/2 - 0.1, -L/2 + 1.8);

    // ─────────────────────────────────────────────────────────────
    // 8. MATTRESS PLATFORM — birch plywood (matches side view)
    // ─────────────────────────────────────────────────────────────
    const bedZ = L * 0.04;
    const bedBaseY = -H/2 + 0.80;
    rbox(mat.birch, W - 0.25, 0.78, L * 0.86, 0, bedBaseY, bedZ, 0.08, 3);

    // ─────────────────────────────────────────────────────────────
    // 9. MATTRESS — high-density foam, 10 cm thick (rounded edges)
    // ─────────────────────────────────────────────────────────────
    const mattY = bedBaseY + 0.39 + 0.36;
    rbox(mat.mattress, W - 0.52, 0.46, L * 0.82, 0, mattY, bedZ, 0.18, 4);
    // Mattress edge piping
    rbox(new THREE.MeshStandardMaterial({color:0xe8e2d8,roughness:0.9}),
      W - 0.52, 0.055, L * 0.82 + 0.06, 0, mattY + 0.23, bedZ, 0.025, 2);

    // ─────────────────────────────────────────────────────────────
    // 10. PILLOWS — 2×side-by-side at head end (matches front + side view)
    // ─────────────────────────────────────────────────────────────
    const pillY = mattY + 0.40, pillZ = -L/2 + 3.0;
    [[-W/4 + 0.15, 0.025], [W/4 - 0.15, -0.025]].forEach(([px, ry]) => {
      const r = 0.18;
      const pw = W/2 - 0.5, ph = 0.46, pd = 1.88;
      const pm = new THREE.Mesh(new RoundedBoxGeometry(pw, ph, pd, 5, Math.min(r, Math.min(pw, ph, pd) * 0.49)), mat.pillow);
      pm.position.set(px, pillY, pillZ); pm.rotation.y = ry;
      pm.castShadow = true; pm.receiveShadow = true; pod.add(pm);
    });

    // ─────────────────────────────────────────────────────────────
    // 11. BEDDING STACK (blanket + folded items at foot — side view)
    // ─────────────────────────────────────────────────────────────
    // Main blanket stack — softly rounded
    rbox(mat.blanket,  W - 0.62, 0.22, 2.0, 0, mattY + 0.34, L/2 - 2.0, 0.07, 3);
    rbox(mat.blanket2, W - 0.65, 0.10, 1.9, 0, mattY + 0.54, L/2 - 2.0, 0.04, 2);
    // Folded towel/pillow items at foot
    rbox(mat.towel, W/2 - 0.5, 0.22, 1.6, W/4, mattY + 0.36, L/2 - 1.6, 0.06, 2);
    rbox(mat.towel, W/2 - 0.5, 0.10, 1.55, W/4, mattY + 0.56, L/2 - 1.62, 0.04, 2);

    // ─────────────────────────────────────────────────────────────
    // 12. UNDER-BED STORAGE BOX — HDPE 100L, PIN lock, pull-out
    //    Prominent in front view between bed and corridor wall
    // ─────────────────────────────────────────────────────────────
    const drZ = L * 0.33;
    rbox(mat.hdpe,     W - 0.5, 0.72, L * 0.40, 0, -H/2 + 0.36, drZ, 0.06, 3);
    rbox(mat.hdpeFace, W - 0.5, 0.72, 0.10, 0, -H/2 + 0.36, drZ + L * 0.20 + 0.05, 0.06, 3);
    // Handle bar (capsule via rbox)
    rbox(mat.metal, 1.50, 0.085, 0.085, 0, -H/2 + 0.36, drZ + L * 0.20 + 0.10, 0.042, 3);
    // PIN pad
    rbox(mat.panel, 0.52, 0.36, 0.04, W/2 - 1.15, -H/2 + 0.36, drZ + L * 0.20 + 0.07, 0.02, 2);

    // ─────────────────────────────────────────────────────────────
    // 13. PRIVACY SHUTTER — PP polymer, rolldown 45% deployed
    //    Annotated with ventilation slits
    // ─────────────────────────────────────────────────────────────
    rbox(mat.shutter, W + T*0.5, 0.52, T*0.85, 0, H/2 - 0.22, L/2 + T/2, 0.10, 3); // housing
    const slatN = 9, dropH = H * 0.45, slatH = dropH / slatN;
    for (let i = 0; i < slatN; i++) {
      box(mat.shutSlat, W + T*0.5, slatH - 0.04, 0.11,
        0, H/2 - 0.52 - i*slatH - slatH/2, L/2 + T/2 + 0.055);
      // Vent slits
      box(new THREE.MeshStandardMaterial({color:0x0c0e14,metalness:0.3}),
        W + T*0.5 - 0.25, 0.022, 0.008,
        0, H/2 - 0.52 - i*slatH - slatH*0.68, L/2 + T/2 + 0.11);
    }

    // ─────────────────────────────────────────────────────────────
    // 14. INNER PRIVACY CURTAIN — soft fabric
    // ─────────────────────────────────────────────────────────────
    box(mat.curtain, W - 0.18, H * 0.52, 0.035, 0, H/2 - H*0.52/2 - 0.28, L/2 - 0.55);

    // ─────────────────────────────────────────────────────────────
    // 15. STUDY LAMP — warm-white LED, side panel (right wall)
    // ─────────────────────────────────────────────────────────────
    const lx = W/2 - 0.26, ly = mattY + 0.95, lz = -L/2 + 5.2;
    cyl(mat.lampBody, 0.045, 0.82, lx, ly, lz);
    const lh = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.13, 0.30, 3, 0.06), mat.lampBody);
    lh.position.set(lx - 0.20, ly + 0.42, lz); lh.rotation.z = -0.28;
    lh.castShadow = true; pod.add(lh);
    rbox(mat.lampGlow, 0.40, 0.06, 0.22, lx - 0.20, ly + 0.42, lz, 0.025, 2);

    // ─────────────────────────────────────────────────────────────
    // 16. FOLDABLE TABLE — Al frame + MDF (40×30 cm, shown extended, left side)
    // ─────────────────────────────────────────────────────────────
    const tx = -(W/2 - 0.26), ty = mattY + 0.58, tz = L/2 - 4.6;
    rbox(mat.tableTop, 3.8, 0.085, 2.85, tx + 1.65, ty, tz, 0.04, 2);
    rbox(mat.tableAlu, 0.065, 0.055, 2.85, tx + 0.10, ty - 0.075, tz, 0.025, 2);
    rbox(mat.metal, 0.13, 0.34, 0.13, tx, ty - 0.055, tz, 0.05, 2);

    // ─────────────────────────────────────────────────────────────
    // 17. READING SHELF — mesh, phone/glasses
    // ─────────────────────────────────────────────────────────────
    rbox(mat.meshShelf, W - 0.55, 0.06, 1.05, 0, mattY + 0.82, -L/2 + 4.1, 0.03, 2);
    rbox(mat.metal, W - 0.55, 0.11, 0.055, 0, mattY + 0.77, -L/2 + 4.62, 0.025, 2);
    // Small items on the shelf (visible in 360° interior view)
    // Phone
    rbox(new THREE.MeshPhysicalMaterial({ color:0x1a1d24, metalness:0.4, roughness:0.25, clearcoat:0.6 }),
      0.78, 0.055, 1.6, 1.6, mattY + 0.86, -L/2 + 4.1, 0.06, 2);
    // Phone screen highlight
    box(new THREE.MeshStandardMaterial({ color:0x0a1424, emissive:0x224488, emissiveIntensity:0.6, roughness:0.18 }),
      0.68, 0.005, 1.45, 1.6, mattY + 0.89, -L/2 + 4.1);
    // Glasses case
    rbox(new THREE.MeshPhysicalMaterial({ color:0x2a3140, metalness:0.3, roughness:0.4, clearcoat:0.4 }),
      1.8, 0.18, 0.55, -1.4, mattY + 0.91, -L/2 + 4.1, 0.07, 2);

    // ─────────────────────────────────────────────────────────────
    // 18. USB + POWER PANEL (right inner wall)
    // ─────────────────────────────────────────────────────────────
    const px = W/2 - 0.11, py = mattY + 0.22, pz = -L/2 + 5.5;
    box(mat.panel, 0.055, 0.98, 1.75, px, py, pz);
    [[0, -0.40], [0, 0.0], [0, 0.40]].forEach(([, dz], i) =>
      box(mat.usb, 0.028, i<2?0.13:0.09, i<2?0.21:0.26, px+0.028, py+0.27, pz+dz)
    );
    box(mat.usb, 0.028, 0.30, 0.30, px+0.028, py-0.20, pz+0.08); // 5-pin socket

    // ─────────────────────────────────────────────────────────────
    // 19. ETHERNET PORT RJ45
    // ─────────────────────────────────────────────────────────────
    box(mat.panel, 0.055, 0.17, 0.24, px+0.028, py-0.50, pz-0.28);

    // ─────────────────────────────────────────────────────────────
    // 20. PERSONAL AC VENT DIAL — cylinder, left wall top-front
    // ─────────────────────────────────────────────────────────────
    cyl(mat.metal, 0.17, 0.055, -W/2 + 0.16, H/2 - 0.48, L/2 - 1.15, 0, Math.PI/2);

    // ─────────────────────────────────────────────────────────────
    // 21. A/C VENTS — top row (galvanised steel ducting)
    //    Prominent horizontal grilles in side view & top view
    // ─────────────────────────────────────────────────────────────
    [-3, -1.5, 0, 1.5, 3].forEach(vx => {
      box(mat.galv, 0.85, 0.095, 0.26, vx, H/2 - 0.15, L/2 - 0.88);
      box(mat.shell, 0.70, 0.028, 0.24, vx, H/2 - 0.15, L/2 - 0.88);
    });
    // Side bottom vents (corridor wall side)
    box(mat.galv, 0.095, 0.50, 1.85, W/2 - 0.17, -H/2 + 0.60, L/2 - 1.38);
    box(mat.galv, 0.095, 0.50, 1.85, -W/2 + 0.17, -H/2 + 0.60, L/2 - 1.38);

    // ─────────────────────────────────────────────────────────────
    // 22. REAR COMPOSITE PANEL + ACCESS PANEL + POWER PORT + VENTING DUCTS
    //    Matches back view exactly
    // ─────────────────────────────────────────────────────────────
    // Rear composite panel (lighter inset)
    box(mat.rear,  W - 0.55, H - 0.85, 0.055, 0, 0.25, -L/2 - T*0.62);
    // Access panel for maintenance (upper inset)
    box(mat.rearDk, W * 0.44, H * 0.33, 0.038, 0, 1.0, -L/2 - T*0.84);
    // Access panel label line
    box(mat.metal, W * 0.44, 0.022, 0.02, 0, 1.0 + H*0.165, -L/2 - T*0.88);
    box(mat.metal, W * 0.44, 0.022, 0.02, 0, 1.0 - H*0.165, -L/2 - T*0.88);
    // Power/Data connection port (square, center-right area)
    box(mat.panel, 0.62, 0.62, 0.075, 2.1, -1.55, -L/2 - T*0.84);
    box(mat.usb, 0.32, 0.32, 0.038, 2.1, -1.55, -L/2 - T*0.94);
    // Rear venting ducts — horizontal strips at bottom (matches back view)
    box(mat.galv, W - 0.55, 0.12, T*0.45, 0, -H/2 - T*0.35, -L/2 - T*0.70);
    box(mat.galv, W - 0.55, 0.08, T*0.45, 0, -H/2 - T*0.55, -L/2 - T*0.70);
    box(mat.galv, W - 0.55, 0.05, T*0.45, 0, -H/2 - T*0.70, -L/2 - T*0.70);

    // ─────────────────────────────────────────────────────────────
    // 23. B1 ILLUMINATED UNIT NUMBER — blue glow on front face (matches front view)
    // ─────────────────────────────────────────────────────────────
    const b1c = document.createElement('canvas');
    b1c.width = 400; b1c.height = 200;
    const bCtx = b1c.getContext('2d');
    // Dark background with subtle gradient
    const bg = bCtx.createLinearGradient(0, 0, 0, 200);
    bg.addColorStop(0, '#080c1e'); bg.addColorStop(1, '#040810');
    bCtx.fillStyle = bg; bCtx.fillRect(0, 0, 400, 200);
    // Glowing B1
    bCtx.shadowColor = '#4488ff'; bCtx.shadowBlur = 40;
    bCtx.fillStyle = '#aaccff';
    bCtx.font = 'bold 130px "Courier New", monospace';
    bCtx.textAlign = 'center'; bCtx.textBaseline = 'middle';
    bCtx.fillText('B1', 200, 108);
    const b1m = new THREE.Mesh(
      new THREE.PlaneGeometry(4.0, 2.0),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(b1c), transparent: true })
    );
    b1m.position.set(0, -H/2 + 1.65, L/2 + T + 0.015);
    pod.add(b1m);

    // ─────────────────────────────────────────────────────────────
    // 23b. INTERIOR DETAIL ACCENTS — visible in 360° interior spatial view
    // ─────────────────────────────────────────────────────────────
    // Water bottle on left side of mesh shelf
    cyl(new THREE.MeshPhysicalMaterial({
      color:0x9fc8e8, transmission:0.6, roughness:0.10, thickness:0.4, ior:1.45,
      metalness:0, clearcoat:0.6, clearcoatRoughness:0.1
    }), 0.20, 0.95, -2.3, mattY + 1.30, -L/2 + 4.1);
    // Bottle cap
    cyl(new THREE.MeshPhysicalMaterial({ color:0x1a242c, metalness:0.7, roughness:0.30 }),
      0.21, 0.10, -2.3, mattY + 1.85, -L/2 + 4.1);

    // Small book on bedside (right side of shelf)
    rbox(new THREE.MeshStandardMaterial({ color:0x8a3a2a, roughness:0.65 }),
      0.95, 0.18, 1.35, -0.6, mattY + 0.94, -L/2 + 4.1, 0.04, 2);
    rbox(new THREE.MeshStandardMaterial({ color:0xf3eadc, roughness:0.95 }),
      0.86, 0.12, 1.26, -0.6, mattY + 0.94, -L/2 + 4.1, 0.02, 2);

    // Wall-mounted info screen (right wall, above USB panel) — branding + time
    const infoC = document.createElement('canvas');
    infoC.width = 512; infoC.height = 256;
    const ix = infoC.getContext('2d');
    const ig = ix.createLinearGradient(0, 0, 0, 256);
    ig.addColorStop(0, '#0c1018'); ig.addColorStop(1, '#0a0e16');
    ix.fillStyle = ig; ix.fillRect(0, 0, 512, 256);
    ix.fillStyle = '#ffcc44'; ix.font = 'bold 30px "Segoe UI", sans-serif';
    ix.fillText('NAPHAUS', 26, 58);
    ix.fillStyle = '#5a6678'; ix.font = '15px "Segoe UI", sans-serif';
    ix.fillText('UNIT B1 · OCCUPIED', 26, 84);
    ix.fillStyle = '#cce0ff'; ix.font = 'bold 86px "Courier New", monospace';
    ix.fillText('22:48', 26, 178);
    ix.fillStyle = '#6a90c8'; ix.font = '15px "Segoe UI", sans-serif';
    ix.fillText('22°C · 38% RH', 26, 210);
    ix.fillStyle = '#1a9966'; ix.font = 'bold 14px "Segoe UI", sans-serif';
    ix.fillText('● DND', 410, 56);
    ix.strokeStyle = '#1e2a3a'; ix.lineWidth = 2;
    ix.strokeRect(8, 8, 496, 240);
    const infoTex = new THREE.CanvasTexture(infoC);
    infoTex.colorSpace = THREE.SRGBColorSpace;
    const infoM = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.2),
      new THREE.MeshBasicMaterial({ map: infoTex, transparent: true })
    );
    infoM.position.set(W/2 - 0.07, mattY + 1.75, -L/2 + 5.5);
    infoM.rotation.y = -Math.PI / 2;
    pod.add(infoM);
    // Bezel around info screen
    rbox(mat.panel, 0.04, 1.32, 2.52, W/2 - 0.09, mattY + 1.75, -L/2 + 5.5, 0.04, 2);

    // Decorative ceiling LED dot accents (warm pin-spots)
    const dotMat = new THREE.MeshStandardMaterial({
      color:0xfff2cc, emissive:0xffcc77, emissiveIntensity:1.4, roughness:0.3
    });
    [-L/2 + 7.5, 0, L/2 - 4.0].forEach(zz => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), dotMat);
      d.position.set(0, H/2 - 0.12, zz); pod.add(d);
    });

    // ─────────────────────────────────────────────────────────────
    // 24. DIMENSION LINES (thin blue, world space)
    // ─────────────────────────────────────────────────────────────
    pod.position.y = H/2 + T;
    interiorWorldRef.current = computeInteriorWorld();

    const lnMat = new THREE.LineBasicMaterial({ color:0x3366cc, transparent:true, opacity:0.45 });
    const mkL = pts => {
      const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(...p)));
      return new THREE.Line(g, lnMat);
    };
    const dimG = new THREE.Group(); scene.add(dimG);
    dimGroupRef.current = dimG;
    const gy = 0.06;
    const dlx = W/2 + T + CR + 2.0;
    const dwz = L/2 + T + CR + 2.0;
    const dhx = -(W/2 + T + CR + 2.0);

    // Length
    dimG.add(mkL([[dlx, gy, -(L/2+T+CR)], [dlx, gy, L/2+T+CR]]));
    dimG.add(mkL([[dlx-.28,gy,-(L/2+T+CR)],[dlx+.28,gy,-(L/2+T+CR)]]));
    dimG.add(mkL([[dlx-.28,gy, L/2+T+CR],[dlx+.28,gy, L/2+T+CR]]));
    // Width
    dimG.add(mkL([[-(W/2+T+CR),gy,dwz],[W/2+T+CR,gy,dwz]]));
    dimG.add(mkL([[-(W/2+T+CR),gy,dwz-.28],[-(W/2+T+CR),gy,dwz+.28]]));
    dimG.add(mkL([[ W/2+T+CR, gy,dwz-.28],[ W/2+T+CR, gy,dwz+.28]]));
    // Height
    dimG.add(mkL([[dhx,0,-(L/2+T+CR)],[dhx,H+T*2+CR*2,-(L/2+T+CR)]]));
    dimG.add(mkL([[dhx-.28,0,-(L/2+T+CR)],[dhx+.28,0,-(L/2+T+CR)]]));
    dimG.add(mkL([[dhx-.28,H+T*2+CR*2,-(L/2+T+CR)],[dhx+.28,H+T*2+CR*2,-(L/2+T+CR)]]));

    // ── Ground + Grid ────────────────────────────────────────────
    // Larger softly-tinted ground with subtle radial vignette via vertex colors
    const groundGeom = new THREE.CircleGeometry(60, 80);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xd6dde6, roughness: 0.78, metalness: 0.0
    });
    const gnd = new THREE.Mesh(groundGeom, groundMat);
    gnd.rotation.x = -Math.PI / 2;
    gnd.receiveShadow = true;
    scene.add(gnd);

    // Subtle reflective pad directly under the pod (premium look)
    const padMat = new THREE.MeshPhysicalMaterial({
      color: 0xc8d2dc, roughness: 0.42, metalness: 0.0, clearcoat: 0.4, clearcoatRoughness: 0.5
    });
    const pad = new THREE.Mesh(new THREE.CircleGeometry(18, 64), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.01;
    pad.receiveShadow = true;
    scene.add(pad);

    // Soft contact-shadow disc (fake AO) under pod
    const aoC = document.createElement('canvas');
    aoC.width = 256; aoC.height = 256;
    const aoX = aoC.getContext('2d');
    const aoG = aoX.createRadialGradient(128, 128, 30, 128, 128, 128);
    aoG.addColorStop(0, 'rgba(0,0,0,0.42)');
    aoG.addColorStop(0.6, 'rgba(0,0,0,0.18)');
    aoG.addColorStop(1, 'rgba(0,0,0,0)');
    aoX.fillStyle = aoG; aoX.fillRect(0, 0, 256, 256);
    const aoTex = new THREE.CanvasTexture(aoC);
    aoTex.colorSpace = THREE.SRGBColorSpace;
    const aoMesh = new THREE.Mesh(
      new THREE.PlaneGeometry((W + T * 2) * 1.7, (L + T * 2) * 1.3),
      new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, opacity: 0.85, depthWrite: false })
    );
    aoMesh.rotation.x = -Math.PI / 2;
    aoMesh.position.y = 0.02;
    scene.add(aoMesh);

    const grid = new THREE.GridHelper(80, 50, 0xb8c2cf, 0xc8d0db);
    grid.material.transparent = true; grid.material.opacity = 0.55;
    grid.position.y = 0.03;
    scene.add(grid);

    // ── Controls ─────────────────────────────────────────────────
    const st = stateRef.current;
    const pointer = (e) => ({ x: e.clientX, y: e.clientY });

    const startTransition = (toMode, dur = 1100) => {
      const cam = cameraRef.current;
      const fromPos = cam.position.clone();
      const fromQuat = cam.quaternion.clone();
      const fromFov = cam.fov;
      // Compute destination
      let toPos, toQuat, toFov;
      if (toMode === "interior") {
        toPos = interiorWorldRef.current.clone();
        toFov = FOV_INTERIOR;
        const cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
        const cy = Math.cos(st.yaw),   sy = Math.sin(st.yaw);
        const tmp = new THREE.Object3D();
        tmp.position.copy(toPos);
        tmp.lookAt(toPos.x + cp * sy, toPos.y + sp, toPos.z + cp * cy);
        toQuat = tmp.quaternion.clone();
      } else {
        const { theta, phi, radius } = st;
        const tgt = targetVec.current;
        toPos = new THREE.Vector3(
          tgt.x + radius * Math.sin(phi) * Math.sin(theta),
          tgt.y + radius * Math.cos(phi),
          tgt.z + radius * Math.sin(phi) * Math.cos(theta)
        );
        toFov = FOV_ORBIT;
        const tmp = new THREE.Object3D();
        tmp.position.copy(toPos);
        tmp.lookAt(tgt);
        toQuat = tmp.quaternion.clone();
      }
      st.trans = {
        t0: performance.now(), dur,
        fromMode: st.mode, toMode,
        fromPos, toPos, fromQuat, toQuat, fromFov, toFov,
      };
    };

    const onD = e => {
      st.isDragging = true;
      st.prev = pointer(e);
    };
    const onM = e => {
      if (!st.isDragging || st.trans) return;
      const p = pointer(e);
      const dx = p.x - st.prev.x, dy = p.y - st.prev.y;
      if (st.mode === "orbit") {
        st.theta -= dx * 0.008;
        st.phi = Math.max(0.04, Math.min(Math.PI * 0.94, st.phi + dy * 0.008));
      } else {
        st.yaw   -= dx * 0.0035;
        st.pitch -= dy * 0.0035;
        // Clamp pitch so user doesn't flip upside-down
        st.pitch = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, st.pitch));
      }
      st.prev = p;
      updateCamera();
    };
    const onU = () => { st.isDragging = false; };
    const onW = e => {
      if (st.trans) return;
      if (st.mode === "orbit") {
        st.radius = Math.max(10, Math.min(68, st.radius + e.deltaY * 0.04));
        updateCamera();
      } else {
        // Zoom by FOV in interior mode
        const cam = cameraRef.current;
        cam.fov = Math.max(45, Math.min(95, cam.fov + e.deltaY * 0.04));
        cam.updateProjectionMatrix();
      }
    };
    let lt = null;
    const onTS = e => { lt = { x:e.touches[0].clientX, y:e.touches[0].clientY }; };
    const onTM = e => {
      if (!lt || st.trans) return;
      const dx = e.touches[0].clientX - lt.x;
      const dy = e.touches[0].clientY - lt.y;
      if (st.mode === "orbit") {
        st.theta -= dx * 0.008;
        st.phi = Math.max(0.04, Math.min(Math.PI * 0.94, st.phi + dy * 0.008));
      } else {
        st.yaw   -= dx * 0.0035;
        st.pitch -= dy * 0.0035;
        st.pitch = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, st.pitch));
      }
      lt = { x:e.touches[0].clientX, y:e.touches[0].clientY };
      updateCamera();
    };

    // Expose transition starter so React handlers can call it
    stateRef.current.start = startTransition;

    el.addEventListener('mousedown', onD);
    window.addEventListener('mousemove', onM);
    window.addEventListener('mouseup', onU);
    el.addEventListener('wheel', onW, { passive:true });
    el.addEventListener('touchstart', onTS, { passive:true });
    el.addEventListener('touchmove', onTM, { passive:true });

    let aid;
    const easeInOut = (t) => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2;
    const tick = () => {
      aid = requestAnimationFrame(tick);
      // Transition tick
      if (st.trans) {
        const tr = st.trans;
        const u = Math.min(1, (performance.now() - tr.t0) / tr.dur);
        const k = easeInOut(u);
        camera.position.lerpVectors(tr.fromPos, tr.toPos, k);
        camera.quaternion.copy(tr.fromQuat).slerp(tr.toQuat, k);
        camera.fov = tr.fromFov + (tr.toFov - tr.fromFov) * k;
        camera.updateProjectionMatrix();
        // Fade dim lines out when entering interior, in when exiting
        if (dimGroupRef.current) {
          const target = tr.toMode === "interior" ? 0 : 1;
          dimGroupRef.current.traverse(o => {
            if (o.material) { o.material.opacity = 0.45 * (tr.fromMode === "interior" ? k : (target ? k : 1 - k)); o.material.transparent = true; }
          });
        }
        if (u >= 1) {
          st.mode = tr.toMode;
          st.trans = null;
          if (dimGroupRef.current) {
            const show = st.mode !== "interior";
            dimGroupRef.current.visible = show;
            dimGroupRef.current.traverse(o => { if (o.material) o.material.opacity = show ? 0.45 : 0; });
          }
        }
      }
      renderer.render(scene, camera);
    };
    tick();

    const onR = () => {
      const w = el.clientWidth, h = el.clientHeight;
      camera.aspect = w/h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    window.addEventListener('resize', onR);

    return () => {
      cancelAnimationFrame(aid);
      el.removeEventListener('mousedown', onD); window.removeEventListener('mousemove', onM);
      window.removeEventListener('mouseup', onU); el.removeEventListener('wheel', onW);
      el.removeEventListener('touchstart', onTS); el.removeEventListener('touchmove', onTM);
      window.removeEventListener('resize', onR);
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      pmrem.dispose();
      renderer.dispose();
    };
  }, [updateCamera, computeInteriorWorld]);

  const setView = (label, t, p, r) => {
    const st = stateRef.current;
    setActiveView(label);
    Object.assign(st, { theta:t, phi:p, radius:r });
    // If currently inside, smoothly exit back to the chosen orbit framing
    if (st.mode === "interior") {
      setInterior(false);
      if (st.start) st.start("orbit");
    } else {
      updateCamera();
    }
  };

  const enterInterior = () => {
    const st = stateRef.current;
    if (st.mode === "interior" || st.trans) return;
    setInterior(true);
    setActiveView("Interior");
    // Reset look angles to a calming neutral pose toward the front of the pod
    st.yaw = 0.05; st.pitch = 0.05;
    setHintFade(1);
    if (st.start) st.start("interior");
    // Fade the helper hint after a few seconds
    setTimeout(() => setHintFade(0), 5200);
  };

  const exitInterior = () => {
    const st = stateRef.current;
    if (st.mode !== "interior" || st.trans) return;
    setInterior(false);
    setActiveView("Perspective");
    Object.assign(st, { theta:0.45, phi:0.60, radius:36 });
    if (st.start) st.start("orbit");
  };

  const VIEWS = [
    { label:"Perspective", t:0.45,          p:0.60,        r:36 },
    { label:"Front",       t:0,             p:Math.PI/2,   r:28 },
    { label:"Left",        t:Math.PI/2,     p:Math.PI/2,   r:28 },
    { label:"Top",         t:0.45,          p:0.05,        r:30 },
    { label:"Back",        t:Math.PI,       p:Math.PI/2,   r:28 },
  ];

  const DIMS = [
    { axis:"L", label:"LENGTH",  val:"220 cm", imp:"7′ 2″",  col:"#1e6ecc" },
    { axis:"W", label:"WIDTH",   val:"90 cm",  imp:"2′ 11″", col:"#1a9966" },
    { axis:"H", label:"HEIGHT",  val:"100 cm", imp:"3′ 3″",  col:"#cc6611" },
  ];

  const FEATURES = [
    { name:"Rounded Alloy Frame",   note:"Prominent corner rounding — signature pod silhouette", col:"#1e6ecc" },
    { name:"Privacy Shutter",       note:"Motorized PP polymer rolldown, ventilation slits",     col:"#1a9966" },
    { name:"Overhead Storage Shelf",note:"Dark canopy section with cable shelf at head end",     col:"#cc6611" },
    { name:"Internal Oak Finish",   note:"Warm honey-oak ABS lining, full interior walls",      col:"#1e6ecc" },
    { name:"Leather Headboard",     note:"Caramel leather panel with double stitching detail",   col:"#1a9966" },
    { name:"Thick Insulating Walls",note:"~7.5 cm walls, acoustic + thermal — spatial design",  col:"#cc6611" },
    { name:"HD Foam Mattress",      note:"10 cm thickness, washable cover, birch plywood base", col:"#1e6ecc" },
    { name:"100L HDPE Storage",     note:"Pull-out under-bed box, PIN-locked, 100L capacity",   col:"#1a9966" },
    { name:"Bedding Stack",         note:"Blanket + folded items at foot — side view layout",   col:"#cc6611" },
    { name:"LED Ambient Strip",     note:"3,000K warm-white behind canopy lip, dimmable",       col:"#1e6ecc" },
    { name:"USB + Power Panel",     note:"2×USB-A, USB-C fast-charge, 5-pin Indian socket",    col:"#1a9966" },
    { name:"A/C Vents + Dial",      note:"5 top-row grilles + personal flow control dial",      col:"#cc6611" },
  ];

  const ANNOT = [
    // Front view annotations (matching spatial design exactly)
    ["Round Alloy Frame", "Rounded corner cylinders, charcoal steel"],
    ["Internal Oak Finish", "Honey-gold ABS + oak panels inside"],
    ["Bedding Stack", "White pillows + folded blanket arrangement"],
    ["Illuminated B1", "Blue-glow unit number on front face"],
    ["Under Bed Storage Box", "HDPE pull-out, PIN-lock, 100L"],
    // Side view
    ["AC Vents", "5× galvanised steel grilles at top"],
    ["Storage Shelf", "Vertical oak panel at head-end wall"],
    ["Pillow Stack", "2×head, folded items at foot"],
    ["Pull-out Bed Box", "HDPE drawer, full bed width"],
    ["Corridor Wall Structure", "Thick insulating wall at front"],
    // Back view
    ["Rear Composite Panel", "Gray inset panel, maintenance access"],
    ["Power/Data Connection Port", "Square panel, center-right position"],
    ["Rear Venting Ducts", "3× horizontal galvanised ducts"],
  ];

  const C = {
    bg:"#f0f3f8", hdr:"#ffffff", card:"#ffffff",
    bdr:"#d8dfe8", txt:"#1a2030", mut:"#6a7a90", acc:"#1e6ecc"
  };

  return (
    <div style={{ width:"100%", height:"100vh", display:"flex", flexDirection:"column",
      background:C.bg, fontFamily:"'Segoe UI',system-ui,sans-serif", overflow:"hidden" }}>

      {/* ── HEADER ── */}
      <div style={{ background:C.hdr, borderBottom:`1px solid ${C.bdr}`, padding:"10px 18px",
        display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0,
        boxShadow:"0 1px 5px rgba(0,0,0,0.07)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:34, height:34, borderRadius:8, background:"#1a1d24",
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"#ffcc44", fontWeight:900, fontSize:16, letterSpacing:0 }}>N</div>
          <div>
            <div style={{ color:C.txt, fontSize:15, fontWeight:700 }}>
              NAPHAUS — Sleep Pod Unit B1
            </div>
            <div style={{ color:C.mut, fontSize:10, marginTop:1 }}>
              Spatial Design · Sleeping Pod Cafe · Principles of Design · Rishihood University
            </div>
          </div>
          <span style={{ padding:"2px 9px", background:"#e8f0fa", border:`1px solid #c0d4ee`,
            borderRadius:4, color:C.acc, fontSize:10, fontWeight:600 }}>3D PROTOTYPE</span>
        </div>
        <div style={{ color:"#b0bac8", fontSize:10, letterSpacing:0.3 }}>
          {interior
            ? "INSIDE 360°  ·  DRAG TO LOOK  ·  SCROLL TO ZOOM"
            : "DRAG TO ROTATE  ·  SCROLL TO ZOOM  ·  STEP INSIDE FOR 360°"}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>

        {/* LEFT PANEL — Dimensions + Features */}
        <div style={{ width:218, background:C.card, borderRight:`1px solid ${C.bdr}`,
          display:"flex", flexDirection:"column", overflow:"hidden", flexShrink:0 }}>

          {/* Dimensions */}
          <div style={{ padding:"12px 13px 10px", borderBottom:`1px solid ${C.bdr}` }}>
            <div style={{ color:C.mut, fontSize:9.5, fontWeight:600, letterSpacing:1.5,
              marginBottom:9, textTransform:"uppercase" }}>Pod Dimensions</div>
            {DIMS.map(d => (
              <div key={d.axis} style={{ display:"flex", alignItems:"center", gap:8,
                padding:"6px 0", borderBottom:`1px solid #f0f3f8` }}>
                <div style={{ width:28, height:28, borderRadius:6,
                  background:`${d.col}14`, border:`1px solid ${d.col}38`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color:d.col, fontWeight:700, fontSize:12 }}>{d.axis}</div>
                <div>
                  <div style={{ color:C.txt, fontSize:13.5, fontWeight:700 }}>{d.val}</div>
                  <div style={{ color:C.mut, fontSize:9.5 }}>{d.label} · {d.imp}</div>
                </div>
              </div>
            ))}
            <div style={{ marginTop:7, padding:"5px 9px", background:"#f5f8fd",
              border:`1px solid #dce8f5`, borderRadius:5, color:C.mut, fontSize:9.5 }}>
              Max occupant: <strong style={{color:C.txt}}>6′2″ (188 cm)</strong>
              &nbsp;·&nbsp; Wall: <strong style={{color:C.txt}}>~7.5 cm</strong>
            </div>
          </div>

          {/* Features */}
          <div style={{ flex:1, overflow:"auto", padding:"10px 13px" }}>
            <div style={{ color:C.mut, fontSize:9.5, fontWeight:600, letterSpacing:1.5,
              marginBottom:8, textTransform:"uppercase" }}>Spatial Design Components</div>
            {FEATURES.map((f, i) => (
              <div key={i}
                onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
                style={{ display:"flex", alignItems:"flex-start", gap:7, padding:"4px 5px",
                  marginBottom:2, borderRadius:4, cursor:"default", transition:"background 0.12s",
                  background:hov===i?`${f.col}0c`:"transparent",
                  borderLeft:hov===i?`2px solid ${f.col}`:"2px solid transparent" }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:f.col,
                  marginTop:4, flexShrink:0 }} />
                <div>
                  <div style={{ color:C.txt, fontSize:10.5, fontWeight:600, lineHeight:1.3 }}>{f.name}</div>
                  <div style={{ color:C.mut, fontSize:9, lineHeight:1.4, marginTop:1 }}>{f.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 3D CANVAS ── */}
        <div ref={mountRef} style={{
          flex:1,
          cursor: interior ? "grab" : "grab",
          position:"relative",
          background: interior ? "#0c1018" : "transparent",
          transition: "background 0.7s ease",
        }}>
          {/* Pricing overlay — hidden when inside for immersive 360° view */}
          <div style={{ position:"absolute", top:12, left:12, pointerEvents:"none",
            display:"flex", flexDirection:"column", gap:3,
            opacity: interior ? 0 : 1, transition: "opacity 0.5s ease" }}>
            {[["3 hr","₹ 150"],["6 hr","₹ 250"],["12 hr","₹ 399"],["24 hr","₹ 650"]].map(([s,p]) => (
              <div key={s} style={{ display:"flex", alignItems:"center", gap:6,
                background:"rgba(255,255,255,0.94)", border:`1px solid ${C.bdr}`,
                borderRadius:5, padding:"3px 9px", backdropFilter:"blur(6px)" }}>
                <span style={{ color:C.mut, fontSize:9.5, width:28 }}>{s}</span>
                <span style={{ color:C.acc, fontSize:12.5, fontWeight:700 }}>{p}</span>
              </div>
            ))}
          </div>

          {/* Scale tag — hidden inside */}
          <div style={{ position:"absolute", top:12, right:12, pointerEvents:"none",
            background:"rgba(255,255,255,0.90)", border:`1px solid ${C.bdr}`,
            borderRadius:5, padding:"4px 10px", color:C.mut, fontSize:9.5,
            opacity: interior ? 0 : 1, transition: "opacity 0.5s ease" }}>
            1 unit = 10 cm&nbsp;·&nbsp;220 × 90 × 100 cm interior
          </div>

          {/* Step Inside CTA — visible in orbit mode */}
          {!interior && (
            <button onClick={enterInterior} style={{
              position:"absolute", bottom:60, right:16,
              padding:"9px 16px",
              background:"linear-gradient(135deg,#1a1d24 0%,#2a2f3a 100%)",
              color:"#ffcc44",
              border:"1px solid #1a1d24",
              borderRadius:8, cursor:"pointer",
              fontFamily:"inherit", fontSize:12, fontWeight:700, letterSpacing:0.6,
              boxShadow:"0 4px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)",
              display:"flex", alignItems:"center", gap:8,
              transition:"transform 0.15s ease, box-shadow 0.15s ease"
            }}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)"; e.currentTarget.style.boxShadow="0 6px 22px rgba(0,0,0,0.24)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow="0 4px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)";}}
            >
              <span style={{
                display:"inline-block", width:10, height:10, borderRadius:"50%",
                background:"#ffcc44", boxShadow:"0 0 8px #ffcc44"
              }} />
              STEP INSIDE — 360° VIEW
            </button>
          )}

          {/* Interior — Exit button (top-right) */}
          {interior && (
            <button onClick={exitInterior} style={{
              position:"absolute", top:14, right:14,
              padding:"8px 14px",
              background:"rgba(20,24,32,0.78)",
              color:"#ffcc44",
              border:"1px solid rgba(255,255,255,0.15)",
              borderRadius:8, cursor:"pointer",
              fontFamily:"inherit", fontSize:11, fontWeight:700, letterSpacing:0.6,
              backdropFilter:"blur(8px)",
              boxShadow:"0 4px 14px rgba(0,0,0,0.30)",
              display:"flex", alignItems:"center", gap:8,
            }}>
              <span style={{ fontSize:14, lineHeight:1 }}>×</span>
              EXIT INTERIOR
            </button>
          )}

          {/* Interior status pill (top-left) */}
          {interior && (
            <div style={{
              position:"absolute", top:14, left:14, pointerEvents:"none",
              padding:"6px 12px",
              background:"rgba(20,24,32,0.72)",
              color:"#cce0ff",
              border:"1px solid rgba(255,255,255,0.10)",
              borderRadius:20,
              fontSize:10.5, fontWeight:600, letterSpacing:1.5,
              backdropFilter:"blur(8px)",
              display:"flex", alignItems:"center", gap:8,
            }}>
              <span style={{
                display:"inline-block", width:7, height:7, borderRadius:"50%",
                background:"#1a9966", boxShadow:"0 0 6px #1a9966"
              }} />
              INTERIOR 360°  ·  UNIT B1
            </div>
          )}

          {/* Interior hint — auto-fades after a few seconds */}
          {interior && (
            <div style={{
              position:"absolute", bottom:72, left:"50%", transform:"translateX(-50%)",
              pointerEvents:"none",
              padding:"10px 18px",
              background:"rgba(20,24,32,0.78)",
              color:"#e8eef8",
              border:"1px solid rgba(255,255,255,0.12)",
              borderRadius:10,
              fontSize:11, letterSpacing:0.5,
              backdropFilter:"blur(8px)",
              opacity: hintFade, transition: "opacity 1.2s ease",
              display:"flex", alignItems:"center", gap:14, whiteSpace:"nowrap"
            }}>
              <span><strong style={{color:"#ffcc44"}}>DRAG</strong> &nbsp;to look around</span>
              <span style={{color:"#3a4254"}}>|</span>
              <span><strong style={{color:"#ffcc44"}}>SCROLL</strong> &nbsp;to zoom (FOV)</span>
              <span style={{color:"#3a4254"}}>|</span>
              <span><strong style={{color:"#ffcc44"}}>EXIT</strong> &nbsp;top-right</span>
            </div>
          )}

          {/* Bottom note — orbit mode */}
          {!interior && (
            <div style={{ position:"absolute", bottom:60, left:"50%", transform:"translateX(-50%)",
              pointerEvents:"none", background:"rgba(255,255,255,0.90)", border:`1px solid ${C.bdr}`,
              borderRadius:5, padding:"4px 13px", color:C.mut, fontSize:9.5, whiteSpace:"nowrap" }}>
              Shutter 45% deployed · Foldable table extended · Spatial Design matched
            </div>
          )}
        </div>

        {/* RIGHT PANEL — Annotations + Materials */}
        <div style={{ width:210, background:C.card, borderLeft:`1px solid ${C.bdr}`,
          display:"flex", flexDirection:"column", overflow:"hidden", flexShrink:0 }}>

          {/* Spatial design annotations */}
          <div style={{ padding:"12px 13px 8px", borderBottom:`1px solid ${C.bdr}` }}>
            <div style={{ color:C.mut, fontSize:9.5, fontWeight:600, letterSpacing:1.5,
              marginBottom:8, textTransform:"uppercase" }}>Spatial Design Annotations</div>
            {ANNOT.map(([label, desc], i) => (
              <div key={i} style={{ padding:"4px 0", borderBottom:`1px solid #f0f3f8` }}>
                <div style={{ color:C.acc, fontSize:10, fontWeight:600 }}>{label}</div>
                <div style={{ color:C.mut, fontSize:9, marginTop:1, lineHeight:1.4 }}>{desc}</div>
              </div>
            ))}
          </div>

          {/* Pricing comparison + add-ons */}
          <div style={{ padding:"10px 13px", flex:1, overflow:"auto" }}>
            <div style={{ color:C.mut, fontSize:9.5, fontWeight:600, letterSpacing:1.5,
              marginBottom:8, textTransform:"uppercase" }}>Add-ons</div>
            {[["Premium Shower Kit","₹ 80"],["Meal Coupon (Cafe)","₹ 120"],
              ["Extra Blanket","₹ 30"],["Wi-Fi 100 Mbps","₹ 40/slot"]].map(([n,p]) => (
              <div key={n} style={{ display:"flex", justifyContent:"space-between",
                padding:"5px 0", borderBottom:`1px solid #f0f3f8`, alignItems:"center" }}>
                <span style={{ color:C.txt, fontSize:9.5 }}>{n}</span>
                <span style={{ color:"#1a9966", fontSize:11, fontWeight:700 }}>{p}</span>
              </div>
            ))}

            <div style={{ marginTop:10, padding:"9px", background:"#f0f7ff",
              border:`1px solid #c8ddf5`, borderRadius:7 }}>
              <div style={{ color:C.acc, fontSize:9.5, fontWeight:600, marginBottom:3 }}>
                vs. Hotel Room
              </div>
              <div style={{ color:C.txt, fontSize:10.5, lineHeight:1.6 }}>
                Budget hotel: <strong>₹ 1,500–4,000</strong>/night<br/>
                NAPHAUS 6 hr: <strong style={{color:"#1a9966"}}>₹ 250</strong><br/>
                <span style={{ color:"#1a9966", fontWeight:700 }}>Save 80–90%</span>
              </div>
            </div>

            <div style={{ marginTop:9, padding:"9px", background:"#f8f9fb",
              border:`1px solid ${C.bdr}`, borderRadius:7 }}>
              <div style={{ color:C.mut, fontSize:9.5, fontWeight:600, marginBottom:5 }}>
                DESIGN PRINCIPLES
              </div>
              {["Function-Forward Space","Dignity in Minimalism","Adaptive Reuse Potential"].map(p => (
                <div key={p} style={{ display:"flex", gap:5, alignItems:"flex-start", marginBottom:4 }}>
                  <span style={{ color:C.acc, fontSize:10, marginTop:1 }}>·</span>
                  <span style={{ color:C.mut, fontSize:9.5, lineHeight:1.5 }}>{p}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop:9, padding:"9px", background:"#fff8f0",
              border:`1px solid #f0dcc8`, borderRadius:7 }}>
              <div style={{ color:"#cc6611", fontSize:9.5, fontWeight:600, marginBottom:5 }}>
                LOCATION STRATEGY
              </div>
              {["Railway stations & bus terminals","Tourist & heritage sites",
                "Pilgrimage towns","University & exam clusters","Airport landside zones"].map(l => (
                <div key={l} style={{ color:C.mut, fontSize:9, lineHeight:1.5,
                  paddingLeft:7, borderLeft:"2px solid #f0c890", marginBottom:3 }}>{l}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── VIEW CONTROLS ── */}
      <div style={{ background:C.hdr, borderTop:`1px solid ${C.bdr}`, padding:"8px 18px",
        display:"flex", gap:5, alignItems:"center", flexShrink:0 }}>
        <span style={{ color:C.mut, fontSize:9.5, fontWeight:600, letterSpacing:1, marginRight:5 }}>VIEW</span>
        {VIEWS.map(v => (
          <button key={v.label} onClick={() => setView(v.label, v.t, v.p, v.r)} style={{
            padding:"5px 13px",
            background:activeView===v.label?"#1a1d24":"#f0f4fa",
            color:activeView===v.label?"#ffcc44":C.mut,
            border:`1px solid ${activeView===v.label?"#1a1d24":C.bdr}`,
            borderRadius:5, cursor:"pointer", fontFamily:"inherit",
            fontSize:10.5, fontWeight:600, transition:"all 0.14s", letterSpacing:0.3
          }}>{v.label}</button>
        ))}
        <span style={{ width:1, height:18, background:C.bdr, margin:"0 6px" }} />
        <button onClick={interior ? exitInterior : enterInterior} style={{
          padding:"5px 13px",
          background: interior ? "#ffcc44" : "#1a1d24",
          color: interior ? "#1a1d24" : "#ffcc44",
          border:`1px solid ${interior ? "#e6b836" : "#1a1d24"}`,
          borderRadius:5, cursor:"pointer", fontFamily:"inherit",
          fontSize:10.5, fontWeight:700, letterSpacing:0.5,
          display:"flex", alignItems:"center", gap:6, transition:"all 0.14s"
        }}>
          <span style={{
            display:"inline-block", width:7, height:7, borderRadius:"50%",
            background: interior ? "#1a1d24" : "#ffcc44",
            boxShadow: interior ? "none" : "0 0 6px #ffcc44"
          }} />
          {interior ? "EXIT INTERIOR" : "INTERIOR 360°"}
        </button>
        <div style={{ marginLeft:"auto", color:"#c0c8d4", fontSize:9.5 }}>
          NAPHAUS · Spatial Design · Rishihood University
        </div>
      </div>
    </div>
  );
}