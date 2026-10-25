
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as S from './shaders';

const A = (p: string) => import.meta.env.BASE_URL + p;
const ENV_MAP = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map((n) => A(`envmap/${n}.png`));


const SECTION_ROT = {
  default: { animationIntensity: 0, baseRotationSpeed: 0, returnToOriginForce: 2, velocityMultiplier: 0, scrollSpeedRotationFactor: 0, hoverRotationMultiplier: 0 },
  kv: { animationIntensity: 0, baseRotationSpeed: 0, returnToOriginForce: 2, velocityMultiplier: 0, scrollSpeedRotationFactor: 0, hoverRotationMultiplier: 1 },
  works_intro: { animationIntensity: 1, baseRotationSpeed: 0.5, returnToOriginForce: 0.4, velocityMultiplier: 0.01, scrollSpeedRotationFactor: 0.001, hoverRotationMultiplier: 0.2 },
  works: { animationIntensity: 1, baseRotationSpeed: 0.5, returnToOriginForce: 0.1, velocityMultiplier: 0.01, scrollSpeedRotationFactor: 0.001, hoverRotationMultiplier: 0.2 },
  works_outro: { animationIntensity: 0, baseRotationSpeed: 0, returnToOriginForce: 2, velocityMultiplier: 0, scrollSpeedRotationFactor: 0, hoverRotationMultiplier: 0 },
  mission_in: { animationIntensity: 0, baseRotationSpeed: 0, returnToOriginForce: 2, velocityMultiplier: 0, scrollSpeedRotationFactor: 0, hoverRotationMultiplier: 0 },
  mission: { animationIntensity: 0, baseRotationSpeed: 0, returnToOriginForce: 2, velocityMultiplier: 0, scrollSpeedRotationFactor: 0, hoverRotationMultiplier: 0 },
  vision: { animationIntensity: 0, baseRotationSpeed: 0, returnToOriginForce: 1.5, velocityMultiplier: 0, scrollSpeedRotationFactor: 0, hoverRotationMultiplier: 0 },
  service_in: { animationIntensity: 0, baseRotationSpeed: 0, returnToOriginForce: 1.8, velocityMultiplier: 0, scrollSpeedRotationFactor: 0, hoverRotationMultiplier: 1 },
  service: { animationIntensity: 0, baseRotationSpeed: 0, returnToOriginForce: 1.8, velocityMultiplier: 0, scrollSpeedRotationFactor: 0, hoverRotationMultiplier: 1 },
  stellla: { animationIntensity: 0, baseRotationSpeed: 0, returnToOriginForce: 2, velocityMultiplier: 0, scrollSpeedRotationFactor: 0, hoverRotationMultiplier: 0 },
};

const AXIS_Y = new THREE.Vector3(0, 1, 0);
const QUAT_IDENTITY = new THREE.Quaternion();

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const damp = (c, t, l, dt) => c + (t - c) * (1 - Math.exp(-l * dt));
const lerp = (a, b, t) => a + (b - a) * t;

const sigmoid6 = (m) => {
  const a = Math.exp(-6 * (2 * m - 1));
  const d = Math.exp(-6);
  return (1 + ((1 - a) / (1 + a)) * ((1 + d) / (1 - d))) / 2;
};


type LerpValue = { target: number; current: number; velocity: number; multiplier: number };

class Lerper {
  _values: Map<string, LerpValue>;
  constructor() {
    this._values = new Map();
  }
  set(name: string, target: number, multiplier = 1) {
    const v = this._values.get(name);
    if (v === undefined) {
      this._values.set(name, { target, current: target, velocity: 0, multiplier });
      return target;
    }
    v.target = target;
    v.multiplier = multiplier;
    v.velocity = v.target - v.current;
    return v.current;
  }
  get(name: string) { return this._values.get(name); }
  update(dt: number) {
    this._values.forEach((v) => {
      v.velocity = v.target - v.current;
      v.current += v.velocity * Math.min(1, dt * 10 * v.multiplier);
    });
  }
}

function mergeUniforms(...list: any[]): Record<string, THREE.IUniform> {
  const out: Record<string, THREE.IUniform> = {};
  for (const u of list) if (u) for (const k in u) out[k] = u[k];
  return out;
}

function emptyTexture() {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}


function createSVGTexture(url: string, size: number) {
  return new Promise<THREE.CanvasTexture>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      tex.flipY = false;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      resolve(tex);
    };
    img.onerror = reject;
    img.src = url;
  });
}


class PostProcessPass extends THREE.ShaderMaterial {
  renderTarget: THREE.WebGLRenderTarget;
  passThrough: boolean;
  resolution: THREE.Vector2;
  resolutionInv: THREE.Vector2;
  resolutionRatio: number;
  constructor(i: any = {}) {
    const { renderTarget, resolutionRatio, passThrough, ...p } = i;
    const m = mergeUniforms(p.uniforms, {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uResolutionInv: { value: new THREE.Vector2(1, 1) },
    });
    super({
      ...p,
      vertexShader: i.vertexShader ?? S.quadVert,
      fragmentShader: i.fragmentShader ?? S.outFrag,
      uniforms: m,
      depthTest: false,
      depthWrite: false,
    });
    this.renderTarget = renderTarget === undefined ? new THREE.WebGLRenderTarget(1, 1) : renderTarget;
    this.passThrough = passThrough || false;
    this.resolution = m.uResolution.value;
    this.resolutionInv = m.uResolutionInv.value;
    this.resolutionRatio = resolutionRatio || 1;
  }
  resize(v: THREE.Vector2) {
    this.resolution.copy(v).multiplyScalar(this.resolutionRatio).floor();
    this.resolutionInv.set(1, 1).divide(this.resolution);
    if (this.renderTarget) this.renderTarget.setSize(this.resolution.x, this.resolution.y);
  }
}

class PostProcess {
  renderer: THREE.WebGLRenderer;
  passes: PostProcessPass[];
  scene: THREE.Scene;
  quad: THREE.Mesh;
  camera: THREE.Camera;
  constructor({ renderer, passes }: { renderer: THREE.WebGLRenderer; passes: PostProcessPass[] }) {
    this.renderer = renderer;
    this.passes = passes;
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.camera = new THREE.Camera();
  }
  render(input: THREE.Texture | null) {
    const prevTarget = this.renderer.getRenderTarget();
    const prevAuto = this.renderer.autoClear;
    this.renderer.autoClear = false;
    let p: THREE.Texture | null = input || null;
    for (const g of this.passes) {
      this.quad.material = g;
      g.uniforms.uBackBuffer = { value: p };
      this.renderer.setRenderTarget(g.renderTarget);
      this.renderer.clear(true, true, true);
      this.renderer.render(this.scene, this.camera);
      if (!g.passThrough && g.renderTarget) p = g.renderTarget.texture;
    }
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.autoClear = prevAuto;
    return p;
  }
  resize(v: THREE.Vector2) { for (const o of this.passes) o.resize(v); }
}


class ProceduralTexture {
  pass: PostProcessPass;
  post: PostProcess;
  constructor({ renderer, resolution, fragmentShader, uniforms, resolutionRatio = 1 }:
    { renderer: THREE.WebGLRenderer; resolution: THREE.Vector2; fragmentShader: string; uniforms: Record<string, THREE.IUniform>; resolutionRatio?: number }) {

    this.pass = new PostProcessPass({
      fragmentShader,
      uniforms,
      resolutionRatio,
    });
    const rt = this.pass.renderTarget;
    rt.texture.wrapS = rt.texture.wrapT = THREE.RepeatWrapping;
    this.post = new PostProcess({ renderer, passes: [this.pass] });
    this.resize(resolution);
  }
  get texture() { return this.pass.renderTarget.texture; }
  resize(v: THREE.Vector2) { this.pass.resize(v); }
  render() { this.post.render(null); }
}


class GPUComputationController {
  renderer: THREE.WebGLRenderer;
  dataSize: THREE.Vector2;
  uniforms: Record<string, THREE.IUniform>;
  scene: THREE.Scene;
  camera: THREE.Camera;
  mesh: THREE.Mesh;
  constructor(renderer: THREE.WebGLRenderer, resolution: THREE.Vector2) {
    this.renderer = renderer;
    this.dataSize = resolution.clone();
    this.uniforms = { dataSize: { value: this.dataSize } };
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  createData() {
    const opt = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    };
    const a = new THREE.WebGLRenderTarget(this.dataSize.x, this.dataSize.y, opt);
    const b = new THREE.WebGLRenderTarget(this.dataSize.x, this.dataSize.y, opt);
    return {
      read: a, write: b,
      get texture() { return this.read.texture; },
      swap() { const t = this.read; this.read = this.write; this.write = t; },
    };
  }
  createKernel({ fragmentShader, uniforms }: { fragmentShader: string; uniforms: Record<string, THREE.IUniform> }) {
    return new THREE.ShaderMaterial({
      vertexShader: S.quadVert,
      fragmentShader,
      uniforms: mergeUniforms(uniforms, this.uniforms),
      depthTest: false,
      depthWrite: false,
    });
  }
  compute(kernel: THREE.ShaderMaterial, data: any) {
    this.mesh.material = kernel;
    const prev = this.renderer.getRenderTarget();
    const prevAuto = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.setRenderTarget(data.write);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prev);
    this.renderer.autoClear = prevAuto;
    data.swap();
  }
}

class StableFluids {
  renderer: THREE.WebGLRenderer;
  parameter: { solverIteration: number; screenAspect: number; pointerSize: number; curl: number; velocityAttenuation: number; pressureAttenuation: number };
  gc: GPUComputationController;
  kernels: Record<string, THREE.ShaderMaterial>;
  fluidData: any;
  curlData: any;
  constructor(renderer: THREE.WebGLRenderer, commonUniforms: Record<string, THREE.IUniform>, resolution: THREE.Vector2) {
    this.renderer = renderer;
    this.parameter = {
      solverIteration: 4, screenAspect: 1, pointerSize: 0.1,
      curl: 0.02, velocityAttenuation: 0.99, pressureAttenuation: 0,
    };
    this.gc = new GPUComputationController(renderer, resolution);
    const K = (fs, u) => this.gc.createKernel({ fragmentShader: fs, uniforms: u });
    this.kernels = {
      curl: K(S.comShaderCurl, { dataTex: { value: null }, curl: { value: null } }),
      divergence: K(S.comShaderDivergence, { dataTex: { value: null } }),
      velocity: K(S.comShaderVelocity, mergeUniforms(commonUniforms, {
        dataTex: { value: null }, curlTex: { value: null },
        pointerPos: { value: new THREE.Vector2() }, pointerVec: { value: new THREE.Vector2() },
        screenAspect: { value: 1 }, pointerSize: { value: 0.1 },
      })),
      gradientSubtract: K(S.comShaderGradientSubtract, { dataTex: { value: null } }),
      pressure: K(S.comShadePressure, { dataTex: { value: null } }),
      advect: K(S.comShaderAdvect, {
        dataTex: { value: null },
        velocityAttenuation: { value: 0.99 },
        pressureAttenuation: { value: 0 },
      }),
    };
    this.fluidData = this.gc.createData();
    this.curlData = this.gc.createData();
  }
  get texture() { return this.fluidData.texture; }
  update(dt: number) {
    const p = this.parameter;
    const k = this.kernels;
    k.curl.uniforms.curl.value = p.curl;
    k.velocity.uniforms.screenAspect.value = p.screenAspect;
    k.velocity.uniforms.pointerSize.value = p.pointerSize;
    k.advect.uniforms.velocityAttenuation.value = p.velocityAttenuation;
    k.advect.uniforms.pressureAttenuation.value = p.pressureAttenuation;
    k.curl.uniforms.dataTex.value = this.fluidData.texture;
    this.gc.compute(k.curl, this.curlData);
    k.velocity.uniforms.dataTex.value = this.fluidData.texture;
    k.velocity.uniforms.curlTex.value = this.curlData.texture;
    this.gc.compute(k.velocity, this.fluidData);
    k.divergence.uniforms.dataTex.value = this.fluidData.texture;
    this.gc.compute(k.divergence, this.fluidData);
    for (let i = 0; i < p.solverIteration; i++) {
      k.pressure.uniforms.dataTex.value = this.fluidData.texture;
      this.gc.compute(k.pressure, this.fluidData);
    }
    k.gradientSubtract.uniforms.dataTex.value = this.fluidData.texture;
    this.gc.compute(k.gradientSubtract, this.fluidData);
    k.advect.uniforms.dataTex.value = this.fluidData.texture;
    this.gc.compute(k.advect, this.fluidData);

    k.velocity.uniforms.pointerVec.value.multiplyScalar(0.5);
  }

  setPointer(pos, delta) {
    const v = this.kernels.velocity.uniforms.pointerVec.value;
    const dx = Math.sign(delta.x) * Math.pow(Math.abs(delta.x), 1.6);
    const dy = Math.sign(delta.y) * Math.pow(Math.abs(delta.y), 1.6);
    v.x += dx;
    v.y -= dy;
    if (v.x > 1) v.x = 1; else if (v.x < -1) v.x = -1;
    if (v.y > 1) v.y = 1; else if (v.y < -1) v.y = -1;
    this.kernels.velocity.uniforms.pointerPos.value.set(pos.x * 0.5 + 0.5, pos.y * 0.5 + 0.5);
  }
  resize(v) {
    this.gc.dataSize.copy(v);
    this.fluidData.read.setSize(v.x, v.y);
    this.fluidData.write.setSize(v.x, v.y);
    this.curlData.read.setSize(v.x, v.y);
    this.curlData.write.setSize(v.x, v.y);
  }
}


function createQuadTreeGeometry() {
  const box = new THREE.BoxGeometry(1, 1, 0.005, 4, 4, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', box.attributes.position);
  geo.setAttribute('uv', box.attributes.uv);
  geo.setAttribute('normal', box.attributes.normal);
  geo.setIndex(box.index);
  const ip = [], is = [], id = [], idep = [];
  const MAX = 3;
  const walk = (c, depth) => {
    const size = 1 / Math.pow(2, depth);
    if ((depth > 2 && Math.random() < 0.5) || depth > MAX) {
      ip.push(c.x, c.y, 0);
      is.push(size, size);
      id.push(Math.random(), Math.random(), Math.random(), Math.random());
      idep.push(depth);
      return;
    }
    for (let y = 0; y < 2; y++) {
      const by = (y * 2 - 1) * 0.5;
      for (let x = 0; x < 2; x++) {
        const bx = (x * 2 - 1) * 0.5;
        walk(new THREE.Vector2(c.x + bx * size / 2, c.y + by * size / 2), depth + 1);
      }
    }
  };
  walk(new THREE.Vector2(0, 0), 0);
  geo.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(new Float32Array(ip), 3));
  geo.setAttribute('instanceScale', new THREE.InstancedBufferAttribute(new Float32Array(is), 2));
  geo.setAttribute('instanceID', new THREE.InstancedBufferAttribute(new Float32Array(id), 4));
  geo.setAttribute('instanceDepth', new THREE.InstancedBufferAttribute(new Float32Array(idep), 1));
  return geo;
}


export async function initGL({ container, works }: { container: HTMLElement | null; works: { el: Element; image: string }[] }) {
  if (!container) return null;

  let renderer;
  try {

    const dbgMode = typeof location !== 'undefined' && /[?&]dbg\b/.test(location.search);
    renderer = new THREE.WebGLRenderer({
      antialias: false, alpha: false, powerPreference: 'high-performance',
      preserveDrawingBuffer: dbgMode,
    });
  } catch (e) {
    console.warn('[aetla] WebGL 初始化失败', e);
    return null;
  }
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight, false);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;
  container.appendChild(renderer.domElement);


  const blank = emptyTexture();
  const noiseFluids = emptyTexture();
  const U = {
    uScreenResolution: { value: new THREE.Vector2(1, 1) },
    uScreenResolutionInverse: { value: new THREE.Vector2(1, 1) },
    uScreenAspectRatio: { value: 1 },
    uTime: { value: 0 },
    uFluidsTex: { value: noiseFluids },
    uLoaded: { value: 0 },
    uTransition: { value: 0 },
    uSPWeight: { value: 0 },
    uNoise: { value: 0 },
    uMousePos: { value: new THREE.Vector2() },
    uPosX: { value: 0 },
    uScrollVelocity: { value: 0 },
    uEnvMap: { value: null },
    uNoiseTex: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
  };

  const envMap = new THREE.CubeTextureLoader().load(ENV_MAP);
  envMap.mapping = THREE.CubeReflectionMapping;
  U.uEnvMap.value = envMap;


  const camera = new THREE.PerspectiveCamera(46.25, 1, 0.1, 1000);
  camera.position.set(0, 0, 10);
  camera.userData.basePos = new THREE.Vector3(0, 0, 10);
  camera.userData.baseFov = 46.25;
  camera.lookAt(0, 0, 0);

  const scene = new THREE.Scene();


  const noiseTex = new ProceduralTexture({
    renderer,
    resolution: new THREE.Vector2(64, 64),
    fragmentShader: S.noiseFrag,
    uniforms: mergeUniforms(U, { uTex: { value: null }, uScreenAspectRatio: { value: 1 } }),
    resolutionRatio: 1,
  });
  noiseTex.render();
  U.uNoiseTex.value = noiseTex.texture;


  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: S.bgVert,
      fragmentShader: S.bgFrag,
      uniforms: mergeUniforms(U),
      depthTest: false,
      depthWrite: false,
    })
  );
  bg.frustumCulled = false;
  bg.renderOrder = -1000;
  scene.add(bg);


  const quadU = mergeUniforms(U, {
    uScale: { value: new THREE.Vector3(1, 1, 1) },
    uUVShift: { value: 0 }, uUVShiftPower: { value: 0 }, uUVShiftHash: { value: 0 },
    uBlackOut: { value: 0 }, uBlackOutHash: { value: 0 },
    uPatternSelect: { value: 0 }, uPatternSelectType: { value: 0 }, uPatternType: { value: 0 },
    uPatternCurrent: { value: null }, uPatternNext: { value: null },
    uLogoTex: { value: null }, uLogoDisplayType: { value: 0 },
    uWorks1Tex: { value: blank }, uWorks1Loaded: { value: 0 }, uWorks1Aspect: { value: 16 / 9 },
    uWorks2Tex: { value: blank }, uWorks2Loaded: { value: 0 }, uWorks2Aspect: { value: 16 / 9 },
    uWorksTitleTex: { value: null }, uWorksTitleProgress: { value: 0 },
    uScroll: { value: 0 }, uScrollPage: { value: 0 }, uScrollPageLerp: { value: 0 },
    uHide: { value: 0 }, uHideQuad: { value: 0 },
    uDark: { value: 0 }, uTileRotate: { value: 0 },
    uWorksBlockAnim: { value: 0 }, uWOrksBlockAnimHash1: { value: 0 }, uWOrksBlockAnimHash2: { value: 0 },
  });
  const patternParams = [
    { blackOut: 0, blakcOutRandom: 0, blackOutInterval: 1, blackOutIntervalRandom: 0, uvShift: 0, uvShiftRandom: 0, uvShiftInterval: 0.2, uvShiftIntervalRandom: 0.5, ratio: 0.3 },
    { blackOut: 0, blakcOutRandom: 0.5, blackOutInterval: 1, blackOutIntervalRandom: 0, uvShift: 0.5, uvShiftRandom: 0, uvShiftInterval: 0.1, uvShiftIntervalRandom: 5, ratio: 0.8 },
    { blackOut: 0, blakcOutRandom: 0.5, blackOutInterval: 1, blackOutIntervalRandom: 0, uvShift: 0.5, uvShiftRandom: 0, uvShiftInterval: 0.1, uvShiftIntervalRandom: 5, ratio: 0.8 },
  ];

  const WORKS_BG_TEX_SIZE = 512;

  const worksBlurWeights = {
    value: (() => {
      const w = [];
      let c = 0;
      for (let p = 0; p < 2; p++) {
        const m = 1 + 2 * p;
        let g = Math.exp((-0.5 * (m * m)) / 100);
        w[p] = g;
        if (p > 0) g *= 2;
        c += g;
      }
      for (let p = 0; p < 2; p++) w[p] /= c;
      return w;
    })(),
  };
  const worksBlurPP = new PostProcess({
    renderer,
    passes: [true, false].map((isV) =>
      new PostProcessPass({
        glslVersion: THREE.GLSL3,
        fragmentShader: S.blurFrag,
        uniforms: { uWeights: worksBlurWeights, uIsVertical: { value: isV }, blurRange: { value: 1 } },
        defines: { GAUSS_WEIGHTS: '2' },
        resolutionRatio: 0.5,
      })
    ),
  });

  function downsampleWorksTexture(tex, rt) {
    worksBlurPP.passes[1].renderTarget = rt;
    worksBlurPP.resize(new THREE.Vector2(WORKS_BG_TEX_SIZE, WORKS_BG_TEX_SIZE));
    worksBlurPP.render(tex);
  }

  const patterns = [S.pattern1Frag, S.pattern2Frag, S.pattern3Frag].map((fs, i) => {
    const pt = new ProceduralTexture({
      renderer,
      resolution: new THREE.Vector2(512, 512),
      fragmentShader: fs,
      uniforms: mergeUniforms(U, { uNoiseTex: { value: noiseTex.texture } }),
      resolutionRatio: patternParams[i].ratio,
    });
    pt.render();
    return pt;
  });
  let patternIndex = 0;
  quadU.uPatternCurrent.value = patterns[0].texture;
  quadU.uPatternNext.value = patterns[0].texture;

  const quadMat = new THREE.ShaderMaterial({
    vertexShader: S.bgQuadVert,
    fragmentShader: S.bgQuadFrag,
    uniforms: mergeUniforms(quadU),
    defines: { WORKS_NUM: String(Math.max(1, works.length)) },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const bgQuadTree = new THREE.Mesh(createQuadTreeGeometry(), quadMat);
  bgQuadTree.frustumCulled = false;
  bgQuadTree.renderOrder = -1000;
  scene.add(bgQuadTree);

  const texLoader = new THREE.TextureLoader();
  texLoader.load(A('img/logo.png'), (t) => { quadU.uLogoTex.value = t; });
  texLoader.load(A('img/works-title.png'), (t) => { t.wrapS = THREE.RepeatWrapping; quadU.uWorksTitleTex.value = t; });


  function makeGrid(theme, orientation) {
    const gridU = mergeUniforms(U, {
      uGrid: { value: new THREE.Vector2(64, 64) },
      uScale: { value: new THREE.Vector3(1, 1, 1) },
      uScroll: { value: 0 },
    });
    const defs = {
      IS_GRID: '',
      [`IS_${orientation.toUpperCase()}`]: '',
      [`IS_${theme.toUpperCase()}`]: '',
    };
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1, 64, 64),
      new THREE.ShaderMaterial({
        name: 'GridMaterial',
        uniforms: gridU, vertexShader: S.gridVert, fragmentShader: S.gridFrag_1,
        transparent: true, defines: defs, depthWrite: false, depthTest: false,
      })
    );
    g.frustumCulled = false;
    g.renderOrder = -999;

    const cc = new THREE.Vector2(8, 8);
    const ids = [];
    for (let j = 0; j <= cc.y; j++) for (let i = 0; i <= cc.x; i++) ids.push(i / cc.x, j / cc.y);
    const base = new THREE.PlaneGeometry(1, 1, 8, 8);
    const inst = new THREE.InstancedBufferGeometry();
    inst.setAttribute('position', base.getAttribute('position'));
    inst.setAttribute('uv', base.getAttribute('uv'));
    inst.setAttribute('instanceId', new THREE.InstancedBufferAttribute(new Float32Array(ids), 2));
    inst.setIndex(base.getIndex());
    const cross = new THREE.Mesh(inst, new THREE.ShaderMaterial({
      name: 'GridCrossMaterial',
      uniforms: mergeUniforms(gridU, { uGridCross: { value: cc } }),
      vertexShader: S.gridVert, fragmentShader: S.crossFrag_1,
      transparent: true, defines: { ...defs, IS_CROSS: '' },
      depthWrite: false, depthTest: false,
    }));
    cross.frustumCulled = false;
    cross.renderOrder = -999;
    g.add(cross);
    return { mesh: g, u: gridU };
  }

  const { mesh: grid, u: gridU } = makeGrid('light', 'round');
  scene.add(grid);


  const mvScene = new THREE.Scene();
  mvScene.background = new THREE.Color('#D7DBDC');
  const mvCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  mvCamera.position.set(0, 0, 8);
  const mvOCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
  const { mesh: mvGrid, u: mvGridU } = makeGrid('dark', 'flat');
  mvScene.add(mvGrid);


  function mvGridResize() {
    const ow = mvOCamera.right - mvOCamera.left;
    const oh = mvOCamera.top - mvOCamera.bottom;
    const s = ow < oh ? oh : ow;
    mvGridU.uScale.value.set(s, s, 1);
  }


  const logo2DU = mergeUniforms(U, { uTex: { value: null }, uVisibility: { value: 0 } });
  const logo2D = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 28 * (250 / 1204)),
    new THREE.ShaderMaterial({
      vertexShader: S.logo2DVert, fragmentShader: S.logo2DFrag,
      uniforms: mergeUniforms(logo2DU), transparent: true,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  texLoader.load(A('img/logo.png'), (t) => { logo2DU.uTex.value = t; });
  scene.add(logo2D);



  const thumbU = { uScrollVelocity: { value: 0 }, uNumWorks: { value: 0 }, uCurrentIndex: { value: 0 } };
  const thumbsGroup = new THREE.Group();

  const thumbScene = new THREE.Scene();
  thumbScene.add(thumbsGroup);




  const logoScene = new THREE.Scene();
  const logoGroup = new THREE.Group();
  logoScene.add(logoGroup);
  const logoU = mergeUniforms(U, {
    uTrnsTex: { value: null }, uTrnsWinRes: { value: new THREE.Vector2(512, 512) },
    uNoiseTex: { value: noiseTex.texture },
    uHideQuad: { value: 0 }, uKvOutVisibility: { value: 1 }, uScrollOutro: { value: 0 },
    uRoughness: { value: 0.1 }, uNoiseScale: { value: 9 },
    uMaterialColor: { value: new THREE.Vector3(255, 255, 255) },
    uVisionRotate: { value: 0 }, uServiceIn: { value: 0 }, uServiceRotate: { value: 0 },
  });
  const logoMat = new THREE.ShaderMaterial({
    vertexShader: S.mainLogoVert, fragmentShader: S.mainLogoFrag,
    uniforms: logoU, transparent: true,
  });

  const outlineBaseMat = new THREE.ShaderMaterial({
    vertexShader: S.mainLogoVert, fragmentShader: S.mainLogoOutlineFrag,
    uniforms: mergeUniforms(logoU), transparent: true, defines: { IS_BASE: '' },
  });

  const screenMat = new THREE.ShaderMaterial({
    vertexShader: S.mainLogoVert, fragmentShader: S.mainLogoScreenFrag,
    uniforms: mergeUniforms(logoU, {
      uSceneTex: { value: blank },
      uNoiseTex: { value: noiseTex.texture },
      uScreenNoiseScale: { value: 1 },
    }),
    transparent: true, defines: { IS_SCREEN: '' },
  });

  const logoOutlineContainer = new THREE.Object3D();
  logoOutlineContainer.matrixAutoUpdate = false;
  logoOutlineContainer.matrixWorldAutoUpdate = false;
  logoGroup.add(logoOutlineContainer);


  const gltf = await new GLTFLoader().loadAsync(A('models/scene.glb'));
  let logoMesh = null;
  const logoGeo = (gltf.scene.getObjectByName('Aetla_A') as THREE.Mesh | undefined)?.geometry;
  if (logoGeo) {
    if (!logoGeo.getAttribute('color')) {
      const n = logoGeo.getAttribute('position').count;
      logoGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
    logoMesh = new THREE.Mesh(logoGeo, logoMat);
    logoMesh.scale.setScalar(3);
    logoMesh.renderOrder = 101;
    logoGroup.add(logoMesh);

    const base = new THREE.Mesh(logoGeo, outlineBaseMat);
    base.matrixAutoUpdate = false;
    base.renderOrder = 10;
    logoOutlineContainer.add(base);



    const sideGeo = (gltf.scene.getObjectByName('Aetla_SideScreen') as THREE.Mesh | undefined)?.geometry;
    if (sideGeo) {
      const side = new THREE.Mesh(sideGeo, screenMat);
      side.matrixAutoUpdate = false;
      side.renderOrder = 12;
      logoOutlineContainer.add(side);
    }
  }

  const thumbnails = [];
  const screenGeo = (gltf.scene.getObjectByName('ThumbnailScreen') as THREE.Mesh | undefined)?.geometry;
  const workTextures = [];

  const loadState = { target: 0, t: 0 };
  const noop = () => {};
  if (screenGeo) {
    works.forEach((w) => {
      const own: any = {
        uTex: { value: blank }, uTexAspect: { value: 16 / 9 },
        uAlpha: { value: 0 }, uPosX: { value: 0 },
        uLoaded: { value: 0 }, uWorksProgress: { value: 0 },
      };
      own.loadedTarget = 0;

      own.bgRT = new THREE.WebGLRenderTarget(1, 1);
      own.bgRT.texture.wrapS = own.bgRT.texture.wrapT = THREE.MirroredRepeatWrapping;
      const mesh = new THREE.Mesh(screenGeo, new THREE.ShaderMaterial({
        vertexShader: S.worksThumbnailVert, fragmentShader: S.worksThumbnailFrag,

        uniforms: mergeUniforms(U, thumbU, own), transparent: true, side: THREE.FrontSide,
      }));
      mesh.frustumCulled = false;
      mesh.userData.own = own;
      thumbsGroup.add(mesh);
      thumbnails.push(mesh);
      const idx = workTextures.length;
      workTextures.push(own);
      texLoader.load(w.image, (t) => {

        t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
        own.uTex.value = t;
        if (t.image) own.uTexAspect.value = (t.image.width || 16) / (t.image.height || 9);
        downsampleWorksTexture(t, own.bgRT);
        own.loadedTarget = 1;
        noop();
      }, undefined, noop);
    });
  }


  const fluidRes = new THREE.Vector2(256, 256);
  const fluids = new StableFluids(renderer, U, fluidRes);
  U.uFluidsTex.value = fluids.texture;



  const rtMainScene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const rtMissionVisionScene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const rtThumbnail = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const rtTrns = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: false });


  const BLOOM_COUNT = 3;
  const gauss = (n) => {
    const w = [];
    let c = 0;
    for (let p = 0; p < n; p++) { const m = 1 + 2 * p; let g = Math.exp((-0.5 * (m * m)) / 100); w[p] = g; if (p > 0) g *= 2; c += g; }
    for (let p = 0; p < n; p++) w[p] /= c;
    return w;
  };

  const topSceneMixer = new PostProcessPass({
    glslVersion: THREE.GLSL3, fragmentShader: S.topSceneMixerFrag,
    renderTarget: new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }),
    uniforms: mergeUniforms(U, {
      uMainSceneTex: { value: rtMainScene.texture },
      uMissionVisionSceneTex: { value: rtMissionVisionScene.texture },
      uServiceSceneTex: { value: blank },
      uVisibleMissionVision: { value: 0 },
      uVisibleMissionVisionMotionBlur: { value: 0 },
      uVisibleService: { value: 0 },
      uNoiseTex: { value: noiseTex.texture },
    }),
  });
  const bloomBright = new PostProcessPass({
    glslVersion: THREE.GLSL3, fragmentShader: S.bloomBrightFrag,
    uniforms: mergeUniforms(U, { threshold: { value: 0.9 } }), passThrough: true,
  });
  const bloomTextures = [];
  const bloomBlur = [];
  {
    const shared = mergeUniforms(U, { uWeights: { value: gauss(BLOOM_COUNT) } });
    let prev = bloomBright.renderTarget.texture;
    let m = 4;
    for (let g = 0; g < BLOOM_COUNT; g++) {
      const v = new PostProcessPass({
        glslVersion: THREE.GLSL3, fragmentShader: S.bloomBlurFrag,
        uniforms: mergeUniforms(shared, { uIsVertical: { value: true }, uBloomBackBuffer: { value: prev }, blurRange: { value: 1 } }),
        defines: { GAUSS_WEIGHTS: String(BLOOM_COUNT) }, resolutionRatio: 1 / m, passThrough: true,
      });
      const h = new PostProcessPass({
        glslVersion: THREE.GLSL3, fragmentShader: S.bloomBlurFrag,
        uniforms: mergeUniforms(shared, { uIsVertical: { value: false }, uBloomBackBuffer: { value: v.renderTarget.texture }, blurRange: { value: 1 } }),
        defines: { GAUSS_WEIGHTS: String(BLOOM_COUNT) }, resolutionRatio: 1 / m, passThrough: true,
      });
      bloomBlur.push(v, h);
      bloomTextures.push(h.renderTarget.texture);
      prev = h.renderTarget.texture;
      m *= 2;
    }
  }
  const sceneComposite = new PostProcessPass({
    glslVersion: THREE.GLSL3, fragmentShader: S.topSceneCompositeFrag,
    uniforms: mergeUniforms(U, {
      uBloomTexture: { value: bloomTextures },
      uBrightness: { value: 1 },
      uNotFoundSceneTex: { value: blank },
      uNotFoundVisibility: { value: 0 },
      uAsciiTexture: { value: blank },
    }),
    defines: { BLOOM_COUNT: String(BLOOM_COUNT) },
  });

  const loadingSVGU: { value: THREE.Texture } = { value: blank };
  createSVGTexture(A('common/loading.svg'), 2048)
    .then((t) => { loadingSVGU.value = t; })
    .catch(() => {  });

  const finalComposite = new PostProcessPass({
    glslVersion: THREE.GLSL3, fragmentShader: S.finalCompositeFrag,
    uniforms: mergeUniforms(U, {

      uThumbnailSceneTex: { value: rtThumbnail.texture },
      uSubPageSelector: { value: 0 },
      uLoadingSVGTex: loadingSVGU,
    }),
    renderTarget: null,
  });
  const scenePostProcess = new PostProcess({
    renderer,
    passes: [topSceneMixer, bloomBright, ...bloomBlur, sceneComposite],
  });
  const finalPostProcess = new PostProcess({ renderer, passes: [finalComposite] });


  const trnsPass = new PostProcessPass({
    fragmentShader: S.copyFrag, uniforms: { uTex: { value: null }, uBackBuffer: { value: null } },
  });
  const trnsPost = new PostProcess({ renderer, passes: [trnsPass] });


  let pw = 1, ph = 1;
  let spWeight = 0, baseFov = 46.25;

  function resize(w, h) {
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    pw = Math.max(2, Math.round(w * renderer.getPixelRatio()));
    ph = Math.max(2, Math.round(h * renderer.getPixelRatio()));
    const res = new THREE.Vector2(pw, ph);
    rtMainScene.setSize(pw, ph);
    rtMissionVisionScene.setSize(pw, ph);
    rtThumbnail.setSize(pw, ph);

    mvCamera.aspect = w / h;
    mvCamera.updateProjectionMatrix();

    let oRight = 4, oTop = 4;
    if (w / h < 1) oTop = 4 / (w / h); else oRight = 4 * (w / h);
    mvOCamera.left = -oRight; mvOCamera.right = oRight;
    mvOCamera.top = oTop; mvOCamera.bottom = -oTop;
    mvOCamera.updateProjectionMatrix();
    mvGridResize();
    U.uScreenResolution.value.set(pw, ph);
    U.uScreenResolutionInverse.value.set(1 / pw, 1 / ph);
    U.uScreenAspectRatio.value = w / h;
    logoU.uTrnsWinRes.value.set(pw, ph);
    scenePostProcess.resize(res);
    finalPostProcess.resize(res);
    trnsPost.resize(new THREE.Vector2(512, 512));
    noiseTex.resize(new THREE.Vector2(512, 512));

    const patternRes = res.clone().multiplyScalar(0.5);
    patterns.forEach((p) => p.resize(patternRes));

    const fr = new THREE.Vector2(256, 256);
    if (w / h < 1) fr.x = Math.floor(fr.y * (w / h));
    else fr.y = Math.floor(fr.x / (w / h));
    fluids.resize(fr);
    layout(w / h);
    patterns.forEach((p) => p.render());
  }

  function layout(aspect) {
    spWeight = clamp((16 / 9 - aspect) / (16 / 9 - 9 / 16));
    U.uSPWeight.value = spWeight;
    baseFov = 35 + 18 / aspect;
    camera.userData.baseFov = baseFov;


    const z = Math.abs(camera.userData.basePos.z);
    const m = 2 * z * Math.tan((baseFov / 2) * (Math.PI / 180));
    const g = m * aspect;
    const s = g < m ? m : g;
    gridU.uScale.value.set(s, s, 1);
    quadU.uScale.value.set(s, s, 1);

    logoGroup.position.set(0, -0.3 + 0.5 * spWeight, 0);
    logoGroup.scale.setScalar(4.3);
    logo2D.position.set(0, 1 * spWeight, -15);
    logo2D.scale.setScalar(0.55 * spWeight + 1 - spWeight);
    thumbsGroup.position.set(0, 0.8 * spWeight, 0);
    thumbsGroup.scale.setScalar(0.6 * spWeight + 1 - spWeight);
  }


  const st = {
    time: 0, kvZoom: 1, mouse: new THREE.Vector2(), mouseOffset: new THREE.Vector2(),
    lastY: 0, vel: 0, scrollPixVel: 0, logoVis: 1, thumbVis: 0, titleVis: 0, titleProg: 0, logo2DVis: 0,
    authW: 0,
    pointer: new THREE.Vector2(), pointerPrev: new THREE.Vector2(), pointerVec: new THREE.Vector2(),
    uvTimer: 0, blackTimer: 0, patternTimer: 0, patternFade: 0, patternFadeDur: 0.3,
    patternFrom: 0, geoSwap: 0,

    rotEuler: new THREE.Euler(), mouseQua: new THREE.Quaternion(),
    spinQua: new THREE.Quaternion(), worksRotate: 0,
    lerper: new Lerper(),
  };
  const tmpV = new THREE.Vector2();
  const mousePrev = new THREE.Vector2();
  const mouseSmooth = new THREE.Vector2();
  const ndcVel = new THREE.Vector2();

  function setPointer(x, y) { st.mouse.set(x, y); }


  function updateQuadTree(dt, s) {
    const pp = patternParams[patternIndex];

    st.uvTimer += dt;
    if (st.uvTimer > pp.uvShiftInterval + pp.uvShiftIntervalRandom * Math.random()) {
      st.uvTimer = 0;
      quadU.uUVShift.value = pp.uvShift + pp.uvShiftRandom * Math.random();
      quadU.uUVShiftHash.value = Math.random();
      quadU.uUVShiftPower.value = Math.random();
    }
    quadU.uUVShiftPower.value = damp(quadU.uUVShiftPower.value, 0, 1.2, dt);

    st.blackTimer += dt;
    if (st.blackTimer > pp.blackOutInterval + pp.blackOutIntervalRandom * Math.random()) {
      st.blackTimer = 0;
      quadU.uBlackOut.value = pp.blackOut + pp.blakcOutRandom * Math.random();
      quadU.uBlackOutHash.value = Math.random();
    }
    quadU.uBlackOut.value = damp(quadU.uBlackOut.value, 0, 3, dt);

    st.patternTimer += dt;
    if (st.patternTimer > Math.random() + st.patternFadeDur + 1) {
      st.patternTimer = 0;
      const type = s.section === 'kv' ? Math.floor(Math.random() * 3) : 0;
      st.patternFadeDur = [0, 0.3, 3][type];
      quadU.uPatternSelectType.value = type;
      quadU.uPatternSelect.value = 0;
      st.patternFade = 0;
      const next = Math.floor(Math.random() * patterns.length);
      quadU.uPatternNext.value = patterns[next].texture;
      patternIndex = next;
    }
    st.patternFade = Math.min(1, st.patternFade + dt / Math.max(0.016, st.patternFadeDur));
    quadU.uPatternSelect.value = st.patternFade;
    if (st.patternFade >= 1) {
      quadU.uPatternCurrent.value = quadU.uPatternNext.value;
      quadU.uPatternSelect.value = 0;
    }

    if (s.section === 'kv') {
      st.geoSwap += dt;
      if (st.geoSwap > 4) { st.geoSwap = 0; bgQuadTree.geometry = createQuadTreeGeometry(); }
    }

    const n0 = Math.max(1, workTextures.length);
    const prog = st.lerper.set('bgQuadProgress', clamp(s.worksProgress), 0.7) * (n0 + 1);
    const frac = prog % 1;
    const g = Math.floor(prog);
    quadU.uScrollPage.value = frac;
    quadU.uScrollPageLerp.value = frac;
    if (n0 >= 2) {

      const t1 = workTextures[Math.max(0, g - 1)];
      const t2 = workTextures[g];
      if (t1) {
        quadU.uWorks1Tex.value = t1.bgRT.texture;
        quadU.uWorks1Aspect.value = t1.uTexAspect.value;
        quadU.uWorks1Loaded.value = t1.uLoaded.value;
      }
      if (t2) {
        quadU.uWorks2Tex.value = t2.bgRT.texture;
        quadU.uWorks2Aspect.value = t2.uTexAspect.value;
        quadU.uWorks2Loaded.value = t2.uLoaded.value;
      }
    }

    quadU.uScroll.value = clamp(s.worksProgress);
    quadU.uWorksTitleProgress.value = st.titleProg;

  }

  function update(dt, s) {
    st.time += dt;
    U.uTime.value = st.time;
    st.lerper.update(dt);

    if (loadState.target > 0) loadState.t = Math.min(1, loadState.t + dt / 3);
    U.uLoaded.value = sigmoid6(loadState.t);

    camera.aspect = s.aspect;
    st.kvZoom = damp(st.kvZoom, s.section === 'kv' ? 1 : 0, 1.2, dt);
    camera.fov = baseFov - st.kvZoom * 4;

    const woPMouse = st.lerper.set('cameraController_worksOutro', clamp(s.worksOutroProgress), 0.5);
    tmpV.set(st.mouse.x, st.mouse.y).multiplyScalar(0.5 * (1 - woPMouse));
    st.mouseOffset.lerp(tmpV, Math.min(3 * dt, 1));
    camera.position.set(st.mouseOffset.x, st.mouseOffset.y, 10 - st.kvZoom * 0.5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    // 登录/注册覆盖层：logo 大文字与 3D 模型缩小并移到左侧 2/3 区域的中心（authW 由 s.auth 阻尼过渡）
    st.authW = damp(st.authW, s.auth ? 1 : 0, 3.5, dt);
    {
      const tanH = Math.tan((camera.fov / 2) * (Math.PI / 180));
      const halfW0 = tanH * camera.position.z * s.aspect; // z=0 处可见半宽
      const halfW2 = tanH * (camera.position.z - logo2D.position.z) * s.aspect; // logo2D 所在深度处可见半宽
      logoGroup.position.x = (-halfW0 / 3) * st.authW;
      logoGroup.scale.setScalar(4.3 * (1 - 0.4 * st.authW));
      logo2D.position.x = (-halfW2 / 3) * st.authW;
      logo2D.scale.setScalar((0.55 * spWeight + 1 - spWeight) * (1 - 0.4 * st.authW));
    }

    const woP = st.lerper.set('worksOutro_progress', clamp(s.worksOutroProgress), 1);
    if (woP > 0.001) {
      const a = camera.projectionMatrix.elements;
      const b = mvOCamera.projectionMatrix.elements;
      for (let i = 0; i < 16; i++) a[i] += (b[i] - a[i]) * woP;
    }


    const pm = Math.min(1, dt * 12);
    mouseSmooth.x += (st.mouse.x - mouseSmooth.x) * pm;
    mouseSmooth.y += (st.mouse.y - mouseSmooth.y) * pm;
    const idt = 1 / Math.max(dt, 1 / 240);

    const FLUID_VEL_GAIN = 0.1;
    ndcVel.set(clamp((mouseSmooth.x - mousePrev.x) * idt * FLUID_VEL_GAIN, -2, 2),
               clamp((mouseSmooth.y - mousePrev.y) * idt * FLUID_VEL_GAIN, -2, 2));
    mousePrev.copy(mouseSmooth);
    fluids.setPointer(mouseSmooth, ndcVel);
    fluids.parameter.screenAspect = s.aspect;
    fluids.update(dt);
    U.uFluidsTex.value = fluids.texture;

    const dy = s.scrollY - st.lastY;
    const vel = dy / Math.max(1, window.innerHeight);
    st.lastY = s.scrollY;
    st.vel = damp(st.vel, vel, 8, dt);

    st.scrollPixVel = st.lerper.set('mainLogo_lenisVelocity', clamp(dy, -30, 30), 0.5);
    U.uScrollVelocity.value = st.vel;
    gridU.uScroll.value = s.scrollY / Math.max(1, window.innerHeight);


    logoU.uKvOutVisibility.value = 1;
    logoGroup.visible = true;
    if (logoMesh) {
      const cfg = SECTION_ROT[s.section] || SECTION_ROT.default;
      st.worksRotate = damp(st.worksRotate, cfg.animationIntensity, 3, dt);


      st.lerper.set('mainLogo_hover_x', st.mouse.x, 1);
      st.lerper.set('mainLogo_hover_y', st.mouse.y, 1);
      const vx = st.lerper.get('mainLogo_hover_x')?.velocity || 0;
      const vy = st.lerper.get('mainLogo_hover_y')?.velocity || 0;
      const hoverM = 0.01 * Math.max(0, 1 - st.mouse.length() * 1.5) * cfg.hoverRotationMultiplier;
      st.rotEuler.x -= vy * hoverM * (1 - st.worksRotate * 0.7);
      st.rotEuler.y += vx * hoverM;
      const decay = 1 - dt;
      st.rotEuler.x *= decay;
      st.rotEuler.y *= decay;
      st.mouseQua.setFromEuler(st.rotEuler);


      st.spinQua.setFromAxisAngle(AXIS_Y,
        -dt * cfg.baseRotationSpeed * st.worksRotate - st.scrollPixVel * cfg.scrollSpeedRotationFactor);
      logoMesh.quaternion.premultiply(st.mouseQua);
      logoMesh.quaternion.premultiply(st.spinQua);
      logoMesh.quaternion.slerp(QUAT_IDENTITY, dt * cfg.returnToOriginForce * (1 - st.worksRotate * 0.8));
      // 先更新 logoGroup（position/scale 每帧可能变化），否则 outline 容器会滞后一帧，
      // 其 alpha=0 但写深度的 base/side 网格会在旧位置遮挡 logoMesh，导致移动时面片闪烁
      logoGroup.updateMatrixWorld(true);
      logoOutlineContainer.matrixWorld.copy(logoMesh.matrixWorld);
    }

    st.logo2DVis = damp(st.logo2DVis, s.section === 'kv' ? 1 : 0, 2.5, dt);
    logo2DU.uVisibility.value = st.logo2DVis;


    const n = thumbnails.length;
    const o = st.lerper.set('works_progress', clamp(s.worksProgress), 1) * (n + 1);
    const c = Math.round(o);
    const u = st.lerper.set('works_current_index', c - (c - o) * 0.4, 0.5);
    thumbU.uScrollVelocity.value = st.lerper.set('works_progress_velocity', st.lerper.get('works_progress')?.velocity || 0, 0.5);
    thumbU.uNumWorks.value = n;
    thumbU.uCurrentIndex.value = u;
    const pStart = Math.min(1, u * 2);
    const pEnd = Math.min(1, (n + 1 - u) * 2);
    thumbnails.forEach((mesh, i) => {
      const own = mesh.userData.own;
      const x = i + 1 - u;
      mesh.position.x = Math.sin(x) * 11;
      mesh.position.z = Math.cos(x) * 5 - 6;
      mesh.position.y = -x;
      mesh.rotation.y = x * 0.6;
      mesh.scale.setScalar(0.9 + 0.1 * spWeight + 0.2 * (1 - Math.min(1, Math.abs(x))));
      own.uPosX.value = x;

      const alpha = (1 - smoothstep(0.8, 2.5, Math.abs(x))) * pStart * pEnd;

      own.uAlpha.value = alpha;
      mesh.visible = alpha > 0.01;

      own.uLoaded.value += (own.loadedTarget - own.uLoaded.value) * Math.min(1, dt / 1);
      own.uWorksProgress.value = clamp(s.worksProgress);
    });


    st.titleProg = damp(st.titleProg, clamp(s.titleProgress), 3, dt);

    updateQuadTree(dt, s);


    mvGridU.uScroll.value = st.lerper.set('missionVisionScroll', s.scrollY / Math.max(1, window.innerHeight), 0.5);
    const vMission = st.lerper.set('mission_progress', clamp(s.missionProgress), 1.5);
    const visible = vMission;
    const mDiff = visible - topSceneMixer.uniforms.uVisibleMissionVision.value;
    const aDiff = mDiff - topSceneMixer.uniforms.uVisibleMissionVisionMotionBlur.value;
    topSceneMixer.uniforms.uVisibleMissionVisionMotionBlur.value += aDiff * 0.5;
    topSceneMixer.uniforms.uVisibleMissionVision.value += mDiff * 0.5;


    if (visible < 0.99) {
      renderer.setRenderTarget(rtMainScene);
      renderer.setClearAlpha(1);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
    }

    if (visible > 0.01) {
      renderer.setRenderTarget(rtMissionVisionScene);
      renderer.setClearAlpha(1);
      renderer.clear(true, true, true);
      renderer.render(mvScene, camera);
    }

    renderer.setRenderTarget(rtThumbnail);
    renderer.setClearAlpha(0);
    renderer.clear(true, true, true);
    renderer.render(thumbScene, camera);
    renderer.setClearAlpha(1);


    trnsPost.render(rtMainScene.texture);
    logoU.uTrnsTex.value = trnsPass.renderTarget.texture;


    if (logoGroup.visible) {
      renderer.setRenderTarget(rtMainScene);
      renderer.render(logoScene, camera);
    }


    const composed = scenePostProcess.render(null);
    finalPostProcess.render(composed);
  }

  resize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  noiseTex.render();
  patterns.forEach((p) => p.render());



  return {
    update, resize, setPointer, renderer, THREE,
    startIntro() { loadState.target = 1; },
    uniforms: { U, quadU, logoU, thumbU, mvGridU },
    nodes: { scene, mvScene, thumbsGroup, logoGroup, logoScene, grid, bgQuadTree, camera },
    pipeline: { rtMainScene, scenePostProcess, finalPostProcess },
  };
}
