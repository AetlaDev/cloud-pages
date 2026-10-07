import './styles/base.css';
import './styles/components.css';
import './styles/top.css';
import './styles/replica.css';

import Lenis from 'lenis';
import lottie from 'lottie-web';
import { splitChars, set, to } from './textfx';

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const A = (p: string) => import.meta.env.BASE_URL + p;

const body = document.body;
const scrollTop = () => window.scrollY || document.documentElement.scrollTop || 0;

let lenis: Lenis | null = null;
try {
  lenis = new Lenis({ duration: 1.1, smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1.6 });
} catch (e) {
  console.warn('[aetla] Lenis 初始化失败，使用原生滚动', e);
}

function scrollTo(target) {
  if (lenis) lenis.scrollTo(target, { duration: 1.2 });
  else window.scrollTo({ top: target, behavior: 'smooth' });
}


const sectionEls = [...document.querySelectorAll<HTMLElement>('.SectionContainer__container[data-top_section]')];
const worksItems = [...document.querySelectorAll<HTMLElement>('[data-works_item]')];
const workScrollItems = [...document.querySelectorAll<HTMLElement>('[data-top_works_item]')];
const markers = [...document.querySelectorAll<HTMLElement>('.MissionVision__marker')];
const missionContainer = document.querySelector<HTMLElement>('[data-mission-container]');
const missionTitle = document.querySelector<HTMLElement>('[data-mission-title]');
const indicatorItems = [...document.querySelectorAll<HTMLElement>('.TopScrollIndicator__section_item')];

const works = workScrollItems.map((el) => ({ el, image: el.dataset.top_works_item }));


workScrollItems.forEach((el) => {
  const thumb = el.querySelector<HTMLElement>('.Works__scroll_item_thumb');
  if (thumb) thumb.style.backgroundImage = `url("${el.dataset.top_works_item}")`;
});

type SectionGeo = { name: string; top: number; height: number };
let geo: SectionGeo[] = [];
function measure() {
  const top = scrollTop();
  geo = sectionEls.map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      name: el.dataset.top_section,
      top: rect.top + top,
      height: rect.height,
    };
  });
}
const section = (n) => geo.find((s) => s.name === n);
const progressOf = (n) => {
  const s = section(n);
  if (!s || !s.height) return 0;
  return clamp((scrollTop() - s.top) / s.height);
};



const titleSplits = new Map();
worksItems.forEach((el) => {
  const t = el.querySelector('[data-works_title]');
  if (t) titleSplits.set(el, splitChars(t).chars);
});

let currentWorksIndex = -1;
function updateWorks(u) {
  const n = works.length;
  if (!n) return;
  const idx = clamp(Math.round(u) - 1, 0, n - 1);
  if (idx === currentWorksIndex) return;
  const prev = currentWorksIndex;
  currentWorksIndex = idx;

  worksItems.forEach((el, i) => {
    const d = i - idx;
    const active = i === idx;
    el.style.opacity = active ? '1' : '0';
    el.style.transform = `translateY(${-d * 40}px)`;

    el.style.pointerEvents = active ? 'auto' : 'none';
  });


  if (prev >= 0 && prev !== idx) {
    const oldChars = titleSplits.get(worksItems[prev]);
    if (oldChars && oldChars.length) {
      to(oldChars, { y: -10, opacity: 0 }, { duration: 0.4, ease: 'power2.in', stagger: 0.001 });
    }
  }

  const curChars = titleSplits.get(worksItems[idx]);
  if (curChars && curChars.length) {
    set(curChars, { y: 10, opacity: 0 });
    to(curChars, { y: 0, opacity: 1 }, { duration: 0.7, ease: 'power4', stagger: 0.01 });
  }

  workScrollItems.forEach((el, i) => {
    const thumb = el.querySelector<HTMLElement>('.Works__scroll_item_thumb');
    if (thumb) thumb.dataset.active = i === idx ? 'true' : 'false';
  });
}


let gl = null;
const glCanvas = document.getElementById('gl-canvas');

let last = performance.now();
let currentSection = '';
let smoothU = 0;

let prevY = 0;
let idleT = 0;
let snapping = 0;

let missionMaskProg = 0;

let aetlaState = null;

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  lenis && lenis.raf(now);

  const y = scrollTop();
  const vh = window.innerHeight;


  const line = y + vh * 0.5;
  let name = geo.length ? geo[0].name : 'kv';
  for (const s of geo) if (line >= s.top) name = s.name;

  if (name !== currentSection) {
    currentSection = name;
    body.dataset.current_section = name;

    indicatorItems.forEach((el) => {
      const key = el.dataset.section;
      const on = key === 'works'
        ? name === 'works' || name === 'works_outro' || name === 'mission_in'
        : key === name;
      el.dataset.active = on ? 'true' : 'false';
    });
  }


  const trackEl = document.querySelector<HTMLElement>('.Works__scroll');
  const slotEls = trackEl ? [...trackEl.querySelectorAll<HTMLElement>('.Works__scroll_item')] : [];
  let slotTop = 0;
  let slotH = vh;
  let k = 0;
  let pWorks = 0;
  if (slotEls.length) {
    slotTop = trackEl.getBoundingClientRect().top + y;
    slotH = slotEls[0].getBoundingClientRect().height || vh;
    k = clamp((y - slotTop) / Math.max(1, slotH), 0, slotEls.length - 1);
    const span = slotEls.length * slotH + vh;
    pWorks = clamp((y - slotTop + vh) / Math.max(1, span));
  }

  const targetU = k + 1;
  smoothU = lerp(smoothU, targetU, Math.min(1, dt * 8));


  if (slotEls.length > 1 && pWorks > 0.002 && pWorks < 0.998) {
    const vy = Math.abs(y - prevY);
    idleT = vy < 0.7 ? idleT + dt : 0;
    if (snapping > 0) snapping -= dt;
    if (idleT > 0.3 && snapping <= 0) {
      const targetY = slotTop + Math.round(k) * slotH;
      if (Math.abs(targetY - y) > 2) {
        snapping = 1.2;
        if (lenis) lenis.scrollTo(targetY, { duration: 1, easing: (t) => 1 - Math.pow(1 - t, 3) });
        else window.scrollTo({ top: targetY, behavior: 'smooth' });
      }
    }
  } else {
    idleT = 0;
  }
  prevY = y;


  updateWorks(smoothU);


  const outroEl = section('works_outro');
  const worksOutroProgress = outroEl ? clamp((y - outroEl.top + vh) / Math.max(1, outroEl.height)) : 0;
  body.dataset.works_outro_above_viewport = outroEl && y + vh < outroEl.top ? 'true' : 'false';


  const misIn = section('mission_in');
  const mis = section('mission');
  let missionReveal = 0;
  if (misIn) {
    missionReveal = clamp((y - misIn.top + vh) / Math.max(1, misIn.height));
  } else if (mis) {
    missionReveal = clamp((y - mis.top + vh) / Math.max(1, mis.height));
  }

  missionMaskProg += (missionReveal - missionMaskProg) * Math.min(1, dt * 1);
  if (missionContainer) {
    missionContainer.style.setProperty('--mask-height', (missionMaskProg * 100 - 1.5).toFixed(2) + '%');
    missionContainer.style.setProperty('--mask-fade', '3%');
  }
  if (missionTitle) missionTitle.style.opacity = clamp((missionReveal - 0.15) / 0.35).toFixed(3);
  markers.forEach((m, i) => {
    const p = clamp((missionReveal - 0.3 - i * 0.1) / 0.35);
    m.style.backgroundSize = (p * 100).toFixed(2) + '% 100%';
  });


  if (gl) {
    const pIntro = progressOf('works_intro');
    const glState = {

      section: name,
      aspect: window.innerWidth / vh,
      scrollY: y,

      worksU: smoothU,
      worksProgress: clamp(pWorks),
      worksPage: clamp(pWorks),
      missionProgress: missionReveal,
      worksOutroProgress,
      titleProgress: pIntro,
    };
    aetlaState = glState;
    gl.update(dt, glState);
  }

  requestAnimationFrame(frame);
}


function onResize() {
  measure();
  if (gl) gl.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);


const sideMenu = document.querySelector<HTMLElement>('[data-side-menu]');
const hamburger = document.querySelector<HTMLElement>('[data-hamburger]');
const backdropEl = document.querySelector<HTMLElement>('[data-backdrop]');

function setMenu(open: boolean) {
  if (!sideMenu) return;
  sideMenu.dataset.open = open ? 'true' : 'false';
  hamburger && (hamburger.dataset.open = open ? 'true' : 'false');
  hamburger && hamburger.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
  body.dataset.modal = open ? 'true' : 'false';
  if (lenis) open ? lenis.stop() : lenis.start();
}
hamburger && hamburger.addEventListener('click', () => setMenu(sideMenu.dataset.open !== 'true'));
backdropEl && backdropEl.addEventListener('click', () => setMenu(false));
document.addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false));


const soundBtn = document.querySelector<HTMLElement>('[data-sound-toggle]');
const bgm = new Audio(A('audio/bgm.mp3'));
bgm.loop = true;
bgm.volume = 0.35;

let muted = true;
function setMuted(v: boolean) {
  muted = v;
  if (soundBtn) soundBtn.dataset.muted = v ? 'true' : 'false';
  if (v) bgm.pause();
  else bgm.play().catch(() => {});
}
soundBtn &&
  soundBtn.addEventListener('click', () => {
    setMuted(!muted);
    try {
      localStorage.setItem('aetla:sound', muted ? 'off' : 'on');
    } catch (e) {}
  });


const SECTION_ANCHOR = { kv: 'kv', works: 'works', mission: 'mission_in' };
indicatorItems.forEach((el) => {
  el.querySelector('.TopScrollIndicator__section_main')?.addEventListener('click', () => {
    const target = SECTION_ANCHOR[el.dataset.section];
    const s = section(target);
    if (s) scrollTo(s.top);
  });
});


const ROUTE_SECTION = {
  top: 'kv',
  kv: 'kv',
  project: 'works',
  works: 'works',
  about: 'mission_in',
};

function routeY() {
  const name = decodeURIComponent(location.hash.replace(/^#/, '')).trim().toLowerCase();
  if (!name) return null;

  if (name.includes('/')) return null;
  const s = section(ROUTE_SECTION[name.split('?')[0]]);
  return s ? s.top : null;
}

function gotoRoute({ immediate = false }: { immediate?: boolean } = {}) {
  const y = routeY();
  if (y === null) return false;
  if (lenis) lenis.scrollTo(y, immediate ? { immediate: true, force: true } : { duration: 1.2, force: true });
  else window.scrollTo({ top: y, behavior: immediate ? 'auto' : 'smooth' });
  return true;
}


document.addEventListener('click', (e) => {
  const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
  if (!a) return;
  if (sideMenu && sideMenu.dataset.open === 'true') setMenu(false);
  const href = a.getAttribute('href');
  const hash = href === '#' ? '#top' : href;
  e.preventDefault();
  if (location.hash !== hash) history.pushState(null, '', hash);
  gotoRoute();
});

window.addEventListener('hashchange', () => gotoRoute());


const loadingOverlay = document.getElementById('loading-overlay');

function playLottie(id: string, path: string, loop = false) {
  const el = document.getElementById(id);
  if (!el) return null;
  const anim = lottie.loadAnimation({
    container: el,
    renderer: 'svg',
    loop,
    autoplay: true,
    path: A(`lottie/${path}`),

    rendererSettings: { preserveAspectRatio: 'xMidYMid slice' },
  });

  anim.addEventListener('DOMLoaded', () => {
    el.style.opacity = '1';
  });
  return anim;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(() => r(), ms));


let glReadyResolve: () => void = () => {};
const glReady = new Promise<void>((r) => { glReadyResolve = r; });

let loadingFinished = false;
let introStarted = false;
function startIntro() {
  if (introStarted) return;
  introStarted = true;
  try {
    gl?.startIntro?.();
  } catch (e) {}
}

async function startLoading() {
  const bgAnim = playLottie('loading-lottie', 'loading-bg.json', false);
  const logoTimeline = setTimeout(() => {
    playLottie('loading-logo', 'loading-logo.json', false);
  }, 400);

  const minDuration = 2600;
  const t0 = performance.now();


  const animDone = bgAnim
    ? new Promise<void>((r) => bgAnim.addEventListener('complete', () => r()))
    : wait(minDuration);
  await Promise.race([animDone, wait(6000)]);
  clearTimeout(logoTimeline);


  await Promise.race([glReady, wait(8000)]);


  await wait(Math.max(0, minDuration - (performance.now() - t0)));


  if (loadingFinished) return;
  loadingFinished = true;


  if (loadingOverlay) {
    loadingOverlay.dataset.hidden = 'true';
    setTimeout(() => loadingOverlay.remove(), 700);
  }
  startIntro();


  setTimeout(() => {
    body.dataset.gl_loading_end = 'true';
    body.dataset.phase = 'ready';

    measure();
    gotoRoute({ immediate: true });
  }, 800);
}


measure();
window.addEventListener('load', measure);


import('./gl')
  .then(({ initGL }) => initGL({ container: glCanvas, works }))
  .then((instance) => {
    gl = instance;
    if (gl) {
      gl.resize(window.innerWidth, window.innerHeight);
      window.addEventListener('pointermove', (e) => {
        gl.setPointer((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      });
    } else {
      document.documentElement.dataset.glFallback = 'true';
    }
    measure();
    if (loadingFinished) startIntro();
    glReadyResolve();
  })
  .catch((e) => {
    console.warn('[aetla] GL 初始化失败，降级为 DOM 背景', e);
    document.documentElement.dataset.glFallback = 'true';
    glReadyResolve();
  })
  .finally(() => {

    glReadyResolve();
  });

startLoading();
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});
