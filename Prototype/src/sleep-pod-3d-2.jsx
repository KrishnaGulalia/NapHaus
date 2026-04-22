import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";

// Scale: 1 unit = 10cm  |  220cm L × 90cm W × 100cm H interior
const L = 22, W = 9, H = 10, T = 0.45;

export default function NapHaus3D() {
  const mountRef   = useRef(null);
  const stateRef   = useRef({ theta: 0.55, phi: 0.58, radius: 34, isDragging: false, prev: null });
  const cameraRef  = useRef(null);
  const targetVec  = useRef(new THREE.Vector3(0, H / 2 + T + 0.5, 0));
  const [activeView, setActiveView] = useState("Perspective");
  const [hoveredFeature, setHoveredFeature] = useState(null);

  const updateCamera = useCallback(() => {
    const { theta, phi, radius } = stateRef.current;
    const cam = cameraRef.current;
    if (!cam) return;
    const t = targetVec.current;
    cam.position.set(
      t.x + radius * Math.sin(phi) * Math.sin(theta),
      t.y + radius * Math.cos(phi),
      t.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    cam.lookAt(t);
  }, []);

  useEffect(() => {
    const el = mountRef.current;
    const cW = el.clientWidth, cH = el.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef1f6);
    scene.fog = new THREE.Fog(0xdde3ec, 55, 110);

    const camera = new THREE.PerspectiveCamera(36, cW / cH, 0.1, 300);
    cameraRef.current = camera;
    updateCamera();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(cW, cH);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    el.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const sun = new THREE.DirectionalLight(0xfff8ee, 2.5);
    sun.position.set(20, 30, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -28;
    sun.shadow.camera.right = sun.shadow.camera.top = 28;
    scene.add(sun);
    // FIX: removed broken Object.assign line that corrupted the Vector3 position
    const fill = new THREE.DirectionalLight(0xd0e8ff, 0.8); fill.position.set(-14,10,-8); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffeedd, 0.4); rim.position.set(0,-5,20); scene.add(rim);
    const ledPt = new THREE.PointLight(0xffaa44, 1.8, 20);
    ledPt.position.set(0, H/2+T-1.8, -L/2+2.2); scene.add(ledPt);

    // Materials
    const mat = {
      frame:    new THREE.MeshStandardMaterial({ color:0x3a3d4a, metalness:0.85, roughness:0.18 }),
      frameEdge:new THREE.MeshStandardMaterial({ color:0x52566a, metalness:0.7,  roughness:0.25 }),
      oak:      new THREE.MeshStandardMaterial({ color:0xd4903a, roughness:0.60 }),
      birch:    new THREE.MeshStandardMaterial({ color:0xdec278, roughness:0.65 }),
      abs:      new THREE.MeshStandardMaterial({ color:0xf5f0e8, roughness:0.85 }),
      mattress: new THREE.MeshStandardMaterial({ color:0xfdfaf5, roughness:0.95 }),
      pillow:   new THREE.MeshStandardMaterial({ color:0xffffff, roughness:1.0  }),
      blanket:  new THREE.MeshStandardMaterial({ color:0xe8ddd0, roughness:0.98 }),
      hdpe:     new THREE.MeshStandardMaterial({ color:0x607080, roughness:0.5, metalness:0.1 }),
      shutterBody: new THREE.MeshStandardMaterial({ color:0x2a2d38, roughness:0.3, metalness:0.4 }),
      shutterSlat: new THREE.MeshStandardMaterial({ color:0x3a3e50, roughness:0.2, metalness:0.5 }),
      acoustic: new THREE.MeshStandardMaterial({ color:0xd8d0c8, roughness:0.98 }),
      vinyl:    new THREE.MeshStandardMaterial({ color:0x4a4e5c, roughness:0.92 }),
      ledStrip: new THREE.MeshStandardMaterial({ color:0xffcc66, emissive:0xff9900, emissiveIntensity:2.5, roughness:0.3 }),
      leather:  new THREE.MeshStandardMaterial({ color:0xd4a030, roughness:0.42, metalness:0.06 }),
      metal:    new THREE.MeshStandardMaterial({ color:0x8899aa, metalness:0.9, roughness:0.15 }),
      galv:     new THREE.MeshStandardMaterial({ color:0x8899a8, metalness:0.8, roughness:0.25 }),
      panel:    new THREE.MeshStandardMaterial({ color:0x2c3040, roughness:0.4, metalness:0.5 }),
      usb:      new THREE.MeshStandardMaterial({ color:0x1a1e2a, metalness:0.8, roughness:0.2 }),
      lamp:     new THREE.MeshStandardMaterial({ color:0xffee99, emissive:0xffcc33, emissiveIntensity:1.5, roughness:0.4 }),
      lampBody: new THREE.MeshStandardMaterial({ color:0xccccdd, metalness:0.7, roughness:0.2 }),
      mesh:     new THREE.MeshStandardMaterial({ color:0x778899, metalness:0.5, roughness:0.5 }),
      rear:     new THREE.MeshStandardMaterial({ color:0xaab5c0, roughness:0.5, metalness:0.2 }),
      curtain:  new THREE.MeshStandardMaterial({ color:0xd8cfc8, roughness:0.99, side:THREE.DoubleSide }),
      table:    new THREE.MeshStandardMaterial({ color:0xe0d8c0, roughness:0.55 }),
      tableAlu: new THREE.MeshStandardMaterial({ color:0xb0b8c0, metalness:0.85, roughness:0.15 }),
      stitchLine: new THREE.MeshStandardMaterial({ color:0xb88820, roughness:0.45 }),
    };

    const pod = new THREE.Group();
    scene.add(pod);

    const box = (m, w, h, d, x, y, z, ry=0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m);
      mesh.position.set(x,y,z); if(ry) mesh.rotation.y=ry;
      mesh.castShadow=true; mesh.receiveShadow=true; pod.add(mesh); return mesh;
    };

    // === OUTER SHELL (powder-coated mild steel + MDF) ===
    box(mat.frame, W+T*2, T, L+T*2, 0, H/2+T/2, 0);
    box(mat.frame, W+T*2, T, L+T*2, 0, -H/2-T/2, 0);
    box(mat.frame, T, H, L+T*2, -W/2-T/2, 0, 0);
    box(mat.frame, T, H, L+T*2, W/2+T/2, 0, 0);
    box(mat.frame, W+T*2, H+T*2, T, 0, 0, -L/2-T/2);
    // Front opening frame
    box(mat.frameEdge, W+T*2, T*2, T, 0, H/2-T, L/2+T/2);
    box(mat.frameEdge, W+T*2, T*2, T, 0, -H/2+T, L/2+T/2);
    box(mat.frameEdge, T, H-T*4, T, -W/2-T/2, 0, L/2+T/2);
    box(mat.frameEdge, T, H-T*4, T, W/2+T/2, 0, L/2+T/2);

    // === INTERIOR SURFACES ===
    box(mat.vinyl,   W, 0.06, L, 0, -H/2+0.03, 0);       // anti-slip vinyl floor
    box(mat.acoustic,W, 0.06, L, 0,  H/2-0.03, 0);       // acoustic foam ceiling
    box(mat.abs, 0.05, H, L, -W/2+0.025, 0, 0);          // ABS left wall lining
    box(mat.abs, 0.05, H, L,  W/2-0.025, 0, 0);          // ABS right wall lining
    box(mat.abs, W, H, 0.05, 0, 0, -L/2+0.025);          // ABS back wall lining

    // === LED AMBIENT STRIP ===
    box(mat.ledStrip, W-0.5, 0.09, 0.09, 0, H/2-1.15, -L/2+1.5);

    // === OVERHEAD HEADBOARD STORAGE SHELF ===
    box(mat.hdpe, W-0.3, 0.92, 2.55, 0, H/2-0.74, -L/2+1.32);
    box(mat.frame, W-0.3, 0.07, 0.06, 0, H/2-1.19, -L/2+2.59);

    // === MATTRESS PLATFORM — birch plywood ===
    const bedBaseY = -H/2+0.88;
    box(mat.birch, W-0.25, 0.82, L*0.87, 0, bedBaseY, L*0.045);

    // === MATTRESS — high-density foam 10cm ===
    const mattY = bedBaseY+0.41+0.37;
    box(mat.mattress, W-0.5, 0.48, L*0.83, 0, mattY, L*0.05);
    box(new THREE.MeshStandardMaterial({color:0xece8e0,roughness:0.9}),
      W-0.5, 0.06, L*0.83+0.06, 0, mattY+0.24, L*0.05);

    // === BEDDING STACK ===
    box(mat.blanket, W-0.6, 0.26, 2.2, 0, mattY+0.38, L/2-2.1);
    box(new THREE.MeshStandardMaterial({color:0xd5ccc0,roughness:0.96}),
      W-0.65, 0.11, 2.1, 0, mattY+0.62, L/2-2.1);

    // === PILLOWS (×2) ===
    const pillY=mattY+0.42, pillZ=-L/2+3.1;
    [[-W/4+0.18,0.02],[W/4-0.18,-0.02]].forEach(([px,ry])=>{
      const pm=new THREE.Mesh(new THREE.BoxGeometry(W/2-0.5,0.36,1.85),mat.pillow);
      pm.position.set(px,pillY,pillZ); pm.rotation.y=ry; pm.castShadow=true; pod.add(pm);
    });

    // === HEADBOARD — leather panel + stitching ===
    box(mat.leather, W-0.42, 2.65, 0.18, 0, mattY+1.18, -L/2+0.22);
    [-W/4+0.22, W/4-0.22].forEach(lx =>
      box(mat.stitchLine, 0.04, 2.55, 0.01, lx, mattY+1.18, -L/2+0.31)
    );

    // === UNDER-BED STORAGE BOX — HDPE 100L PIN lock ===
    const drZ=L*0.34;
    box(mat.hdpe, W-0.5, 0.70, L*0.42, 0, -H/2+0.35, drZ);
    box(new THREE.MeshStandardMaterial({color:0x506070,roughness:0.4,metalness:0.15}),
      W-0.5, 0.70, 0.06, 0, -H/2+0.35, drZ+L*0.21+0.03);
    box(mat.metal, 1.35, 0.09, 0.07, 0, -H/2+0.35, drZ+L*0.21+0.07);
    box(mat.panel, 0.55, 0.38, 0.04, W/2-1.2, -H/2+0.35, drZ+L*0.21+0.05); // PIN pad

    // === HEAD-END LOWER STORAGE SHELF ===
    box(mat.oak, W-0.42, 0.52, 0.72, 0, -H/2+1.42, -L/2+0.55);

    // === PRIVACY SHUTTER — polypropylene rolldown (40% deployed) ===
    box(mat.shutterBody, W+T*0.4, 0.55, T*0.8, 0, H/2-0.25, L/2+T/2);
    const slatCount=8, shutterDropH=H*0.40, slatH=shutterDropH/slatCount;
    for(let i=0;i<slatCount;i++){
      box(mat.shutterSlat, W+T*0.4, slatH-0.05, 0.12, 0, H/2-0.55-i*slatH-slatH/2, L/2+T/2+0.06);
      // ventilation slits
      box(new THREE.MeshStandardMaterial({color:0x0f1018,metalness:0.3}),
        W+T*0.4-0.2, 0.025, 0.01, 0, H/2-0.55-i*slatH-slatH*0.7, L/2+T/2+0.12);
    }

    // === INNER PRIVACY CURTAIN — soft fabric ===
    box(mat.curtain, W-0.15, H*0.55, 0.04, 0, H/2-H*0.55/2-0.3, L/2-0.6);

    // === STUDY LAMP — warm-white LED touch, side panel ===
    const lmpX=W/2-0.28, lmpY=mattY+0.9, lmpZ=-L/2+5;
    box(mat.lampBody, 0.08, 0.85, 0.08, lmpX, lmpY, lmpZ);
    const lHead=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.12,0.3),mat.lampBody);
    lHead.position.set(lmpX-0.22,lmpY+0.42,lmpZ); lHead.rotation.z=-0.3; lHead.castShadow=true; pod.add(lHead);
    box(mat.lamp, 0.38, 0.06, 0.22, lmpX-0.22, lmpY+0.42, lmpZ);

    // === FOLDABLE TABLE — Al frame + laminated MDF (40×30cm shown extended) ===
    const tX=-(W/2-0.28), tY=mattY+0.55, tZ=L/2-4.5;
    box(mat.table,   4.0, 0.08, 3.0, tX+1.7, tY, tZ);
    box(mat.tableAlu,0.07, 0.06, 3.0, tX+0.12, tY-0.08, tZ);
    box(mat.metal,   0.12, 0.35, 0.12, tX, tY-0.06, tZ);

    // === READING SHELF — mesh, phone/glasses ===
    box(mat.mesh, W-0.5, 0.06, 1.1, 0, mattY+0.8, -L/2+4.2);
    box(mat.metal, W-0.5, 0.12, 0.06, 0, mattY+0.75, -L/2+4.74);

    // === USB + POWER PANEL (2×USB-A, USB-C, 5-pin) ===
    const pX=W/2-0.12, pY=mattY+0.2, pZ=-L/2+5.5;
    box(mat.panel, 0.06, 1.0, 1.8, pX, pY, pZ);
    box(mat.usb, 0.03, 0.14, 0.22, pX+0.03, pY+0.28, pZ-0.4);
    box(mat.usb, 0.03, 0.14, 0.22, pX+0.03, pY+0.28, pZ-0.0);
    box(mat.usb, 0.03, 0.10, 0.28, pX+0.03, pY+0.28, pZ+0.4);
    box(mat.usb, 0.03, 0.32, 0.32, pX+0.03, pY-0.20, pZ+0.1);

    // === ETHERNET PORT RJ45 ===
    box(mat.panel, 0.06, 0.18, 0.26, pX+0.03, pY-0.52, pZ-0.3);

    // === PERSONAL AC VENT DIAL ===
    const dial=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,0.06,12),mat.metal);
    dial.position.set(-W/2+0.18, H/2-0.5, L/2-1.2); dial.rotation.z=Math.PI/2; pod.add(dial);

    // === A/C VENTS — top row (galvanised steel ducting) ===
    [-3,-1.5,0,1.5,3].forEach(vx=>{
      box(mat.galv, 0.88, 0.10, 0.28, vx, H/2-0.16, L/2-0.9);
      box(mat.frame,0.72, 0.03, 0.26, vx, H/2-0.16, L/2-0.9);
    });
    box(mat.galv, 0.10, 0.52, 1.9,  W/2-0.18, -H/2+0.62, L/2-1.4);
    box(mat.galv, 0.10, 0.52, 1.9, -W/2+0.18, -H/2+0.62, L/2-1.4);

    // === REAR COMPOSITE PANEL + ACCESS + PORTS ===
    box(mat.rear, W-0.6, H-0.9, 0.06, 0, 0.2, -L/2-T*0.65);
    box(new THREE.MeshStandardMaterial({color:0x9aaab5,roughness:0.35,metalness:0.35}),
      W*0.44, H*0.34, 0.04, 0, 0.9, -L/2-T*0.85);
    box(mat.panel, 0.65, 0.65, 0.08, 2.2, -1.6, -L/2-T*0.85);
    box(new THREE.MeshStandardMaterial({color:0x0d1018,metalness:0.85}),
      0.34, 0.34, 0.04, 2.2, -1.6, -L/2-T*0.95);
    [-2.6,0,2.6].forEach(vx=>box(mat.galv,1.9,0.15,T*0.5,vx,-H/2-T*0.3,-L/2-T*0.72));

    // === B1 ILLUMINATED UNIT NUMBER ===
    const b1c=document.createElement('canvas'); b1c.width=320; b1c.height=160;
    const bCtx=b1c.getContext('2d');
    bCtx.fillStyle='#0a0f22'; bCtx.fillRect(0,0,320,160);
    bCtx.shadowColor='#4488ff'; bCtx.shadowBlur=30;
    bCtx.fillStyle='#88aaff'; bCtx.font='bold 108px "Courier New",monospace';
    bCtx.textAlign='center'; bCtx.textBaseline='middle'; bCtx.fillText('B1',160,88);
    const b1m=new THREE.Mesh(new THREE.PlaneGeometry(3.8,1.9),
      new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(b1c),transparent:true}));
    b1m.position.set(0,-H/2+1.65,L/2+T+0.02); pod.add(b1m);

    // === DIMENSION LINES ===
    pod.position.y = H/2+T;
    const lnMat=new THREE.LineBasicMaterial({color:0x3366cc,transparent:true,opacity:0.5});
    const mkL=pts=>{
      const g=new THREE.BufferGeometry().setFromPoints(pts.map(p=>new THREE.Vector3(...p)));
      return new THREE.Line(g,lnMat);
    };
    const dimG=new THREE.Group(); scene.add(dimG);
    const gy=0.08, lx=W/2+T+1.9, wz=L/2+T+1.9, hxd=-(W/2+T+1.9);
    dimG.add(mkL([[lx,gy,-(L/2+T)],[lx,gy,L/2+T]]));
    dimG.add(mkL([[lx-.3,gy,-(L/2+T)],[lx+.3,gy,-(L/2+T)]]));
    dimG.add(mkL([[lx-.3,gy,L/2+T],[lx+.3,gy,L/2+T]]));
    dimG.add(mkL([[-(W/2+T),gy,wz],[W/2+T,gy,wz]]));
    dimG.add(mkL([[-(W/2+T),gy,wz-.3],[-(W/2+T),gy,wz+.3]]));
    dimG.add(mkL([[W/2+T,gy,wz-.3],[W/2+T,gy,wz+.3]]));
    dimG.add(mkL([[hxd,0,-(L/2+T)],[hxd,H+T*2,-(L/2+T)]]));
    dimG.add(mkL([[hxd-.3,0,-(L/2+T)],[hxd+.3,0,-(L/2+T)]]));
    dimG.add(mkL([[hxd-.3,H+T*2,-(L/2+T)],[hxd+.3,H+T*2,-(L/2+T)]]));

    // Ground + grid
    const gnd=new THREE.Mesh(new THREE.PlaneGeometry(100,100),
      new THREE.MeshStandardMaterial({color:0xe0e5ed,roughness:0.9}));
    gnd.rotation.x=-Math.PI/2; gnd.receiveShadow=true; scene.add(gnd);
    scene.add(new THREE.GridHelper(70,45,0xc5ccd8,0xcdd3de));

    // Controls
    const st=stateRef.current;
    const onD=e=>{st.isDragging=true;st.prev={x:e.clientX,y:e.clientY};};
    const onM=e=>{
      if(!st.isDragging)return;
      st.theta-=(e.clientX-st.prev.x)*0.008;
      st.phi=Math.max(0.05,Math.min(Math.PI*0.93,st.phi+(e.clientY-st.prev.y)*0.008));
      st.prev={x:e.clientX,y:e.clientY}; updateCamera();
    };
    const onU=()=>{st.isDragging=false;};
    const onW=e=>{st.radius=Math.max(10,Math.min(65,st.radius+e.deltaY*0.04));updateCamera();};
    let lt=null;
    const onTS=e=>{lt={x:e.touches[0].clientX,y:e.touches[0].clientY};};
    const onTM=e=>{
      if(!lt)return;
      st.theta-=(e.touches[0].clientX-lt.x)*0.008;
      st.phi=Math.max(0.05,Math.min(Math.PI*0.93,st.phi+(e.touches[0].clientY-lt.y)*0.008));
      lt={x:e.touches[0].clientX,y:e.touches[0].clientY}; updateCamera();
    };
    el.addEventListener('mousedown',onD);
    window.addEventListener('mousemove',onM);
    window.addEventListener('mouseup',onU);
    el.addEventListener('wheel',onW,{passive:true});
    el.addEventListener('touchstart',onTS,{passive:true});
    el.addEventListener('touchmove',onTM,{passive:true});

    let aid;
    const tick=()=>{aid=requestAnimationFrame(tick);renderer.render(scene,camera);};
    tick();
    const onR=()=>{const w=el.clientWidth,h=el.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);};
    window.addEventListener('resize',onR);
    return()=>{
      cancelAnimationFrame(aid);
      el.removeEventListener('mousedown',onD); window.removeEventListener('mousemove',onM); window.removeEventListener('mouseup',onU);
      el.removeEventListener('wheel',onW); el.removeEventListener('touchstart',onTS); el.removeEventListener('touchmove',onTM);
      window.removeEventListener('resize',onR);
      if(el.contains(renderer.domElement))el.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [updateCamera]);

  const setView=(label,t,p,r)=>{
    setActiveView(label);
    Object.assign(stateRef.current,{theta:t,phi:p,radius:r});
    updateCamera();
  };

  const VIEWS=[
    {label:"Perspective",t:0.55,p:0.58,r:34},
    {label:"Front",      t:0,   p:Math.PI/2,r:27},
    {label:"Side",       t:Math.PI/2,p:Math.PI/2,r:27},
    {label:"Top",        t:0.55,p:0.06,r:28},
    {label:"Rear",       t:Math.PI,p:Math.PI/2,r:27},
  ];

  const DIMS=[
    {axis:"L",label:"LENGTH", val:"220 cm",imp:"7′ 2″", col:"#1e6ecc"},
    {axis:"W",label:"WIDTH",  val:"90 cm", imp:"2′ 11″",col:"#1a9966"},
    {axis:"H",label:"HEIGHT", val:"100 cm",imp:"3′ 3″", col:"#cc6611"},
  ];

  const FEATURES=[
    {name:"Privacy Shutter",      note:"Motorized rolldown, PP polymer + vent slits",col:"#1e6ecc"},
    {name:"Mattress",             note:"HD foam 10 cm, washable cover, birch base",  col:"#1a9966"},
    {name:"Under-Bed Storage",    note:"100L HDPE pull-out, PIN lock",               col:"#cc6611"},
    {name:"Study Lamp",           note:"Warm-white LED, touch dimmer, side-mounted", col:"#1e6ecc"},
    {name:"Foldable Table",       note:"Al frame + laminated MDF, 40×30 cm, 5 kg",  col:"#1a9966"},
    {name:"USB + Power Outlets",  note:"2×USB-A, 1×USB-C fast charge, 5-pin socket",col:"#cc6611"},
    {name:"Personal A/C Dial",    note:"Individual airflow control, centralised AC", col:"#1e6ecc"},
    {name:"Reading Shelf",        note:"Mesh shelf — phone, glasses, personal items",col:"#1a9966"},
    {name:"Inner Privacy Curtain",note:"Soft fabric behind hard shutter, light-block",col:"#cc6611"},
    {name:"Ethernet Port",        note:"RJ45 wired connection, cable on request",    col:"#1e6ecc"},
    {name:"Acoustic Foam Ceiling",note:"Noise absorption between pods, fabric cover",col:"#1a9966"},
    {name:"Anti-slip Vinyl Floor",note:"Hygienic, easy-clean, soft underfoot",       col:"#cc6611"},
  ];

  const MATERIALS=[
    ["Pod Frame / Shell",   "Powder-coated mild steel + MDF panels"],
    ["Interior Lining",     "Fire-retardant ABS plastic sheets"],
    ["Privacy Shutter",     "Polypropylene polymer (opaque)"],
    ["Mattress Platform",   "Birch plywood base"],
    ["Storage Box",         "HDPE — impact & moisture-proof"],
    ["Foldable Table",      "Aluminium frame + laminated MDF"],
    ["Ceiling / Top Panel", "Acoustic foam + fabric cover"],
    ["Pod Flooring",        "Anti-slip vinyl sheet"],
    ["Ventilation Duct",    "Galvanised steel, fire-rated"],
  ];

  const C={bg:"#f0f3f8",hdr:"#ffffff",card:"#ffffff",bdr:"#d8dfe8",txt:"#1a2030",mut:"#6a7a90",acc:"#1e6ecc"};

  return (
    <div style={{width:"100%",height:"100vh",display:"flex",flexDirection:"column",
      background:C.bg,fontFamily:"'Segoe UI',system-ui,sans-serif",overflow:"hidden"}}>

      {/* HEADER */}
      <div style={{background:C.hdr,borderBottom:`1px solid ${C.bdr}`,padding:"11px 20px",
        display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,
        boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:36,height:36,borderRadius:8,background:"#1e6ecc",
            display:"flex",alignItems:"center",justifyContent:"center",
            color:"#fff",fontWeight:800,fontSize:15,letterSpacing:0.5}}>N</div>
          <div>
            <div style={{color:C.txt,fontSize:16,fontWeight:700,letterSpacing:0.3}}>
              NAPHAUS — Sleep Pod Unit B1
            </div>
            <div style={{color:C.mut,fontSize:10.5,marginTop:2}}>
              Sleeping Pod Cafe · Principles of Design · SASTech, Rishihood University
            </div>
          </div>
          <span style={{padding:"3px 10px",background:"#e8f0fa",border:`1px solid #c0d4ee`,
            borderRadius:4,color:C.acc,fontSize:11,fontWeight:600}}>3D PROTOTYPE</span>
        </div>
        <div style={{color:"#b0bac8",fontSize:10.5,textAlign:"right"}}>
          DRAG TO ROTATE · SCROLL TO ZOOM
        </div>
      </div>

      {/* BODY */}
      <div style={{flex:1,display:"flex",overflow:"hidden",minHeight:0}}>

        {/* LEFT PANEL */}
        <div style={{width:222,background:C.card,borderRight:`1px solid ${C.bdr}`,
          display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
          <div style={{padding:"13px 14px 10px",borderBottom:`1px solid ${C.bdr}`}}>
            <div style={{color:C.mut,fontSize:10,fontWeight:600,letterSpacing:1.5,
              marginBottom:10,textTransform:"uppercase"}}>Pod Dimensions</div>
            {DIMS.map(d=>(
              <div key={d.axis} style={{display:"flex",alignItems:"center",gap:9,
                padding:"7px 0",borderBottom:`1px solid #f0f3f8`}}>
                <div style={{width:30,height:30,borderRadius:7,background:`${d.col}15`,
                  border:`1px solid ${d.col}40`,display:"flex",alignItems:"center",
                  justifyContent:"center",color:d.col,fontWeight:700,fontSize:13}}>
                  {d.axis}</div>
                <div>
                  <div style={{color:C.txt,fontSize:14,fontWeight:700}}>{d.val}</div>
                  <div style={{color:C.mut,fontSize:10}}>{d.label} · {d.imp}</div>
                </div>
              </div>
            ))}
            <div style={{marginTop:8,padding:"6px 10px",background:"#f5f8fd",
              border:`1px solid #dce8f5`,borderRadius:6,color:C.mut,fontSize:10}}>
              Max occupant: <strong style={{color:C.txt}}>6′2″ (188 cm)</strong>
            </div>
          </div>
          <div style={{flex:1,overflow:"auto",padding:"12px 14px"}}>
            <div style={{color:C.mut,fontSize:10,fontWeight:600,letterSpacing:1.5,
              marginBottom:9,textTransform:"uppercase"}}>In-Pod Features (Sec. 7.2)</div>
            {FEATURES.map((f,i)=>(
              <div key={i}
                onMouseEnter={()=>setHoveredFeature(i)}
                onMouseLeave={()=>setHoveredFeature(null)}
                style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 6px",
                  marginBottom:2,borderRadius:5,cursor:"default",transition:"background 0.15s",
                  background:hoveredFeature===i?`${f.col}0d`:"transparent",
                  borderLeft:hoveredFeature===i?`2px solid ${f.col}`:"2px solid transparent"}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:f.col,
                  marginTop:4.5,flexShrink:0}}/>
                <div>
                  <div style={{color:C.txt,fontSize:11,fontWeight:600,lineHeight:1.3}}>{f.name}</div>
                  <div style={{color:C.mut,fontSize:9.5,lineHeight:1.4,marginTop:1}}>{f.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3D CANVAS */}
        <div ref={mountRef} style={{flex:1,cursor:"grab",position:"relative"}}>
          {/* Pricing */}
          <div style={{position:"absolute",top:14,left:14,pointerEvents:"none",
            display:"flex",flexDirection:"column",gap:4}}>
            {[["3 hr","₹ 150"],["6 hr","₹ 250"],["12 hr","₹ 399"],["24 hr","₹ 650"]].map(([s,p])=>(
              <div key={s} style={{display:"flex",alignItems:"center",gap:7,
                background:"rgba(255,255,255,0.93)",border:`1px solid ${C.bdr}`,
                borderRadius:5,padding:"4px 10px",backdropFilter:"blur(4px)"}}>
                <span style={{color:C.mut,fontSize:10,width:30}}>{s}</span>
                <span style={{color:C.acc,fontSize:13,fontWeight:700}}>{p}</span>
              </div>
            ))}
          </div>
          <div style={{position:"absolute",top:14,right:14,pointerEvents:"none",
            background:"rgba(255,255,255,0.90)",border:`1px solid ${C.bdr}`,
            borderRadius:5,padding:"5px 11px",color:C.mut,fontSize:10}}>
            Scale: 1 unit = 10 cm &nbsp;|&nbsp; 220 × 90 × 100 cm interior
          </div>
          <div style={{position:"absolute",bottom:66,left:"50%",transform:"translateX(-50%)",
            pointerEvents:"none",background:"rgba(255,255,255,0.88)",border:`1px solid ${C.bdr}`,
            borderRadius:5,padding:"5px 14px",color:C.mut,fontSize:10,whiteSpace:"nowrap"}}>
            ↑ Privacy shutter shown 40% deployed · Foldable table extended (left side)
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{width:212,background:C.card,borderLeft:`1px solid ${C.bdr}`,
          display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
          <div style={{padding:"13px 14px 10px",borderBottom:`1px solid ${C.bdr}`}}>
            <div style={{color:C.mut,fontSize:10,fontWeight:600,letterSpacing:1.5,
              marginBottom:9,textTransform:"uppercase"}}>Materials (Sec. 7.3)</div>
            {MATERIALS.map(([comp,mat],i)=>(
              <div key={i} style={{padding:"6px 0",borderBottom:`1px solid #f0f3f8`}}>
                <div style={{color:C.txt,fontSize:11,fontWeight:600}}>{comp}</div>
                <div style={{color:C.mut,fontSize:10,marginTop:2,lineHeight:1.4}}>{mat}</div>
              </div>
            ))}
          </div>
          <div style={{padding:"12px 14px",flex:1,overflow:"auto"}}>
            <div style={{color:C.mut,fontSize:10,fontWeight:600,letterSpacing:1.5,
              marginBottom:9,textTransform:"uppercase"}}>Add-ons</div>
            {[["Premium Shower Kit","₹ 80"],["Meal Coupon (Cafe)","₹ 120"],
              ["Extra Blanket","₹ 30"],["Wi-Fi 100 Mbps","₹ 40/slot"]].map(([n,p])=>(
              <div key={n} style={{display:"flex",justifyContent:"space-between",
                padding:"6px 0",borderBottom:`1px solid #f0f3f8`,alignItems:"center"}}>
                <span style={{color:C.txt,fontSize:10}}>{n}</span>
                <span style={{color:"#1a9966",fontSize:11,fontWeight:700}}>{p}</span>
              </div>
            ))}
            <div style={{marginTop:12,padding:"10px",background:"#f0f7ff",
              border:`1px solid #c8ddf5`,borderRadius:8}}>
              <div style={{color:C.acc,fontSize:10,fontWeight:600,marginBottom:4}}>vs. Hotel Room</div>
              <div style={{color:C.txt,fontSize:11,lineHeight:1.6}}>
                Hotel avg: <strong>₹ 1,500–4,000</strong>/night<br/>
                NAPHAUS 6 hr: <strong style={{color:"#1a9966"}}>₹ 250</strong><br/>
                <span style={{color:"#1a9966",fontWeight:700}}>Save 80–90%</span>
              </div>
            </div>
            <div style={{marginTop:10,padding:"10px",background:"#f8f9fb",
              border:`1px solid ${C.bdr}`,borderRadius:8}}>
              <div style={{color:C.mut,fontSize:10,fontWeight:600,marginBottom:5}}>
                DESIGN PRINCIPLES
              </div>
              {["Function-Forward Space","Dignity in Minimalism","Adaptive Reuse Potential"].map(p=>(
                <div key={p} style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:4}}>
                  <span style={{color:C.acc,fontSize:11,marginTop:1}}>·</span>
                  <span style={{color:C.mut,fontSize:10,lineHeight:1.5}}>{p}</span>
                </div>
              ))}
            </div>
            <div style={{marginTop:10,padding:"10px",background:"#fff8f0",
              border:`1px solid #f0dcc8`,borderRadius:8}}>
              <div style={{color:"#cc6611",fontSize:10,fontWeight:600,marginBottom:5}}>
                LOCATION STRATEGY
              </div>
              {["Railway stations & bus terminals","Tourist & heritage sites","Pilgrimage towns","University & exam clusters","Airport landside zones"].map(l=>(
                <div key={l} style={{color:C.mut,fontSize:9.5,lineHeight:1.5,paddingLeft:8,
                  borderLeft:"2px solid #f0c890",marginBottom:3}}>{l}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* VIEW CONTROLS */}
      <div style={{background:C.hdr,borderTop:`1px solid ${C.bdr}`,padding:"9px 20px",
        display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
        <span style={{color:C.mut,fontSize:10,fontWeight:600,letterSpacing:1,marginRight:6}}>VIEW</span>
        {VIEWS.map(v=>(
          <button key={v.label} onClick={()=>setView(v.label,v.t,v.p,v.r)} style={{
            padding:"6px 14px",
            background:activeView===v.label?"#1e6ecc":"#f0f4fa",
            color:activeView===v.label?"#ffffff":C.mut,
            border:`1px solid ${activeView===v.label?"#1e6ecc":C.bdr}`,
            borderRadius:5,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600,
            transition:"all 0.15s",letterSpacing:0.3}}>
            {v.label}
          </button>
        ))}
        <div style={{marginLeft:"auto",color:"#c0c8d4",fontSize:10}}>
          NAPHAUS · Rishihood University · Principles of Design
        </div>
      </div>
    </div>
  );
}