import * as THREE from 'three';

export function buildTrack(scene) {
  // Hand-placed control points forming a closed city circuit
  const pts = [
    [0, 0],
    [55, -5],
    [95, -40],
    [100, -95],
    [65, -135],
    [15, -140],
    [-25, -120],
    [-40, -85],
    [-85, -70],
    [-115, -30],
    [-100, 15],
    [-60, 35],
    [-20, 20],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  const SEGMENTS = 420;
  const samples = curve.getSpacedPoints(SEGMENTS).slice(0, -1);
  const N = samples.length;
  const halfWidth = 7.5;

  // ---------- ground ----------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ color: 0x7aa95c })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.45;
  scene.add(ground);

  // ---------- road surface ----------
  const positions = [];
  const indices = [];
  for (let i = 0; i < N; i++) {
    const p = samples[i];
    const next = samples[(i + 1) % N];
    const tan = next.clone().sub(p).normalize();
    const nrm = new THREE.Vector3(-tan.z, 0, tan.x);
    const l = p.clone().addScaledVector(nrm, halfWidth);
    const r = p.clone().addScaledVector(nrm, -halfWidth);
    positions.push(l.x, 0, l.z, r.x, 0, r.z);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = i * 2 + 1;
    const c = ((i + 1) % N) * 2, d = ((i + 1) % N) * 2 + 1;
    indices.push(a, c, b, b, c, d);
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeo.setIndex(indices);
  roadGeo.computeVertexNormals();
  const road = new THREE.Mesh(roadGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f47 }));
  scene.add(road);

  // ---------- kerbs (red/white edges) ----------
  const kerbGeo = new THREE.BoxGeometry(1.4, 0.22, 2.2);
  const kerbMats = [
    new THREE.MeshLambertMaterial({ color: 0xe63946 }),
    new THREE.MeshLambertMaterial({ color: 0xf1f1f1 }),
  ];
  for (let i = 0; i < N; i += 3) {
    const p = samples[i];
    const next = samples[(i + 1) % N];
    const tan = next.clone().sub(p).normalize();
    const nrm = new THREE.Vector3(-tan.z, 0, tan.x);
    const ang = Math.atan2(tan.x, tan.z);
    for (const side of [1, -1]) {
      const k = new THREE.Mesh(kerbGeo, kerbMats[(i / 3) % 2 === 0 ? 0 : 1]);
      k.position.copy(p).addScaledVector(nrm, side * (halfWidth + 0.5));
      k.position.y = 0.06;
      k.rotation.y = ang;
      scene.add(k);
    }
  }

  // ---------- barrier posts ----------
  const postGeo = new THREE.BoxGeometry(0.5, 2.2, 0.5);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x1f6feb });
  for (let i = 0; i < N; i += 10) {
    const p = samples[i];
    const next = samples[(i + 1) % N];
    const tan = next.clone().sub(p).normalize();
    const nrm = new THREE.Vector3(-tan.z, 0, tan.x);
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.copy(p).addScaledVector(nrm, side * (halfWidth + 3.4));
      post.position.y = 1.1;
      scene.add(post);
    }
  }

  // ---------- start / finish line ----------
  const lineGeo = new THREE.PlaneGeometry(halfWidth * 2, 3, 10, 2);
  const lineCanvas = document.createElement('canvas');
  lineCanvas.width = 128; lineCanvas.height = 32;
  const ctx = lineCanvas.getContext('2d');
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#1a1a1a';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const lineTex = new THREE.CanvasTexture(lineCanvas);
  const lineMat = new THREE.MeshBasicMaterial({ map: lineTex });
  const startLine = new THREE.Mesh(lineGeo, lineMat);
  const p0 = samples[0];
  const t0 = curve.getTangentAt(0);
  startLine.position.copy(p0);
  startLine.position.y = 0.02;
  startLine.rotation.x = -Math.PI / 2;
  startLine.rotation.z = -Math.atan2(t0.x, t0.z);
  scene.add(startLine);

  // ---------- scenery ----------
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.42, 4, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6240 });
  const leafGeo = new THREE.ConeGeometry(2.2, 3.4, 7);
  const leafMats = [
    new THREE.MeshLambertMaterial({ color: 0x2d6a4f }),
    new THREE.MeshLambertMaterial({ color: 0x40916c }),
  ];
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);

  const rng = (seed => () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  })(1337);

  for (let i = 0; i < N; i += 7) {
    const p = samples[i];
    const next = samples[(i + 1) % N];
    const tan = next.clone().sub(p).normalize();
    const nrm = new THREE.Vector3(-tan.z, 0, tan.x);
    for (const side of [1, -1]) {
      if (rng() > 0.55) continue;
      const off = halfWidth + 6 + rng() * 14;
      const base = p.clone().addScaledVector(nrm, side * off);

      if (rng() < 0.6) {
        // palm
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.copy(base);
        trunk.position.y = 2;
        scene.add(trunk);
        const leaf = new THREE.Mesh(leafGeo, leafMats[Math.floor(rng() * 2)]);
        leaf.position.copy(base);
        leaf.position.y = 5.2;
        scene.add(leaf);
      } else {
        // building
        const h = 8 + rng() * 26;
        const w = 6 + rng() * 8;
        const b = new THREE.Mesh(
          buildingGeo,
          new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(0.08 + rng() * 0.08, 0.35, 0.55 + rng() * 0.2),
          })
        );
        b.scale.set(w, h, w);
        b.position.copy(base);
        b.position.y = h / 2;
        scene.add(b);
      }
    }
  }

  return { curve, samples, halfWidth };
}
