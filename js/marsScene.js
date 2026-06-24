import * as THREE from "three";
import { OBJLoader } from "../vendor/OBJLoader.js";

const createMarsTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#9d3e22");
  gradient.addColorStop(0.45, "#d8783f");
  gradient.addColorStop(1, "#5f241b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 180; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const radius = 5 + Math.random() * 24;
    ctx.globalAlpha = 0.08 + Math.random() * 0.16;
    ctx.fillStyle = Math.random() > 0.5 ? "#2c1713" : "#f1a060";
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 1.6, radius * 0.58, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.2;
  ctx.fillStyle = "#f4d0a1";
  ctx.fillRect(0, 0, canvas.width, 18);
  ctx.fillRect(0, canvas.height - 18, canvas.width, 18);
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
};

const createOrbitRing = () => {
  const curve = new THREE.EllipseCurve(0, 0, 1.62, 0.52, 0, Math.PI * 2, false, 0);
  const points = curve.getPoints(160).map((point) => new THREE.Vector3(point.x, 0, point.y));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x7dd8ff, transparent: true, opacity: 0.34 });
  const line = new THREE.LineLoop(geometry, material);
  line.rotation.x = Math.PI * 0.55;
  return line;
};

const createStars = () => {
  const vertices = [];
  for (let i = 0; i < 520; i += 1) {
    vertices.push((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 12, -5 - Math.random() * 12);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.PointsMaterial({ color: 0xf5fbff, size: 0.018, transparent: true, opacity: 0.78 });
  return new THREE.Points(geometry, material);
};

export function mountMarsScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050505, 6, 16);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0.5, 5.2);

  const keyLight = new THREE.DirectionalLight(0xffdfb5, 2.4);
  keyLight.position.set(3.5, 2.5, 4);
  scene.add(keyLight);
  scene.add(new THREE.AmbientLight(0x607080, 0.72));
  scene.add(createStars());
  scene.add(createOrbitRing());

  const orbitPivot = new THREE.Group();
  scene.add(orbitPivot);

  const marsGroup = new THREE.Group();
  marsGroup.position.x = 0.22;
  orbitPivot.add(marsGroup);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.35, 48, 24),
    new THREE.MeshBasicMaterial({ color: 0xf2a56a, transparent: true, opacity: 0.075, depthWrite: false })
  );
  marsGroup.add(atmosphere);

  const moonMaterial = new THREE.MeshStandardMaterial({ color: 0xb8a99a, roughness: 0.9 });
  const moonOrbit = new THREE.Group();
  marsGroup.add(moonOrbit);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), moonMaterial);
  moon.position.set(1.72, 0.08, 0);
  moonOrbit.add(moon);

  const surfaceMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createMarsTexture(),
    roughness: 0.9,
    metalness: 0.02
  });

  const loader = new OBJLoader();
  loader.load(
    "./assets/mars.obj",
    (object) => {
      object.traverse((child) => {
        if (child.isMesh) {
          child.material = surfaceMaterial;
          child.geometry.computeBoundingSphere();
          child.geometry.computeVertexNormals();
        }
      });
      object.scale.setScalar(1.28);
      marsGroup.add(object);
      canvas.dataset.modelLoaded = "true";
    },
    undefined,
    () => {
      const fallback = new THREE.Mesh(new THREE.SphereGeometry(1.28, 64, 32), surfaceMaterial);
      marsGroup.add(fallback);
      canvas.dataset.modelLoaded = "fallback";
    }
  );

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const animate = () => {
    resize();
    orbitPivot.rotation.y += 0.0012;
    marsGroup.rotation.y += 0.008;
    moonOrbit.rotation.y -= 0.018;
    atmosphere.rotation.y -= 0.004;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };

  animate();
  window.addEventListener("resize", resize);
}
