import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";

// Scale: 1 unit = 10cm
const L = 22;  // 220cm depth
const W = 9;   // 90cm width
const H = 10;  // 100cm height
const T = 0.45; // wall thickness ~4.5cm

export default function SleepPod3D() {
  const mountRef = useRef(null);
  const stateRef = useRef({ theta: 0.55, phi: 0.6, radius: 34, isDragging: false, prevMouse: null });
  const cameraRef = useRef(null);
  const target = useRef(new THREE.Vector3(0, H / 2 + T, 0));
  const [activeView, setActiveView] = useState("Perspective");

  const updateCamera = useCallback(() => {
    const { theta, phi, radius } = stateRef.current;
    const cam = cameraRef.current;
    if (!cam) return;
    const tgt = target.current;
    cam.position.x = tgt.x + radius * Math.sin(phi) * Math.sin(theta);
    cam.position.y = tgt.y + radius * Math.cos(phi);
    cam.position.z = tgt.z + radius * Math.sin(phi) * Math.cos(theta);
    cam.lookAt(tgt);
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    const cW = container.clientWidth, cH = container.clientHeight;

    // ── SCENE ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d12);
    scene.fog = new THREE.FogExp2(0x0b0d12, 0.018);

    // ── CAMERA ──
    const camera = new THREE.PerspectiveCamera(36, cW / cH, 0.1, 300);
    cameraRef.current = camera;
    updateCamera();

    // ── RENDERER ──
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(cW, cH);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    container.appendChild(renderer.domElement);

    // ── LIGHTING ──
    scene.add(new THREE.AmbientLight(0x2233558, 1.0));

    const sun = new THREE.DirectionalLight(0xfff5e8, 2.2);
    sun.position.set(18, 28, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    [-22, 22].forEach(v => {
      sun.shadow.camera.left = sun.shadow.camera.bottom = v;
      sun.shadow.camera.right = sun.shadow.camera.top = -v;
    });
    scene.add(sun);

    const rimLight = new THREE.DirectionalLight(0x3355aa, 0.7);
    rimLight.position.set(-12, 8, -10);
    scene.add(rimLight);

    // Warm LED glow inside pod
    const ledGlow = new THREE.PointLight(0xff9944, 2.0, 22);
    ledGlow.position.set(0, H / 2 + T - 1.8, -L / 2 + 2.2);
    scene.add(ledGlow);

    // Subtle footlight
    const footLight = new THREE.PointLight(0x4466ff, 0.5, 14);
    footLight.position.set(0, -H / 2 + T + 0.3, L / 2 - 1);
    scene.add(footLight);

    // ── MATERIALS ──
    const mat = {
      frame:    new THREE.MeshStandardMaterial({ color: 0x181820, metalness: 0.9, roughness: 0.12 }),
      frameRim: new THREE.MeshStandardMaterial({ color: 0x2a2a38, metalness: 0.85, roughness: 0.2 }),
      oak:      new THREE.MeshStandardMaterial({ color: 0xc08030, roughness: 0.62, metalness: 0.0 }),
      oakDark:  new THREE.MeshStandardMaterial({ color: 0x9a6520, roughness: 0.7 }),
      mattress: new THREE.MeshStandardMaterial({ color: 0xf4efea, roughness: 0.96 }),
      pillow:   new THREE.MeshStandardMaterial({ color: 0xfdfbf8, roughness: 1.0 }),
      storage:  new THREE.MeshStandardMaterial({ color: 0x22222e, roughness: 0.55, metalness: 0.25 }),
      vent:     new THREE.MeshStandardMaterial({ color: 0x0e0e14, roughness: 0.2, metalness: 0.75 }),
      led:      new THREE.MeshStandardMaterial({ color: 0xff8833, emissive: 0xff6600, emissiveIntensity: 3.0, roughness: 0.3 }),
      leather:  new THREE.MeshStandardMaterial({ color: 0xd4a030, roughness: 0.45, metalness: 0.08 }),
      blanket:  new THREE.MeshStandardMaterial({ color: 0xe0d8c8, roughness: 0.98 }),
      port:     new THREE.MeshStandardMaterial({ color: 0x282835, metalness: 0.92, roughness: 0.15 }),
      rear:     new THREE.MeshStandardMaterial({ color: 0x1a1a26, roughness: 0.4, metalness: 0.3 }),
    };

    const pod = new THREE.Group();
    scene.add(pod);

    const box = (m, w, h, d, x, y, z, ry = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pod.add(mesh);
      return mesh;
    };

    // ════════════════════════════════════════
    // OUTER SHELL
    // ════════════════════════════════════════
    // Top slab
    box(mat.frame, W + T*2, T, L + T*2, 0, H/2 + T/2, 0);
    // Bottom slab
    box(mat.frame, W + T*2, T, L + T*2, 0, -H/2 - T/2, 0);
    // Left wall
    box(mat.frame, T, H, L + T*2, -W/2 - T/2, 0, 0);
    // Right wall
    box(mat.frame, T, H, L + T*2, W/2 + T/2, 0, 0);
    // Rear wall (solid)
    box(mat.frame, W + T*2, H + T*2, T, 0, 0, -L/2 - T/2);

    // Front opening frame — top bar
    box(mat.frameRim, W + T*2, T * 1.8, T, 0, H/2 - T*0.4, L/2 + T/2);
    // Bottom bar
    box(mat.frameRim, W + T*2, T * 1.8, T, 0, -H/2 + T*0.4, L/2 + T/2);
    // Left post
    box(mat.frameRim, T, H - T*3.6, T, -W/2 - T/2, 0, L/2 + T/2);
    // Right post
    box(mat.frameRim, T, H - T*3.6, T, W/2 + T/2, 0, L/2 + T/2);

    // ════════════════════════════════════════
    // INTERIOR SURFACES
    // ════════════════════════════════════════
    box(mat.oak, W, 0.06, L, 0, -H/2 + 0.03, 0);               // floor
    box(mat.storage, W, 0.05, L, 0, H/2 - 0.025, 0);            // ceiling (dark)
    box(mat.oak, 0.04, H, L, -W/2 + 0.02, 0, 0);                // left inner wall
    box(mat.oak, 0.04, H, L, W/2 - 0.02, 0, 0);                 // right inner wall
    box(mat.oak, W, H, 0.04, 0, 0, -L/2 + 0.02);                // back inner wall

    // ════════════════════════════════════════
    // LED STRIP (glowing amber)
    // ════════════════════════════════════════
    box(mat.led, W - 0.5, 0.1, 0.1, 0, H/2 - 1.15, -L/2 + 1.5);

    // ════════════════════════════════════════
    // OVERHEAD HEADBOARD STORAGE SHELF
    // ════════════════════════════════════════
    box(mat.storage, W - 0.3, 0.95, 2.6, 0, H/2 - 0.75, -L/2 + 1.35);
    // Shelf face detail
    box(mat.frameRim, W - 0.3, 0.08, 0.06, 0, H/2 - 1.2, -L/2 + 2.63);

    // ════════════════════════════════════════
    // BED PLATFORM
    // ════════════════════════════════════════
    const bedBaseY = -H/2 + 0.85;
    box(mat.oak, W - 0.25, 0.85, L * 0.87, 0, bedBaseY, L * 0.045);

    // ════════════════════════════════════════
    // MATTRESS
    // ════════════════════════════════════════
    const mattY = bedBaseY + 0.425 + 0.38;
    box(mat.mattress, W - 0.5, 0.5, L * 0.83, 0, mattY, L * 0.05);

    // Mattress piping edge detail
    box(new THREE.MeshStandardMaterial({color: 0xe8e0d4, roughness: 0.9}),
      W - 0.5, 0.08, L * 0.83 + 0.08, 0, mattY + 0.25, L * 0.05);

    // ════════════════════════════════════════
    // BEDDING / BLANKET STACK (at foot)
    // ════════════════════════════════════════
    box(mat.blanket, W - 0.6, 0.28, 2.2, 0, mattY + 0.37, L/2 - 2.0);
    box(new THREE.MeshStandardMaterial({color: 0xccc5b5, roughness: 0.95}),
      W - 0.65, 0.12, 2.1, 0, mattY + 0.62, L/2 - 2.0);

    // ════════════════════════════════════════
    // PILLOWS (2 × side by side)
    // ════════════════════════════════════════
    const pillowY = mattY + 0.42;
    const pillowZ = -L/2 + 3.1;
    [[ -(W/4 - 0.15), 0.02], [(W/4 - 0.15), -0.02]].forEach(([px, ry]) => {
      const pm = new THREE.Mesh(new THREE.BoxGeometry(W/2 - 0.55, 0.38, 1.9), mat.pillow);
      pm.position.set(px, pillowY, pillowZ);
      pm.rotation.y = ry;
      pm.castShadow = true;
      pod.add(pm);
    });

    // ════════════════════════════════════════
    // HEADBOARD LEATHER PANEL
    // ════════════════════════════════════════
    box(mat.leather, W - 0.4, 2.6, 0.2, 0, mattY + 1.15, -L/2 + 0.22);
    // Leather stitching lines (thin strips)
    [-W/4 + 0.2, W/4 - 0.2].forEach(lx => {
      box(new THREE.MeshStandardMaterial({color: 0xb88820, roughness: 0.5}),
        0.04, 2.5, 0.01, lx, mattY + 1.15, -L/2 + 0.32);
    });

    // ════════════════════════════════════════
    // UNDER-BED STORAGE DRAWER
    // ════════════════════════════════════════
    const drawerZ = L * 0.35;
    box(mat.storage, W - 0.5, 0.72, L * 0.42, 0, -H/2 + 0.36, drawerZ);
    // Drawer handle bar
    box(mat.port, 1.4, 0.1, 0.07, 0, -H/2 + 0.36, drawerZ + L * 0.21 + 0.04);
    // Drawer face
    box(new THREE.MeshStandardMaterial({color: 0x1e1e2a, roughness: 0.4, metalness: 0.2}),
      W - 0.5, 0.72, 0.06, 0, -H/2 + 0.36, drawerZ + L * 0.21 + 0.03);

    // ════════════════════════════════════════
    // HEAD-END LOWER STORAGE SHELF (integrated)
    // ════════════════════════════════════════
    box(mat.oakDark, W - 0.4, 0.55, 0.75, 0, -H/2 + 1.45, -L/2 + 0.55);

    // ════════════════════════════════════════
    // A/C VENTS — top row (near front)
    // ════════════════════════════════════════
    [-3, -1.5, 0, 1.5, 3].forEach(vx => {
      box(mat.vent, 0.9, 0.11, 0.3, vx, H/2 - 0.17, L/2 - 0.85);
      // Vent slat
      box(new THREE.MeshStandardMaterial({color: 0x181820, metalness: 0.6}),
        0.75, 0.04, 0.28, vx, H/2 - 0.17, L/2 - 0.85);
    });

    // A/C side vents (front-face, lower corners)
    box(mat.vent, 0.1, 0.55, 2.0, W/2 - 0.18, -H/2 + 0.65, L/2 - 1.3);
    box(mat.vent, 0.1, 0.55, 2.0, -W/2 + 0.18, -H/2 + 0.65, L/2 - 1.3);

    // ════════════════════════════════════════
    // REAR PANEL + ACCESS PANEL + PORTS
    // ════════════════════════════════════════
    // Rear composite panel (lighter inset)
    box(mat.rear, W - 0.6, H - 0.8, 0.06, 0, 0.2, -L/2 - T*0.6);
    // Access panel (smaller inset)
    box(new THREE.MeshStandardMaterial({color: 0x202030, roughness: 0.3, metalness: 0.4}),
      W*0.45, H*0.35, 0.04, 0, 0.8, -L/2 - T*0.8);
    // Power/Data port
    box(mat.port, 0.65, 0.65, 0.08, 2.2, -1.6, -L/2 - T*0.8);
    // Port inner socket
    box(new THREE.MeshStandardMaterial({color: 0x0a0a12, metalness: 0.8}),
      0.35, 0.35, 0.04, 2.2, -1.6, -L/2 - T*0.9);
    // Rear venting ducts
    [-2.5, 0, 2.5].forEach(vx => {
      box(mat.vent, 1.8, 0.16, T*0.5, vx, -H/2 - T*0.3, -L/2 - T*0.7);
    });

    // ════════════════════════════════════════
    // B1 UNIT NUMBER — illuminated display
    // ════════════════════════════════════════
    const b1c = document.createElement('canvas');
    b1c.width = 320; b1c.height = 160;
    const ctx = b1c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 160);
    grad.addColorStop(0, '#050c22');
    grad.addColorStop(1, '#020610');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 320, 160);
    ctx.shadowColor = '#2255ff';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#5588ff';
    ctx.font = 'bold 110px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B1', 160, 88);
    const b1Mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 1.9),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(b1c), transparent: true })
    );
    b1Mesh.position.set(0, -H/2 + 1.6, L/2 + T + 0.02);
    pod.add(b1Mesh);

    // ════════════════════════════════════════
    // UNIT NUMBER on top (illuminated panel)
    // ════════════════════════════════════════
    const topCanvas = document.createElement('canvas');
    topCanvas.width = 200; topCanvas.height = 80;
    const tCtx = topCanvas.getContext('2d');
    tCtx.fillStyle = '#181828';
    tCtx.fillRect(0, 0, 200, 80);
    tCtx.fillStyle = '#4466cc';
    tCtx.font = 'bold 36px Courier New';
    tCtx.textAlign = 'center';
    tCtx.textBaseline = 'middle';
    tCtx.fillText('B1', 100, 40);
    const topLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 1.0),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(topCanvas), transparent: true })
    );
    topLabel.rotation.x = -Math.PI / 2;
    topLabel.position.set(W/2 - 1.5, H/2 + T + 0.01, -L/2 + 3);
    pod.add(topLabel);

    // Lift pod to ground
    pod.position.y = H/2 + T;

    // ── GROUND ──
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: 0x0a0b10, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const grid = new THREE.GridHelper(70, 45, 0x171a26, 0x111420);
    scene.add(grid);

    // Dimension line helpers (simple line geometry)
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2244aa, transparent: true, opacity: 0.6 });

    const makeLine = (points) => {
      const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
      return new THREE.Line(geo, lineMat);
    };

    const podY0 = H / 2 + T; // world y where pod base sits (pod.position.y)

    // Length dimension line (along Z axis)
    const dimGroup = new THREE.Group();
    scene.add(dimGroup);

    // Length line (Z axis, below pod)
    const ly = 0.08;
    const lx = W/2 + T + 1.5;
    dimGroup.add(makeLine([[lx, ly, -(L/2 + T)], [lx, ly, (L/2 + T)]]));
    dimGroup.add(makeLine([[lx - 0.3, ly, -(L/2 + T)], [lx + 0.3, ly, -(L/2 + T)]]));
    dimGroup.add(makeLine([[lx - 0.3, ly, (L/2 + T)], [lx + 0.3, ly, (L/2 + T)]]));

    // Width line (X axis)
    const wz = L/2 + T + 1.5;
    dimGroup.add(makeLine([[-(W/2 + T), ly, wz], [(W/2 + T), ly, wz]]));
    dimGroup.add(makeLine([[-(W/2 + T), ly, wz - 0.3], [-(W/2 + T), ly, wz + 0.3]]));
    dimGroup.add(makeLine([[W/2 + T, ly, wz - 0.3], [W/2 + T, ly, wz + 0.3]]));

    // Height line (Y axis)
    const hx = -(W/2 + T + 1.5);
    const hz = -(L/2 + T);
    dimGroup.add(makeLine([[hx, 0, hz], [hx, H + T*2, hz]]));
    dimGroup.add(makeLine([[hx - 0.3, 0, hz], [hx + 0.3, 0, hz]]));
    dimGroup.add(makeLine([[hx - 0.3, H + T*2, hz], [hx + 0.3, H + T*2, hz]]));

    // ── MOUSE / TOUCH CONTROLS ──
    const state = stateRef.current;

    const onMouseDown = (e) => {
      state.isDragging = true;
      state.prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e) => {
      if (!state.isDragging) return;
      const dx = e.clientX - state.prevMouse.x;
      const dy = e.clientY - state.prevMouse.y;
      state.theta -= dx * 0.008;
      state.phi = Math.max(0.05, Math.min(Math.PI * 0.93, state.phi + dy * 0.008));
      state.prevMouse = { x: e.clientX, y: e.clientY };
      updateCamera();
    };
    const onMouseUp = () => { state.isDragging = false; };
    const onWheel = (e) => {
      state.radius = Math.max(10, Math.min(65, state.radius + e.deltaY * 0.04));
      updateCamera();
    };

    let lt = null;
    const onTouchStart = (e) => { lt = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
    const onTouchMove = (e) => {
      if (!lt) return;
      const dx = e.touches[0].clientX - lt.x;
      const dy = e.touches[0].clientY - lt.y;
      state.theta -= dx * 0.008;
      state.phi = Math.max(0.05, Math.min(Math.PI * 0.93, state.phi + dy * 0.008));
      lt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      updateCamera();
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: true });
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: true });

    let animId;
    const tick = () => {
      animId = requestAnimationFrame(tick);
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('resize', onResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [updateCamera]);

  const setView = (label, t, p, r) => {
    setActiveView(label);
    stateRef.current.theta = t;
    stateRef.current.phi = p;
    stateRef.current.radius = r;
    updateCamera();
  };

  const VIEWS = [
    { label: "Perspective", t: 0.55,          p: 0.6,         r: 34 },
    { label: "Front",       t: 0,              p: Math.PI / 2, r: 27 },
    { label: "Side",        t: Math.PI / 2,    p: Math.PI / 2, r: 27 },
    { label: "Top",         t: 0.55,           p: 0.06,        r: 28 },
    { label: "Rear",        t: Math.PI,        p: Math.PI / 2, r: 27 },
  ];

  const SPECS = [
    { axis: "L", label: "LENGTH", value: "220 cm", imp: "7' 2\"",  color: "#3399ff" },
    { axis: "W", label: "WIDTH",  value: "90 cm",  imp: "2' 11\"", color: "#33ddaa" },
    { axis: "H", label: "HEIGHT", value: "100 cm", imp: "3' 3\"",  color: "#ff9944" },
  ];

  const FEATURES = [
    "Rounded Alloy Frame",
    "Internal Oak Finish",
    "Illuminated Unit No. (B1)",
    "Overhead Headboard Shelf",
    "Under-Bed Storage Drawer",
    "LED Ambient Strip",
    "A/C Vents (Top + Side)",
    "Rear Composite Panel",
    "Power / Data Port",
    "Pull-out Bed Box",
  ];

  return (
    <div style={{
      width: "100%", height: "100vh",
      display: "flex", flexDirection: "column",
      background: "#0b0d12",
      fontFamily: "'Courier New', Courier, monospace",
      overflow: "hidden"
    }}>

      {/* ── HEADER ── */}
      <div style={{
        padding: "12px 24px",
        background: "linear-gradient(90deg, #0d101a 0%, #0f1320 100%)",
        borderBottom: "1px solid #1c2240",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexShrink: 0
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#4488ff", boxShadow: "0 0 8px #4488ff"
            }} />
            <span style={{ color: "#dde4f8", fontSize: 15, fontWeight: "bold", letterSpacing: 3 }}>
              SLEEP POD — UNIT B1
            </span>
            <span style={{
              padding: "2px 8px", background: "#0a1230",
              border: "1px solid #1e3060", borderRadius: 3,
              color: "#4466aa", fontSize: 10, letterSpacing: 1
            }}>3D PROTOTYPE</span>
          </div>
          <div style={{ color: "#334477", fontSize: 11, marginTop: 4, letterSpacing: 1 }}>
            CAPSULE HOTEL · STANDARD SINGLE · INTERIOR CLEARANCE
          </div>
        </div>
        <div style={{ color: "#1e2840", fontSize: 10, textAlign: "right", letterSpacing: 1 }}>
          DRAG TO ROTATE<br />SCROLL TO ZOOM
        </div>
      </div>

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* 3D Canvas */}
        <div ref={mountRef} style={{ flex: 1, cursor: "grab", position: "relative" }}>

          {/* Dimension overlay */}
          <div style={{
            position: "absolute", bottom: 16, left: 16,
            display: "flex", flexDirection: "column", gap: 5,
            pointerEvents: "none"
          }}>
            {SPECS.map(s => (
              <div key={s.label} style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "rgba(8,10,18,0.88)",
                border: `1px solid ${s.color}28`,
                borderLeft: `2px solid ${s.color}`,
                borderRadius: "0 4px 4px 0",
                padding: "5px 12px 5px 8px",
                backdropFilter: "blur(4px)"
              }}>
                <span style={{ color: s.color, fontSize: 11, width: 14, fontWeight: "bold" }}>{s.axis}</span>
                <span style={{ color: "#556677", fontSize: 9, width: 52, letterSpacing: 1 }}>{s.label}</span>
                <span style={{ color: "#ddeeff", fontSize: 14, fontWeight: "bold", width: 54 }}>{s.value}</span>
                <span style={{ color: "#445566", fontSize: 10 }}>{s.imp}</span>
              </div>
            ))}
            <div style={{
              marginTop: 4,
              background: "rgba(8,10,18,0.8)",
              border: "1px solid #1a2a40",
              borderRadius: 4, padding: "5px 12px",
              color: "#334455", fontSize: 10, letterSpacing: 1
            }}>
              MAX OCCUPANT: 6'2" (188 cm)
            </div>
          </div>

          {/* Scale note */}
          <div style={{
            position: "absolute", top: 14, right: 14,
            background: "rgba(8,10,18,0.75)",
            border: "1px solid #1a2236",
            borderRadius: 4, padding: "5px 10px",
            color: "#2a3a55", fontSize: 10, letterSpacing: 1,
            pointerEvents: "none"
          }}>
            1 UNIT = 10 cm
          </div>
        </div>

        {/* ── SIDE PANEL ── */}
        <div style={{
          width: 185, background: "#0d1018",
          borderLeft: "1px solid #161d2e",
          display: "flex", flexDirection: "column",
          padding: "16px 12px", gap: 16,
          overflow: "hidden", flexShrink: 0
        }}>

          {/* Features */}
          <div>
            <div style={{ color: "#2a3a55", fontSize: 9, letterSpacing: 2, marginBottom: 8 }}>
              COMPONENTS
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {FEATURES.map((f, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "5px 0",
                  borderBottom: "1px solid #10141e"
                }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: i % 3 === 0 ? "#3399ff" : i % 3 === 1 ? "#33ddaa" : "#ff9944",
                    flexShrink: 0
                  }} />
                  <span style={{ color: "#4a5e7a", fontSize: 9, letterSpacing: 0.5, lineHeight: 1.4 }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Unit info */}
          <div style={{
            background: "#0a0d14",
            border: "1px solid #141d30",
            borderRadius: 6, padding: "10px"
          }}>
            <div style={{ color: "#2a3a55", fontSize: 9, letterSpacing: 2, marginBottom: 8 }}>UNIT SPEC</div>
            {[
              ["TYPE", "Standard Single"],
              ["OCCUPANCY", "1 Adult"],
              ["CLEARANCE", "6'2\" Max"],
              ["MATERIAL", "Oak + Alloy"],
              ["LIGHTING", "LED Ambient"],
              ["A/C", "Integrated"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ color: "#2a3a4a", fontSize: 9, letterSpacing: 1 }}>{k}</span>
                <span style={{ color: "#5577aa", fontSize: 9 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── VIEW CONTROLS ── */}
      <div style={{
        padding: "10px 24px",
        background: "#0d101a",
        borderTop: "1px solid #161d2e",
        display: "flex", gap: 6, alignItems: "center",
        flexShrink: 0
      }}>
        <span style={{ color: "#1e2840", fontSize: 10, letterSpacing: 2, marginRight: 6 }}>VIEW</span>
        {VIEWS.map(v => (
          <button
            key={v.label}
            onClick={() => setView(v.label, v.t, v.p, v.r)}
            style={{
              padding: "6px 14px",
              background: activeView === v.label ? "#0f1e3a" : "#0c0f18",
              color: activeView === v.label ? "#4488ff" : "#334466",
              border: `1px solid ${activeView === v.label ? "#1e3a70" : "#141d2e"}`,
              borderRadius: 3,
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: 10,
              letterSpacing: 1,
              transition: "all 0.15s",
              boxShadow: activeView === v.label ? "0 0 8px #1133660a" : "none"
            }}
          >
            {v.label.toUpperCase()}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, color: "#161e2e", fontSize: 9, letterSpacing: 1 }}>
          <span>CAPSULE HOTEL DESIGN</span>
          <span>FIGMA READY</span>
        </div>
      </div>
    </div>
  );
}
