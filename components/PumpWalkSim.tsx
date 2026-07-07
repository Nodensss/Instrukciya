"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ОБХОД УСТАНОВКИ (3D) — два режима:
//
// 1. «ТРЕВОГИ СМЕНЫ» — реальные отклонения из Табл. №12 инструкции 408-Р-6
//    (content/deviations.json, только status="ok"): дословный симптом, маяк
//    над оборудованием, на месте — выбор причины и действий персонала.
//    Тексты не редактируются, у каждой вводной — страница-источник.
//
// 2. «ПУСК НАСОСА Н-101» — ДЕМО-механика: последовательность операций и
//    маркировка Н-101/ЗД-101/ЗД-102/МП-101 ВЫДУМАНЫ и помечены в UI.
//    Реальный сценарий подставится из TZ_simulator_pusk_nasosa_408-R-6.md.
//
// Геометрия оборудования — символическая (низкополигональная), но позиции
// аппаратов подписаны реальными обозначениями из инструкции: реактор,
// ОВД А-401, ОНД А-402, холодильники А-503, сборник А-507, дозировочные
// насосы А-316/322/325, ёмкость А-315, бустерный компрессор, клапан
// «Böhler», ЦПУ, датчик ДВК, ёмкости горячей воды.

export interface SimDeviation {
  id: number;
  page: number;
  group: string;
  symptom: string;
  cause: string;
  action: string;
}

const C = {
  bg: "#0c1216",
  panel: "#141d24",
  inset: "#0f171d",
  line: "#24343f",
  text: "#dce6ee",
  dim: "#7f95a4",
  green: "#46d17e",
  amber: "#f2b63c",
  red: "#f0685e",
  blue: "#54b6e8",
};

const MONO =
  "ui-monospace,'SF Mono','Cascadia Mono',Consolas,monospace" as const;

const GROUP_NAMES: Record<string, string> = {
  kip: "КИПиА",
  pumps_general: "Насосное",
  propan: "Пропан/пропилен",
  reactor: "Реактор",
  gas: "Очистка газа",
  nmpe: "НМПЭ",
  bohler: "Клапан «Böhler»",
  dosing: "Дозировка",
  oil: "Маслосистема",
  hot_water: "Горячая вода",
  safety: "Безопасность",
};

// Привязка групп отклонений Табл. №12 к местам на площадке
const ANCHORS: Record<string, { x: number; z: number; r: number; label: string }> = {
  kip: { x: -3, z: 7, r: 2.4, label: "ЦПУ · МНЕМОСХЕМА" },
  pumps_general: { x: 12.5, z: 5, r: 3.0, label: "НАСОСНАЯ ГРУППА" },
  propan: { x: 7, z: -12.2, r: 3.2, label: "ИСПАРИТЕЛЬ ПРОПАНА" },
  reactor: { x: -6.5, z: -12.5, r: 3.4, label: "РЕАКТОР" },
  gas: { x: 0.1, z: -11.3, r: 3.4, label: "УЗЕЛ ОЧИСТКИ ГАЗА (А-401/402)" },
  nmpe: { x: -12.5, z: 8.5, r: 2.8, label: "А-507 · СБОРНИК НМПЭ" },
  bohler: { x: -5, z: -9.8, r: 2.4, label: "КЛАПАН «BÖHLER»" },
  dosing: { x: 13, z: 11, r: 3.0, label: "УЗЕЛ ДОЗИРОВКИ (А-315/316)" },
  oil: { x: 8.5, z: 0.5, r: 2.4, label: "МАСЛОСТАНЦИЯ" },
  hot_water: { x: -9.2, z: 12.3, r: 3.4, label: "ЕМКОСТИ ГОРЯЧЕЙ ВОДЫ" },
  safety: { x: 5.5, z: -6, r: 2.4, label: "ДАТЧИК ДВК" },
};

const ALARM_COUNT = 6;

type TargetId = "pump" | "oil" | "v1" | "v2" | "panel" | "gauge";

interface Step {
  target: TargetId;
  title: string;
  ok: string;
}

// ДЕМО-последовательность пуска (выдумана, помечена в UI)
const STEPS: Step[] = [
  { target: "pump", title: "Осмотреть насос Н-101", ok: "Корпус, муфта, сальник — замечаний нет." },
  { target: "oil", title: "Проверить масло в картере", ok: "Уровень масла по маслоуказателю — норма." },
  { target: "v1", title: "Открыть задвижку на всасе ЗД-101", ok: "ЗД-101 открыта. Насос залит продуктом." },
  { target: "v2", title: "Убедиться: нагнетание ЗД-102 закрыто", ok: "ЗД-102 закрыта — пуск на закрытую задвижку." },
  { target: "panel", title: "Пустить насос с пульта МП-101", ok: "Н-101 в работе. Обороты номинальные." },
  { target: "gauge", title: "Проверить давление по PI-101", ok: "Давление на нагнетании растёт — норма." },
  { target: "v2", title: "Плавно открыть нагнетание ЗД-102", ok: "ЗД-102 открыта. Подача в коллектор." },
  { target: "panel", title: "Доложить о пуске", ok: "Доклад принят. Пуск завершён." },
];

const TARGET_LABELS: Record<TargetId, string> = {
  pump: "НАСОС Н-101",
  oil: "МАСЛОБАК Н-101",
  v1: "ЗАДВИЖКА ЗД-101 · ВСАС",
  v2: "ЗАДВИЖКА ЗД-102 · НАГНЕТАНИЕ",
  panel: "ПУЛЬТ МП-101",
  gauge: "МАНОМЕТР PI-101",
};

interface Msg {
  text: string;
  kind: "ok" | "warn" | "err";
}

interface Quiz {
  card: SimDeviation;
  phase: "c" | "a";
  opts: { c: string[]; a: string[] };
  picked: string | null;
  causeOk: boolean;
}

interface AlarmResult {
  id: number;
  page: number;
  symptom: string;
  causeOk: boolean;
  actionOk: boolean;
}

type Mode = "menu" | "pump" | "alarms";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Дистракторы как в карточной игре: сначала причины/действия той же группы
function buildQuizOptions(all: SimDeviation[], card: SimDeviation, field: "cause" | "action") {
  const correct = card[field];
  const same = all
    .filter((d) => d.id !== card.id && d.group === card.group && d[field] !== correct)
    .map((d) => d[field]);
  const rest = all
    .filter((d) => d.id !== card.id && d.group !== card.group && d[field] !== correct)
    .map((d) => d[field]);
  const pool = [...new Set([...shuffle(same), ...shuffle(rest)])];
  return shuffle([correct, ...pool.slice(0, 3)]);
}

function makeLabelSprite(text: string): THREE.Sprite {
  const pad = 18;
  const fs = 40;
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d")!;
  ctx.font = `${fs}px ${MONO}`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = fs + pad * 2;
  cv.width = w;
  cv.height = h;
  const c2 = cv.getContext("2d")!;
  c2.fillStyle = "rgba(15,23,29,0.88)";
  c2.fillRect(0, 0, w, h);
  c2.strokeStyle = C.line;
  c2.lineWidth = 3;
  c2.strokeRect(1.5, 1.5, w - 3, h - 3);
  c2.font = `${fs}px ${MONO}`;
  c2.fillStyle = C.blue;
  c2.textBaseline = "middle";
  c2.fillText(text, pad, h / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true })
  );
  const scale = 0.006;
  sp.scale.set(w * scale, h * scale, 1);
  return sp;
}

const LETTERS = ["А", "Б", "В", "Г"];

export default function PumpWalkSim({ deviations }: { deviations: SimDeviation[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<Mode>("menu");
  const [paused, setPaused] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [targetLabel, setTargetLabel] = useState<string | null>(null);

  // пуск насоса (демо)
  const [stepIdx, setStepIdx] = useState(0);
  const [errors, setErrors] = useState(0);
  const [pumpFinished, setPumpFinished] = useState(false);

  // тревоги по Табл. №12
  const [alarmDeck, setAlarmDeck] = useState<SimDeviation[]>([]);
  const [alarmIdx, setAlarmIdx] = useState(0);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [alarmResults, setAlarmResults] = useState<AlarmResult[]>([]);
  const [alarmsDone, setAlarmsDone] = useState(false);
  const [navDist, setNavDist] = useState(0);

  // мост React → цикл three
  const modeRef = useRef<Mode>("menu");
  const pausedRef = useRef(false);
  const stepRef = useRef(0);
  const errRef = useRef(0);
  const finishedRef = useRef(false);
  const quizOpenRef = useRef(false);
  const anchorRef = useRef<{ x: number; z: number; r: number; label: string } | null>(null);
  const openQuizRef = useRef<() => void>(() => {});
  const beaconRef = useRef<{ show: (x: number, z: number) => void; hide: () => void }>({
    show: () => {},
    hide: () => {},
  });
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsTouch("ontouchstart" in window);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ---------- сцена ----------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(C.bg);
    scene.fog = new THREE.Fog(C.bg, 18, 46);

    const camera = new THREE.PerspectiveCamera(
      72,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    );
    camera.rotation.order = "YXZ";
    camera.position.set(0, 1.7, 9);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0x8fb4cc, 0x18232c, 1.05));
    const dir = new THREE.DirectionalLight(0xcfe6f5, 1.7);
    dir.position.set(8, 14, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -18;
    dir.shadow.camera.right = 18;
    dir.shadow.camera.top = 18;
    dir.shadow.camera.bottom = -18;
    scene.add(dir);
    const amberLamp = new THREE.PointLight(0xf2b63c, 12, 14);
    amberLamp.position.set(0, 4.2, 4);
    scene.add(amberLamp);

    // материалы
    const mSteel = new THREE.MeshStandardMaterial({ color: 0x5a6b78, roughness: 0.5, metalness: 0.7 });
    const mDark = new THREE.MeshStandardMaterial({ color: 0x232f38, roughness: 0.85 });
    const mPipe = new THREE.MeshStandardMaterial({ color: 0x74858f, roughness: 0.4, metalness: 0.8 });
    const mRed = new THREE.MeshStandardMaterial({ color: 0x8a3a34, roughness: 0.55 });
    const mBlue = new THREE.MeshStandardMaterial({ color: 0x2c5670, roughness: 0.55 });
    const mAmber = new THREE.MeshStandardMaterial({ color: 0xc9942f, roughness: 0.6 });
    const mYellow = new THREE.MeshStandardMaterial({ color: 0xb7a23a, roughness: 0.7 });

    // пол
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x18222a, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(60, 60, 0x24343f, 0x1b2831);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    grid.position.y = 0.01;
    scene.add(grid);

    // разметка зоны насоса
    const zone = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 3.6, 48),
      new THREE.MeshBasicMaterial({ color: 0xf2b63c, transparent: true, opacity: 0.25 })
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.02;
    scene.add(zone);

    const addBox = (
      w: number, h: number, d: number,
      mat: THREE.Material,
      x: number, y: number, z: number,
      parent: THREE.Object3D = scene
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const addCyl = (
      r1: number, r2: number, h: number, seg: number,
      mat: THREE.Material,
      x: number, y: number, z: number,
      rotZ = 0,
      parent: THREE.Object3D = scene
    ) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
      m.position.set(x, y, z);
      m.rotation.z = rotZ;
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const addLabel = (text: string, x: number, y: number, z: number) => {
      const lb = makeLabelSprite(text);
      lb.position.set(x, y, z);
      scene.add(lb);
      return lb;
    };

    // ---------- ёмкость Е-101 (демо-контур пуска) ----------
    const tank = new THREE.Group();
    addCyl(2, 2, 4.4, 32, mSteel, 0, 2.2, 0, 0, tank);
    addCyl(2.02, 2.02, 0.25, 32, mAmber, 0, 0.5, 0, 0, tank);
    addCyl(2.02, 2.02, 0.25, 32, mAmber, 0, 3.9, 0, 0, tank);
    tank.position.set(-9, 0, -2);
    scene.add(tank);
    addLabel("Е-101 · ЁМКОСТЬ", -9, 5.1, -2);

    // ---------- насосный агрегат Н-101 (демо) ----------
    const skid = new THREE.Group();
    addBox(3.6, 0.3, 1.8, mDark, 0, 0.15, 0, skid);
    const pumpBody = new THREE.Group();
    addCyl(0.5, 0.5, 0.7, 24, mRed, -0.9, 0.75, 0, Math.PI / 2, pumpBody);
    addCyl(0.16, 0.16, 0.5, 16, mSteel, -0.35, 0.75, 0, Math.PI / 2, pumpBody);
    addCyl(0.42, 0.42, 1.3, 24, mBlue, 0.6, 0.75, 0, Math.PI / 2, pumpBody);
    addBox(0.5, 0.12, 0.5, mBlue, 0.6, 1.45, 0, pumpBody);
    skid.add(pumpBody);
    scene.add(skid);
    addLabel("Н-101 · НАСОС", 0, 2.4, 0);
    const pumpLamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x000000 })
    );
    pumpLamp.position.set(0.6, 1.6, 0);
    scene.add(pumpLamp);

    // ---------- маслобак насоса ----------
    const oilGroup = new THREE.Group();
    addCyl(0.28, 0.28, 0.65, 20, mYellow, 0, 0.62, 0, 0, oilGroup);
    addBox(0.08, 0.3, 0.03, new THREE.MeshStandardMaterial({ color: 0xdce6ee, roughness: 0.2 }), 0, 0.62, 0.27, oilGroup);
    addCyl(0.05, 0.05, 0.6, 10, mPipe, 0.35, 0.3, 0, Math.PI / 2.6, oilGroup);
    oilGroup.position.set(1.15, 0, 1.35);
    scene.add(oilGroup);

    // ---------- трубопроводы демо-контура ----------
    addCyl(0.16, 0.16, 5.4, 16, mPipe, -4.3, 0.75, 0, Math.PI / 2);
    addCyl(0.16, 0.16, 2.6, 16, mPipe, -2.3, 0.75, 0, Math.PI / 2);
    addCyl(0.13, 0.13, 3.4, 16, mPipe, 1.3, 0.9, 0, Math.PI / 2);
    addCyl(0.13, 0.13, 8, 16, mPipe, 7, 0.9, 0, Math.PI / 2);
    addCyl(0.13, 0.13, 2.2, 16, mPipe, 11, 1.9, 0);

    // эстакада (вдоль z = -8)
    for (let i = 0; i < 3; i++) {
      addCyl(0.14, 0.14, 30, 12, mPipe, 0, 3.1 + i * 0.42, -8.2, Math.PI / 2);
    }
    for (const px of [-12, -4, 4, 12]) {
      addBox(0.22, 3.4, 0.22, mDark, px, 1.7, -8.2);
      addBox(0.18, 0.18, 1.4, mDark, px, 3.35, -8.2);
    }
    addBox(30, 0.12, 0.45, mDark, 0, 2.55, -8.6);
    for (let i = 0; i < 30; i++) addBox(0.05, 0.1, 0.5, mSteel, -14.5 + i, 2.62, -8.6);

    // ================= ОБОРУДОВАНИЕ УСТАНОВКИ (позиции из Табл. №12) =================

    // площадка-платформа с ограждением и лесенкой
    function makePlatform(x: number, z: number, w: number, d: number, h: number) {
      addBox(w, 0.12, d, mDark, x, h, z);
      const railMat = mAmber;
      const rail = (x1: number, z1: number, x2: number, z2: number) => {
        const len = Math.hypot(x2 - x1, z2 - z1);
        const mid = addBox(len, 0.05, 0.05, railMat, (x1 + x2) / 2, h + 1.0, (z1 + z2) / 2);
        mid.rotation.y = Math.atan2(z2 - z1, x2 - x1);
        const low = addBox(len, 0.05, 0.05, railMat, (x1 + x2) / 2, h + 0.5, (z1 + z2) / 2);
        low.rotation.y = mid.rotation.y;
      };
      const hw = w / 2, hd = d / 2;
      rail(x - hw, z - hd, x + hw, z - hd);
      rail(x - hw, z + hd, x + hw, z + hd);
      rail(x - hw, z - hd, x - hw, z + hd);
      for (const [cx, cz] of [[x - hw, z - hd], [x + hw, z - hd], [x - hw, z + hd], [x + hw, z + hd]] as const)
        addBox(0.06, 1.05, 0.06, railMat, cx, h + 0.52, cz);
      const st = new THREE.Group();
      const steps = Math.max(2, Math.round(h / 0.28));
      for (let i = 0; i < steps; i++) addBox(0.7, 0.04, 0.22, mSteel, 0, 0.28 * i + 0.14, i * 0.3, st);
      st.position.set(x, 0, z + hd + 0.2);
      scene.add(st);
    }

    // вертикальный аппарат с юбкой и площадкой
    function makeColumn(x: number, z: number, r: number, hgt: number, tag: string) {
      const g = new THREE.Group();
      addCyl(r, r, hgt, 28, mSteel, 0, hgt / 2 + 0.6, 0, 0, g);
      addCyl(r * 0.6, r, 0.6, 28, mDark, 0, 0.3, 0, 0, g);
      addCyl(r, r, 0.18, 28, mAmber, 0, 1.0, 0, 0, g);
      addCyl(r, r, 0.18, 28, mAmber, 0, hgt + 0.1, 0, 0, g);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.4, 0.05, 8, 28), mAmber);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = hgt * 0.66;
      g.add(ring);
      addCyl(0.12, 0.12, 0.6, 10, mPipe, r + 0.2, hgt * 0.8, 0, Math.PI / 2, g);
      addCyl(0.12, 0.12, 0.6, 10, mPipe, -(r + 0.2), hgt * 0.25, 0, Math.PI / 2, g);
      g.position.set(x, 0, z);
      scene.add(g);
      addLabel(tag, x, hgt + 1.5, z);
    }
    // Реакторный блок и отделители (реальные позиции инструкции)
    makeColumn(-6.5, -12.5, 1.3, 7.5, "РЕАКТОР");
    makeColumn(-2.2, -12.8, 1.0, 6.2, "А-401 · ОВД");
    makeColumn(2.4, -12.6, 1.15, 6.8, "А-402 · ОНД");
    makePlatform(-4.3, -10.5, 3.2, 1.6, 1.3);
    makePlatform(9.5, 5.5, 2.2, 2.2, 0.9);

    // холодильники А-503 (реальная позиция)
    const coolers = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      addCyl(0.55, 0.55, 3.2, 20, mSteel, 0, 0.9 + i * 1.25, 0, Math.PI / 2, coolers);
      addCyl(0.6, 0.6, 0.2, 20, mAmber, -1.5, 0.9 + i * 1.25, 0, Math.PI / 2, coolers);
      addCyl(0.6, 0.6, 0.2, 20, mAmber, 1.5, 0.9 + i * 1.25, 0, Math.PI / 2, coolers);
    }
    addBox(0.25, 4.6, 1.3, mDark, -1.7, 2.3, 0, coolers);
    addBox(0.25, 4.6, 1.3, mDark, 1.7, 2.3, 0, coolers);
    coolers.position.set(-12.5, 0, 3.5);
    scene.add(coolers);
    addLabel("А-503 · ХОЛОДИЛЬНИКИ", -12.5, 5.0, 3.5);

    // бустерный компрессор (реальная позиция)
    const comp = new THREE.Group();
    addBox(4.4, 0.35, 2.2, mDark, 0, 0.18, 0, comp);
    addCyl(0.75, 0.75, 2.6, 24, mBlue, -0.7, 1.15, 0, Math.PI / 2, comp);
    addCyl(0.55, 0.55, 1.4, 24, mSteel, 1.3, 1.15, 0, Math.PI / 2, comp);
    addBox(0.9, 0.9, 0.9, mDark, 1.5, 0.75, 0, comp);
    addCyl(0.14, 0.14, 1.6, 12, mPipe, -0.7, 2.2, 0, 0, comp);
    addCyl(0.14, 0.14, 2.4, 12, mPipe, -0.7, 0.55, 1.3, Math.PI / 2, comp);
    comp.position.set(11.5, 0, -3);
    comp.rotation.y = -Math.PI / 2;
    scene.add(comp);
    addLabel("БУСТЕРНЫЙ КОМПРЕССОР", 11.5, 3.4, -3);

    // дозировочные насосы А-316/322/325 (реальные позиции)
    function makeAuxPump(x: number, z: number, tag: string) {
      const g = new THREE.Group();
      addBox(1.6, 0.22, 0.9, mDark, 0, 0.11, 0, g);
      addCyl(0.32, 0.32, 0.5, 20, mRed, -0.4, 0.5, 0, Math.PI / 2, g);
      addCyl(0.28, 0.28, 0.85, 20, mBlue, 0.35, 0.5, 0, Math.PI / 2, g);
      addCyl(0.1, 0.1, 0.7, 10, mPipe, -0.4, 0.9, 0, 0, g);
      g.position.set(x, 0, z);
      scene.add(g);
      addLabel(tag, x, 1.5, z);
    }
    makeAuxPump(12.5, 5, "А-316 · ДОЗИР.");
    makeAuxPump(12.5, 8, "А-322 · ДОЗИР.");
    makeAuxPump(12.5, 11, "А-325 · ДОЗИР.");

    // ёмкость раствора инициатора А-315 (реальная позиция)
    addCyl(0.9, 0.9, 2.6, 24, mSteel, 13.8, 1.3, 13);
    addCyl(0.92, 0.92, 0.18, 24, mAmber, 13.8, 2.1, 13);
    addLabel("А-315 · ЕМК. Р-РА", 13.8, 3.4, 13);

    // ёмкости горячей воды (реальная позиция)
    for (const [tx, tr, th, tag] of [
      [-11, 1.6, 5.5, "ЕМК. ГОР. ВОДЫ №1"],
      [-7.5, 1.3, 4.5, "ЕМК. ГОР. ВОДЫ №2"],
    ] as const) {
      addCyl(tr, tr, th, 28, mSteel, tx, th / 2, 13.5);
      addCyl(tr + 0.02, tr + 0.02, 0.22, 28, mAmber, tx, th - 0.5, 13.5);
      addLabel(tag, tx, th + 1.1, 13.5);
    }

    // сборник НМПЭ А-507 (реальная позиция)
    addCyl(1.0, 1.0, 2.2, 24, mSteel, -12.5, 1.1, 8.5);
    addCyl(1.02, 1.02, 0.2, 24, mAmber, -12.5, 1.9, 8.5);
    addCyl(0.1, 0.1, 1.2, 10, mPipe, -12.5, 2.7, 8.5);
    addLabel("А-507 · СБОРНИК НМПЭ", -12.5, 3.7, 8.5);

    // испаритель пропана (реальная позиция) — горизонтальный аппарат на сёдлах
    const evap = new THREE.Group();
    addCyl(1.0, 1.0, 3.8, 24, mSteel, 0, 1.55, 0, Math.PI / 2, evap);
    addCyl(1.05, 1.05, 0.25, 24, mAmber, -1.4, 1.55, 0, Math.PI / 2, evap);
    addCyl(1.05, 1.05, 0.25, 24, mAmber, 1.4, 1.55, 0, Math.PI / 2, evap);
    addBox(0.5, 1.0, 1.6, mDark, -1.2, 0.5, 0, evap);
    addBox(0.5, 1.0, 1.6, mDark, 1.2, 0.5, 0, evap);
    addCyl(0.12, 0.12, 1.4, 10, mPipe, 0, 2.8, 0, 0, evap);
    evap.position.set(7, 0, -12.2);
    scene.add(evap);
    addLabel("ИСПАРИТЕЛЬ ПРОПАНА", 7, 4.0, -12.2);

    // клапан «Böhler» (реальная позиция) — регулирующий клапан на стойке
    const bohler = new THREE.Group();
    addBox(0.7, 0.9, 0.7, mDark, 0, 0.45, 0, bohler);
    addCyl(0.3, 0.3, 0.55, 16, mSteel, 0, 1.1, 0, Math.PI / 2, bohler);
    addCyl(0.22, 0.28, 0.5, 16, mBlue, 0, 1.62, 0, 0, bohler); // сервопривод
    addCyl(0.06, 0.06, 0.5, 10, mSteel, 0, 2.05, 0, 0, bohler);
    addCyl(0.14, 0.14, 1.6, 12, mPipe, -0.9, 1.1, 0, Math.PI / 2, bohler);
    addCyl(0.14, 0.14, 1.6, 12, mPipe, 0.9, 1.1, 0, Math.PI / 2, bohler);
    bohler.position.set(-5, 0, -9.8);
    scene.add(bohler);
    addLabel("КЛАПАН «BÖHLER»", -5, 3.0, -9.8);

    // ЦПУ — операторный пульт с мнемосхемой (реальная позиция)
    const cpu = new THREE.Group();
    addBox(2.2, 1.3, 0.5, mDark, 0, 0.65, 0, cpu);
    const mnemo = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.85, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x0f171d, emissive: 0x0a2a38, emissiveIntensity: 1.8 })
    );
    mnemo.position.set(0, 1.55, 0.18);
    mnemo.rotation.x = -0.3;
    cpu.add(mnemo);
    for (let i = 0; i < 6; i++) {
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 10, 10),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? 0x46d17e : 0xf2b63c,
          emissive: i % 2 ? 0x1a7a44 : 0x8a6a1a,
        })
      );
      led.position.set(-0.75 + i * 0.3, 1.05, 0.27);
      cpu.add(led);
    }
    cpu.position.set(-3, 0, 7);
    scene.add(cpu);
    addLabel("ЦПУ · МНЕМОСХЕМА", -3, 2.6, 7);

    // маслостанция (реальная позиция)
    const oilSt = new THREE.Group();
    addBox(1.8, 0.25, 1.2, mDark, 0, 0.12, 0, oilSt);
    addCyl(0.45, 0.45, 1.1, 20, mYellow, -0.4, 0.8, 0, 0, oilSt);
    addCyl(0.2, 0.2, 0.6, 16, mBlue, 0.55, 0.45, 0, Math.PI / 2, oilSt);
    addCyl(0.07, 0.07, 0.9, 10, mPipe, 0.1, 1.0, 0, Math.PI / 2.4, oilSt);
    oilSt.position.set(8.5, 0, 0.5);
    scene.add(oilSt);
    addLabel("МАСЛОСТАНЦИЯ", 8.5, 2.3, 0.5);

    // датчик ДВК на стойке (реальная позиция)
    addBox(0.12, 2.2, 0.12, mDark, 5.5, 1.1, -6);
    const dvk = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.3, 0.25),
      new THREE.MeshStandardMaterial({ color: 0xb7a23a, emissive: 0x4a3a08 })
    );
    dvk.position.set(5.5, 2.3, -6);
    scene.add(dvk);
    addLabel("ДАТЧИК ДВК", 5.5, 3.1, -6);

    // ограждение вокруг зоны насоса
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2;
      if (Math.sin(ang) > 0.55) continue;
      addBox(0.06, 0.9, 0.06, mAmber, Math.cos(ang) * 5.5, 0.45, Math.sin(ang) * 5.5 + 0.5);
    }

    // технологические трубопроводы (эстакада → аппараты)
    addCyl(0.12, 0.12, 4.5, 12, mPipe, -6.5, 3.0, -10.3, 0);
    addCyl(0.12, 0.12, 4.5, 12, mPipe, 2.4, 3.0, -10.3, 0);
    addCyl(0.1, 0.1, 6, 12, mPipe, -9, 2.7, -5, Math.PI / 2);
    addCyl(0.1, 0.1, 9, 12, mPipe, 7, 2.28, -4, 0);

    // прожекторные мачты
    for (const [mx, mz] of [[-13, -5], [13, 9]] as const) {
      addBox(0.15, 6, 0.15, mDark, mx, 3, mz);
      const lampHead = addBox(0.5, 0.25, 0.3, mSteel, mx, 6, mz);
      lampHead.rotation.y = mx > 0 ? 0.5 : -0.5;
      const spot = new THREE.PointLight(0xdfe9f2, 6, 22);
      spot.position.set(mx, 6, mz);
      scene.add(spot);
    }

    // ---------- маяк тревоги ----------
    const beacon = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xf0685e, transparent: true, opacity: 0.14, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 10, 20, 1, true), beamMat);
    beam.position.y = 5;
    beacon.add(beam);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf0685e, transparent: true, opacity: 0.6 });
    const bRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 32), ringMat);
    bRing.rotation.x = -Math.PI / 2;
    bRing.position.y = 0.03;
    beacon.add(bRing);
    const bLight = new THREE.PointLight(0xf0685e, 14, 12);
    bLight.position.y = 2.5;
    beacon.add(bLight);
    beacon.visible = false;
    scene.add(beacon);
    beaconRef.current = {
      show: (x, z) => {
        beacon.position.set(x, 0, z);
        beacon.visible = true;
      },
      hide: () => {
        beacon.visible = false;
      },
    };

    // ---------- задвижки демо-контура ----------
    function makeValve(tag: string, x: number, z: number, pipeY: number) {
      const g = new THREE.Group();
      addCyl(0.24, 0.24, 0.42, 16, mSteel, 0, 0, 0, Math.PI / 2, g);
      addCyl(0.055, 0.055, 0.55, 10, mSteel, 0, 0.3, 0, 0, g);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.045, 12, 28), mRed);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.y = 0.58;
      wheel.castShadow = true;
      g.add(wheel);
      const spokes = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.5, 8), mSteel);
        sp.rotation.z = Math.PI / 2;
        sp.rotation.y = (i * Math.PI) / 3;
        spokes.add(sp);
      }
      spokes.position.y = 0.58;
      g.add(spokes);
      const indicator = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.09, 0.09),
        new THREE.MeshStandardMaterial({ color: 0xf0685e, emissive: 0x501510 })
      );
      indicator.position.set(0, 0.32, 0.2);
      g.add(indicator);
      g.position.set(x, pipeY, z);
      scene.add(g);
      addLabel(tag, x, pipeY + 1.25, z);
      return { group: g, wheel, spokes, indicator };
    }
    const v1 = makeValve("ЗД-101 · ВСАС", -2.7, 0, 0.75);
    const v2 = makeValve("ЗД-102 · НАГНЕТ.", 3.4, 0, 0.9);

    // ---------- манометр PI-101 ----------
    const gaugeGroup = new THREE.Group();
    addCyl(0.045, 0.045, 0.55, 10, mPipe, 0, 0.28, 0, 0, gaugeGroup);
    const dial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.07, 24),
      new THREE.MeshStandardMaterial({ color: 0xdce6ee, roughness: 0.3 })
    );
    dial.rotation.x = Math.PI / 2;
    dial.position.y = 0.72;
    gaugeGroup.add(dial);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 10, 28), mSteel);
    rim.position.y = 0.72;
    gaugeGroup.add(rim);
    const needle = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.17, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xf0685e })
    );
    needle.geometry.translate(0, 0.085, 0);
    needle.position.set(0, 0.72, 0.045);
    needle.rotation.z = 2.2;
    gaugeGroup.add(needle);
    gaugeGroup.position.set(1.9, 0.9, 0);
    scene.add(gaugeGroup);
    addLabel("PI-101", 1.9, 2.35, 0);

    // ---------- пульт МП-101 (демо) ----------
    const panelGroup = new THREE.Group();
    addBox(1.1, 1.25, 0.45, mDark, 0, 0.62, 0, panelGroup);
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.5, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x0f171d, emissive: 0x0a2a38, emissiveIntensity: 1.6 })
    );
    screen.position.set(0, 1.35, 0.16);
    screen.rotation.x = -0.35;
    panelGroup.add(screen);
    const startBtn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.05, 20),
      new THREE.MeshStandardMaterial({ color: 0x46d17e, emissive: 0x0d3a20 })
    );
    startBtn.rotation.x = Math.PI / 2;
    startBtn.position.set(-0.25, 0.95, 0.24);
    panelGroup.add(startBtn);
    const stopBtn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.05, 20),
      new THREE.MeshStandardMaterial({ color: 0xf0685e, emissive: 0x3a1210 })
    );
    stopBtn.rotation.x = Math.PI / 2;
    stopBtn.position.set(0.25, 0.95, 0.24);
    panelGroup.add(stopBtn);
    panelGroup.position.set(3, 0, 4.6);
    panelGroup.rotation.y = Math.PI;
    scene.add(panelGroup);
    addLabel("МП-101 · ПУЛЬТ", 3, 2.3, 4.6);

    // ---------- интерактивные точки демо-пуска ----------
    const interactables: { id: TargetId; pos: THREE.Vector3; radius: number }[] = [
      { id: "pump", pos: new THREE.Vector3(0, 0.8, 0), radius: 2.4 },
      { id: "oil", pos: new THREE.Vector3(1.15, 0.7, 1.35), radius: 1.1 },
      { id: "v1", pos: new THREE.Vector3(-2.7, 0.9, 0), radius: 2.0 },
      { id: "v2", pos: new THREE.Vector3(3.4, 1.0, 0), radius: 2.0 },
      { id: "gauge", pos: new THREE.Vector3(1.9, 1.6, 0), radius: 1.7 },
      { id: "panel", pos: new THREE.Vector3(3, 1.1, 4.6), radius: 2.0 },
    ];

    // ---------- состояние демо-пуска ----------
    let v1Open = false;
    let v2Open = false;
    let pumpRunning = false;
    let pressureTarget = 2.2;
    const tweens: { obj: THREE.Object3D; axis: "x" | "y" | "z"; from: number; to: number; t: number; dur: number }[] = [];

    function spinWheel(v: ReturnType<typeof makeValve>, open: boolean) {
      tweens.push({ obj: v.spokes, axis: "y", from: v.spokes.rotation.y, to: v.spokes.rotation.y + (open ? -6 : 6), t: 0, dur: 1.4 });
      (v.indicator.material as THREE.MeshStandardMaterial).color.set(open ? 0x46d17e : 0xf0685e);
      (v.indicator.material as THREE.MeshStandardMaterial).emissive.set(open ? 0x0d3a20 : 0x501510);
    }
    function setPumpRunning(on: boolean) {
      pumpRunning = on;
      const lm = pumpLamp.material as THREE.MeshStandardMaterial;
      lm.color.set(on ? 0x46d17e : 0x333333);
      lm.emissive.set(on ? 0x1a7a44 : 0x000000);
      lm.emissiveIntensity = on ? 2 : 0;
    }

    function showMsg(text: string, kind: Msg["kind"]) {
      if (msgTimer.current) clearTimeout(msgTimer.current);
      setMsg({ text, kind });
      msgTimer.current = setTimeout(() => setMsg(null), 4200);
    }
    function addError() {
      errRef.current += 1;
      setErrors(errRef.current);
    }

    function interactPump() {
      if (stepRef.current >= STEPS.length) return;
      const id = currentTarget;
      if (!id) return;
      const step = STEPS[stepRef.current];
      if (id === step.target) {
        switch (stepRef.current) {
          case 2: v1Open = true; spinWheel(v1, true); break;
          case 4: setPumpRunning(true); pressureTarget = -1.5; break;
          case 6: v2Open = true; spinWheel(v2, true); pressureTarget = -0.6; break;
        }
        showMsg("✓ " + step.ok, "ok");
        stepRef.current += 1;
        setStepIdx(stepRef.current);
        if (stepRef.current >= STEPS.length) {
          finishedRef.current = true;
          setPumpFinished(true);
          if (document.pointerLockElement) document.exitPointerLock();
        }
        return;
      }
      const i = stepRef.current;
      if (id === "panel" && i < 4) {
        addError();
        showMsg("✕ ЗАЩИТА: ПУСК ЗАПРЕЩЁН — НЕ ЗАКОНЧЕНА ПОДГОТОВКА НАСОСА", "err");
        return;
      }
      if (id === "v2" && i < 3) {
        addError();
        showMsg("✕ НАГНЕТАНИЕ НЕ ТРОГАТЬ: СНАЧАЛА ОСМОТР, МАСЛО И ВСАС", "err");
        return;
      }
      if (id === "v1" && i < 2) {
        showMsg("СНАЧАЛА: " + STEPS[i].title.toUpperCase(), "warn");
        return;
      }
      if (id === "gauge" && !pumpRunning) {
        showMsg("НАСОС НЕ В РАБОТЕ — ДАВЛЕНИЯ НЕТ", "warn");
        return;
      }
      showMsg("СЕЙЧАС: " + STEPS[i].title.toUpperCase(), "warn");
    }

    function interact() {
      if (pausedRef.current || quizOpenRef.current || finishedRef.current) return;
      if (modeRef.current === "pump") {
        interactPump();
        return;
      }
      if (modeRef.current === "alarms") {
        const a = anchorRef.current;
        if (!a) return;
        const d = Math.hypot(a.x - player.x, a.z - player.z);
        if (d <= a.r) openQuizRef.current();
      }
    }

    // ---------- управление ----------
    const keys = new Set<string>();
    let yaw = 0, pitch = 0;
    let currentTarget: TargetId | null = null;
    const player = new THREE.Vector3(0, 1.7, 9);

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === "KeyE" || e.code === "Enter") interact();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw -= e.movementX * 0.0022;
      pitch -= e.movementY * 0.0022;
      pitch = Math.max(-1.35, Math.min(1.35, pitch));
    };
    const onClick = () => {
      if (document.pointerLockElement === renderer.domElement) interact();
    };
    const onLockChange = () => {
      if ("ontouchstart" in window) return;
      if (document.pointerLockElement === renderer.domElement) return;
      // потеря захвата: пауза только в активной ходьбе (не в меню/квизе/финале)
      if (modeRef.current === "menu" || quizOpenRef.current || finishedRef.current) return;
      pausedRef.current = true;
      setPaused(true);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onLockChange);
    renderer.domElement.addEventListener("click", onClick);

    // тач: левая половина — джойстик, правая — обзор
    const joy = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
    const look = { active: false, id: -1, lx: 0, ly: 0 };
    const onTouchStart = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < window.innerWidth / 2 && !joy.active) {
          joy.active = true; joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY; joy.dx = 0; joy.dy = 0;
        } else if (!look.active) {
          look.active = true; look.id = t.identifier; look.lx = t.clientX; look.ly = t.clientY;
        }
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (joy.active && t.identifier === joy.id) {
          joy.dx = Math.max(-60, Math.min(60, t.clientX - joy.ox));
          joy.dy = Math.max(-60, Math.min(60, t.clientY - joy.oy));
          if (knobRef.current)
            knobRef.current.style.transform = `translate(${joy.dx}px,${joy.dy}px)`;
        } else if (look.active && t.identifier === look.id) {
          yaw -= (t.clientX - look.lx) * 0.005;
          pitch -= (t.clientY - look.ly) * 0.005;
          pitch = Math.max(-1.35, Math.min(1.35, pitch));
          look.lx = t.clientX; look.ly = t.clientY;
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (joy.active && t.identifier === joy.id) {
          joy.active = false; joy.dx = 0; joy.dy = 0;
          if (knobRef.current) knobRef.current.style.transform = "translate(0,0)";
        }
        if (look.active && t.identifier === look.id) look.active = false;
      }
    };
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
    renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: false });
    renderer.domElement.addEventListener("touchend", onTouchEnd);
    renderer.domElement.addEventListener("touchcancel", onTouchEnd);

    // интерфейс для кнопки «ДЕЙСТВИЕ» (тач) + отладка для автотестов
    const w = window as unknown as {
      __simInteract?: () => void;
      __simDebug?: {
        set: (x: number, z: number, yawTo: number) => void;
        getAnchor: () => { x: number; z: number } | null;
      };
    };
    w.__simInteract = interact;
    w.__simDebug = {
      set: (x, z, yawTo) => {
        player.x = x;
        player.z = z;
        yaw = yawTo;
      },
      getAnchor: () => {
        const a = anchorRef.current;
        return a ? { x: a.x, z: a.z } : null;
      },
    };

    // коллизии: круги вокруг оборудования
    const colliders = [
      { x: -9, z: -2, r: 2.9 },      // Е-101
      { x: 0, z: 0, r: 1.7 },        // насос Н-101
      { x: -2.7, z: 0, r: 0.7 },     // ЗД-101
      { x: 3.4, z: 0, r: 0.7 },      // ЗД-102
      { x: 3, z: 4.6, r: 0.95 },     // пульт МП-101
      { x: 1.15, z: 1.35, r: 0.55 }, // маслобак
      { x: -6.5, z: -12.5, r: 1.8 }, // реактор
      { x: -2.2, z: -12.8, r: 1.5 }, // А-401 ОВД
      { x: 2.4, z: -12.6, r: 1.7 },  // А-402 ОНД
      { x: -12.5, z: 3.5, r: 2.2 },  // холодильники А-503
      { x: 11.5, z: -3, r: 2.4 },    // бустерный компрессор
      { x: 12.5, z: 5, r: 1.0 }, { x: 12.5, z: 8, r: 1.0 }, { x: 12.5, z: 11, r: 1.0 }, // А-316/322/325
      { x: -11, z: 13.5, r: 1.8 }, { x: -7.5, z: 13.5, r: 1.5 }, // ёмкости гор. воды
      { x: 13.8, z: 13, r: 1.1 },    // А-315
      { x: -12.5, z: 8.5, r: 1.3 },  // А-507
      { x: 7, z: -12.2, r: 2.3 },    // испаритель пропана
      { x: -5, z: -9.8, r: 0.8 },    // клапан Böhler
      { x: -3, z: 7, r: 1.3 },       // ЦПУ
      { x: 8.5, z: 0.5, r: 1.2 },    // маслостанция
      { x: 5.5, z: -6, r: 0.35 },    // датчик ДВК
    ];

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // ---------- цикл ----------
    const clock = new THREE.Clock();
    let raf = 0;
    let lastLabelSent: string | null = null;
    let activeSeconds = 0;
    let lastSecond = -1;
    let lastNavDist = -1;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const walking =
        modeRef.current !== "menu" &&
        !pausedRef.current &&
        !quizOpenRef.current &&
        !finishedRef.current;

      if (walking) {
        const speed = 4.2;
        let mx = 0, mz = 0;
        if (keys.has("KeyW") || keys.has("ArrowUp")) mz -= 1;
        if (keys.has("KeyS") || keys.has("ArrowDown")) mz += 1;
        if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
        if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
        if (joy.active) { mx += joy.dx / 60; mz += joy.dy / 60; }
        const len = Math.hypot(mx, mz);
        if (len > 0.01) {
          mx /= Math.max(1, len); mz /= Math.max(1, len);
          const sin = Math.sin(yaw), cos = Math.cos(yaw);
          player.x += (mx * cos - mz * sin) * speed * dt;
          player.z += (mx * sin + mz * cos) * speed * dt;
        }
        player.x = Math.max(-15, Math.min(15, player.x));
        player.z = Math.max(-14.5, Math.min(15, player.z));
        for (const c of colliders) {
          const dx = player.x - c.x, dz = player.z - c.z;
          const d = Math.hypot(dx, dz);
          if (d < c.r && d > 0.0001) {
            player.x = c.x + (dx / d) * c.r;
            player.z = c.z + (dz / d) * c.r;
          }
        }
        // счёт активного времени
        activeSeconds += dt;
        const sec = Math.floor(activeSeconds);
        if (sec !== lastSecond) { lastSecond = sec; setElapsed(sec); }
      }
      camera.position.set(player.x, 1.7, player.z);
      camera.rotation.set(pitch, yaw, 0);

      // определение цели
      let label: string | null = null;
      if (walking && modeRef.current === "pump") {
        let best: TargetId | null = null;
        let bestD = 1e9;
        const stepTarget = stepRef.current < STEPS.length ? STEPS[stepRef.current].target : null;
        const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        for (const it of interactables) {
          const dx = it.pos.x - player.x, dz = it.pos.z - player.z;
          const d = Math.hypot(dx, dz);
          if (d > it.radius) continue;
          const dot = (dx * fwd.x + dz * fwd.z) / Math.max(d, 0.001);
          if (d > 0.6 && dot < 0.35) continue;
          const weighted = it.id === stepTarget ? d - 1.2 : d;
          if (weighted < bestD) { bestD = weighted; best = it.id; }
        }
        currentTarget = best;
        label = best ? TARGET_LABELS[best] : null;
      } else if (walking && modeRef.current === "alarms") {
        currentTarget = null;
        const a = anchorRef.current;
        if (a) {
          const d = Math.hypot(a.x - player.x, a.z - player.z);
          const di = Math.round(d);
          if (di !== lastNavDist) { lastNavDist = di; setNavDist(di); }
          if (d <= a.r) label = a.label;
        }
      } else {
        currentTarget = null;
      }
      if (label !== lastLabelSent) { lastLabelSent = label; setTargetLabel(label); }

      // твины (штурвалы)
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        tw.t += dt;
        const k = Math.min(tw.t / tw.dur, 1);
        const e = 1 - Math.pow(1 - k, 3);
        tw.obj.rotation[tw.axis] = tw.from + (tw.to - tw.from) * e;
        if (k >= 1) tweens.splice(i, 1);
      }

      // вибрация работающего насоса
      if (pumpRunning) {
        pumpBody.position.y = Math.sin(t * 70) * 0.006;
        pumpBody.position.x = Math.sin(t * 53) * 0.004;
      } else {
        pumpBody.position.set(0, 0, 0);
      }

      // стрелка манометра
      const jitter = pumpRunning ? Math.sin(t * 22) * 0.03 : 0;
      needle.rotation.z += (pressureTarget + jitter - needle.rotation.z) * Math.min(dt * 3, 1);

      // мигающая лампа площадки и пульс маяка
      amberLamp.intensity = 10 + Math.sin(t * 2.2) * 2.5;
      if (beacon.visible) {
        const p = 0.5 + 0.5 * Math.sin(t * 5);
        beamMat.opacity = 0.08 + p * 0.14;
        ringMat.opacity = 0.35 + p * 0.45;
        bRing.scale.setScalar(1 + p * 0.4);
        bLight.intensity = 8 + p * 12;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("touchstart", onTouchStart);
      renderer.domElement.removeEventListener("touchmove", onTouchMove);
      renderer.domElement.removeEventListener("touchend", onTouchEnd);
      renderer.domElement.removeEventListener("touchcancel", onTouchEnd);
      delete w.__simInteract;
      delete w.__simDebug;
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- React-логика режимов ----------

  function lockPointer() {
    if (isTouch) return;
    const canvas = mountRef.current?.querySelector("canvas");
    canvas?.requestPointerLock();
  }

  function beginPump() {
    modeRef.current = "pump";
    setMode("pump");
    pausedRef.current = false;
    setPaused(false);
    lockPointer();
  }

  function beginAlarms() {
    const deck = shuffle(deviations).slice(0, Math.min(ALARM_COUNT, deviations.length));
    setAlarmDeck(deck);
    setAlarmIdx(0);
    setAlarmResults([]);
    setAlarmsDone(false);
    finishedRef.current = false;
    modeRef.current = "alarms";
    setMode("alarms");
    pausedRef.current = false;
    setPaused(false);
    const a = ANCHORS[deck[0].group];
    anchorRef.current = a;
    beaconRef.current.show(a.x, a.z);
    lockPointer();
  }

  function resume() {
    pausedRef.current = false;
    setPaused(false);
    lockPointer();
  }

  // открыть квиз по текущей вводной (вызывается из three-цикла)
  openQuizRef.current = () => {
    const card = alarmDeck[alarmIdx];
    if (!card) return;
    quizOpenRef.current = true;
    setQuiz({
      card,
      phase: "c",
      opts: {
        c: buildQuizOptions(deviations, card, "cause"),
        a: buildQuizOptions(deviations, card, "action"),
      },
      picked: null,
      causeOk: false,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  };

  function quizPick(text: string) {
    if (!quiz || quiz.picked !== null) return;
    const correct = quiz.phase === "c" ? quiz.card.cause : quiz.card.action;
    setQuiz({
      ...quiz,
      picked: text,
      causeOk: quiz.phase === "c" ? text === correct : quiz.causeOk,
    });
  }

  function quizNext() {
    if (!quiz || quiz.picked === null) return;
    if (quiz.phase === "c") {
      setQuiz({ ...quiz, phase: "a", picked: null });
      return;
    }
    const actionOk = quiz.picked === quiz.card.action;
    const res: AlarmResult = {
      id: quiz.card.id,
      page: quiz.card.page,
      symptom: quiz.card.symptom,
      causeOk: quiz.causeOk,
      actionOk,
    };
    const all = [...alarmResults, res];
    setAlarmResults(all);
    setQuiz(null);
    quizOpenRef.current = false;
    if (alarmIdx + 1 < alarmDeck.length) {
      const ni = alarmIdx + 1;
      setAlarmIdx(ni);
      const a = ANCHORS[alarmDeck[ni].group];
      anchorRef.current = a;
      beaconRef.current.show(a.x, a.z);
      lockPointer();
    } else {
      anchorRef.current = null;
      beaconRef.current.hide();
      finishedRef.current = true;
      setAlarmsDone(true);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  const mono = { fontFamily: MONO, letterSpacing: "0.08em" } as const;
  const plate = { background: "rgba(20,29,36,0.92)", border: "1px solid " + C.line, borderRadius: 10 } as const;
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const alarmCard = alarmDeck[alarmIdx];
  const score = alarmResults.reduce((s, r) => s + (r.causeOk ? 1 : 0) + (r.actionOk ? 1 : 0), 0);
  const walking = mode !== "menu" && !paused && !quiz && !pumpFinished && !alarmsDone;

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, color: C.text, overflow: "hidden", fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

      {/* верхняя плашка */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "rgba(12,18,22,0.85)", borderBottom: "1px solid " + C.line, ...mono, fontSize: 11, color: C.dim, zIndex: 5 }}>
        <span>ОБХОД УСТАНОВКИ · 408-Р-6</span>
        {mode === "pump" ? (
          <span style={{ color: C.red }}>ПУСК Н-101 · ДЕМО-МЕХАНИКА</span>
        ) : mode === "alarms" ? (
          <span style={{ color: C.amber }}>ТРЕВОГИ ПО ТАБЛ. №12 · СТР. 385–398</span>
        ) : (
          <span style={{ color: C.amber }}>ТРЕНАЖЁР СМЕНЫ</span>
        )}
        <span>
          {fmt(elapsed)}
          {mode === "pump" && <> · ОШИБКИ: <span style={{ color: errors > 0 ? C.red : C.green }}>{errors}</span></>}
          {mode === "alarms" && <> · СЧЁТ: <span style={{ color: C.green }}>{score}</span></>}
        </span>
      </div>

      {/* чек-лист пуска (десктоп) */}
      {mode === "pump" && walking && (
        <div className="hide-mobile" style={{ position: "absolute", top: 46, right: 12, width: 270, ...plate, padding: 10 }}>
          <div style={{ ...mono, fontSize: 10, color: C.amber, marginBottom: 6 }}>ЗАДАНИЕ: ПУСК НАСОСА Н-101 (ДЕМО)</div>
          {STEPS.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 7, padding: "3px 0", opacity: i > stepIdx ? 0.4 : 1 }}>
              <span style={{ ...mono, fontSize: 10, color: i < stepIdx ? C.green : i === stepIdx ? C.amber : C.dim, minWidth: 12 }}>
                {i < stepIdx ? "✓" : i === stepIdx ? "▶" : "·"}
              </span>
              <span style={{ fontSize: 11.5, lineHeight: 1.35, color: i === stepIdx ? C.text : C.dim }}>{s.title}</span>
            </div>
          ))}
        </div>
      )}
      {mode === "pump" && walking && (
        <div className="only-mobile" style={{ position: "absolute", top: 46, left: 12, right: 12, ...plate, padding: "8px 10px" }}>
          <span style={{ ...mono, fontSize: 10, color: C.amber }}>ШАГ {stepIdx + 1}/{STEPS.length}: </span>
          <span style={{ fontSize: 12 }}>{STEPS[Math.min(stepIdx, STEPS.length - 1)].title}</span>
        </div>
      )}

      {/* панель текущей вводной (тревоги) */}
      {mode === "alarms" && walking && alarmCard && (
        <>
          <div className="hide-mobile" style={{ position: "absolute", top: 46, right: 12, width: 300, ...plate, borderColor: C.red, padding: 12 }}>
            <div style={{ ...mono, fontSize: 10, color: C.red }}>
              ВВОДНАЯ {alarmIdx + 1}/{alarmDeck.length} · ОТКЛОНЕНИЕ №{alarmCard.id} · СТР. {alarmCard.page}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.45, marginTop: 8 }}>{alarmCard.symptom}</div>
            <div style={{ ...mono, fontSize: 10, color: C.amber, marginTop: 10 }}>
              → {ANCHORS[alarmCard.group].label} · {navDist} м
            </div>
          </div>
          <div className="only-mobile" style={{ position: "absolute", top: 46, left: 12, right: 12, ...plate, borderColor: C.red, padding: "8px 10px" }}>
            <div style={{ ...mono, fontSize: 9, color: C.red }}>
              ВВОДНАЯ {alarmIdx + 1}/{alarmDeck.length} · №{alarmCard.id} · СТР. {alarmCard.page} · → {ANCHORS[alarmCard.group].label} · {navDist} м
            </div>
            <div style={{ fontSize: 11.5, lineHeight: 1.35, marginTop: 4 }}>{alarmCard.symptom}</div>
          </div>
        </>
      )}

      {/* прицел */}
      {walking && !isTouch && (
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5, borderRadius: 99, background: targetLabel ? C.amber : "rgba(220,230,238,0.5)" }} />
      )}

      {/* подпись цели */}
      {walking && targetLabel && (
        <div style={{ position: "absolute", left: "50%", bottom: isTouch ? 150 : 108, transform: "translateX(-50%)", ...plate, padding: "6px 12px", ...mono, fontSize: 11, color: C.blue, whiteSpace: "nowrap" }}>
          {targetLabel} {!isTouch && <span style={{ color: C.dim }}>· [E]</span>}
        </div>
      )}

      {/* сообщения */}
      {msg && walking && (
        <div style={{ position: "absolute", left: "50%", bottom: isTouch ? 196 : 150, transform: "translateX(-50%)", maxWidth: 520, width: "calc(100% - 32px)", ...plate, borderColor: msg.kind === "ok" ? C.green : msg.kind === "err" ? C.red : C.amber, padding: "9px 13px", ...mono, fontSize: 11.5, lineHeight: 1.5, color: msg.kind === "ok" ? C.green : msg.kind === "err" ? C.red : C.amber, textAlign: "center" }}>
          {msg.text}
        </div>
      )}

      {/* джойстик + кнопка действия (тач) */}
      {walking && isTouch && (
        <>
          <div style={{ position: "absolute", left: 26, bottom: 30, width: 110, height: 110, borderRadius: 999, border: "1.5px solid " + C.line, background: "rgba(20,29,36,0.5)" }}>
            <div ref={knobRef} style={{ position: "absolute", left: 33, top: 33, width: 44, height: 44, borderRadius: 999, background: "rgba(84,182,232,0.35)", border: "1.5px solid " + C.blue, transition: "transform 40ms linear" }} />
          </div>
          <button
            onClick={() => (window as unknown as { __simInteract?: () => void }).__simInteract?.()}
            disabled={!targetLabel}
            style={{ position: "absolute", right: 26, bottom: 44, width: 84, height: 84, borderRadius: 999, ...mono, fontSize: 11, fontWeight: 800, background: targetLabel ? C.amber : "rgba(36,52,63,0.6)", color: targetLabel ? "#1a1408" : C.dim, border: "none" }}
          >
            ДЕЙСТВИЕ
          </button>
        </>
      )}

      {/* ГЛАВНОЕ МЕНЮ */}
      {mode === "menu" && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(12,18,22,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto", zIndex: 10 }}>
          <div style={{ ...plate, maxWidth: 480, width: "100%", padding: 22, margin: "40px 0" }}>
            <div style={{ ...mono, fontSize: 11, color: C.amber }}>ТРЕНАЖЁР СМЕНЫ · 3D-ОБХОД УСТАНОВКИ</div>
            <h1 style={{ fontSize: 27, fontWeight: 800, lineHeight: 1.1, marginTop: 8 }}>РЕАКТОРНЫЙ БЛОК</h1>
            <p style={{ color: C.dim, fontSize: 13, lineHeight: 1.55, marginTop: 8 }}>
              Площадка: реактор, ОВД А-401, ОНД А-402, холодильники А-503, сборник А-507,
              клапан «Böhler», бустерный компрессор, узел дозировки А-315/316, маслостанция,
              ёмкости горячей воды, ЦПУ, датчики ДВК.
            </p>

            <button onClick={beginAlarms} style={{ width: "100%", marginTop: 14, padding: "13px 14px", textAlign: "left", background: C.amber, color: "#1a1408", borderRadius: 12, border: "none" }}>
              <div style={{ ...mono, fontSize: 13, fontWeight: 800, letterSpacing: "0.1em" }}>ТРЕВОГИ СМЕНЫ · {Math.min(ALARM_COUNT, deviations.length)} ВВОДНЫХ</div>
              <div style={{ fontSize: 11.5, marginTop: 3, opacity: 0.85 }}>
                Реальные отклонения из Табл. №12 (стр. 385–398): дойди до оборудования, определи причину и действия.
              </div>
            </button>

            <button onClick={beginPump} style={{ width: "100%", marginTop: 10, padding: "13px 14px", textAlign: "left", background: C.panel, color: C.text, borderRadius: 12, border: "1px solid " + C.line }}>
              <div style={{ ...mono, fontSize: 13, fontWeight: 800, letterSpacing: "0.1em" }}>
                ПУСК НАСОСА Н-101 <span style={{ color: C.red, fontSize: 10 }}>ДЕМО</span>
              </div>
              <div style={{ fontSize: 11.5, marginTop: 3, color: C.dim }}>
                Обкатка механики: последовательность и оборудование выдуманы, не по инструкции.
              </div>
            </button>

            <div style={{ ...mono, fontSize: 10.5, color: C.dim, lineHeight: 1.8, marginTop: 14, padding: 10, background: C.inset, borderRadius: 8, border: "1px solid " + C.line }}>
              {isTouch
                ? "ЛЕВЫЙ ДЖОЙСТИК — ДВИЖЕНИЕ · СВАЙП СПРАВА — ОБЗОР · КНОПКА «ДЕЙСТВИЕ»"
                : "WASD — ДВИЖЕНИЕ · МЫШЬ — ОБЗОР · E ИЛИ КЛИК — ДЕЙСТВИЕ · ESC — ПАУЗА"}
            </div>
            <div style={{ ...mono, fontSize: 9.5, color: C.dim, marginTop: 10, lineHeight: 1.6 }}>
              УЧЕБНЫЙ ТРЕНАЖЁР — НЕ ЗАМЕНЯЕТ ИНСТРУКЦИЮ 408-Р-6. ТЕКСТЫ ВВОДНЫХ — ДОСЛОВНО ИЗ
              ТАБЛ. №12 С УКАЗАНИЕМ СТРАНИЦ. ГЕОМЕТРИЯ ПЛОЩАДКИ УСЛОВНАЯ.
            </div>
          </div>
        </div>
      )}

      {/* ПАУЗА */}
      {paused && mode !== "menu" && !pumpFinished && !alarmsDone && !quiz && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(12,18,22,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 10 }}>
          <div style={{ ...plate, maxWidth: 420, width: "100%", padding: 22 }}>
            <div style={{ ...mono, fontSize: 11, color: C.amber }}>ПАУЗА</div>
            <p style={{ color: C.dim, fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
              {mode === "alarms" ? "Вводная ждёт: " + (alarmCard?.symptom ?? "") : "Пуск насоса не завершён."}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={resume} style={{ flex: 1, padding: "12px 0", background: C.amber, color: "#1a1408", borderRadius: 10, fontWeight: 800, border: "none", ...mono, fontSize: 12 }}>
                ПРОДОЛЖИТЬ
              </button>
              <button onClick={() => window.location.reload()} style={{ flex: 1, padding: "12px 0", background: C.panel, border: "1px solid " + C.line, color: C.text, borderRadius: 10, ...mono, fontSize: 12 }}>
                В МЕНЮ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* КВИЗ ПО ВВОДНОЙ (реальный контент Табл. №12) */}
      {quiz && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(12,18,22,0.88)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", zIndex: 10 }}>
          <div style={{ ...plate, maxWidth: 560, width: "100%", padding: 18, margin: "30px 0" }}>
            <div style={{ ...mono, fontSize: 10, color: C.blue }}>
              ОТКЛОНЕНИЕ №{quiz.card.id} · {(GROUP_NAMES[quiz.card.group] ?? quiz.card.group).toUpperCase()} · СТР. {quiz.card.page}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.45, marginTop: 8 }}>{quiz.card.symptom}</div>
            <div style={{ ...mono, fontSize: 11, color: C.amber, marginTop: 14, marginBottom: 8 }}>
              {quiz.phase === "c" ? "ВОЗМОЖНАЯ ПРИЧИНА?" : "ДЕЙСТВИЯ ПЕРСОНАЛА?"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {quiz.opts[quiz.phase].map((text, i) => {
                const isPicked = quiz.picked === text;
                const correct = quiz.phase === "c" ? quiz.card.cause : quiz.card.action;
                const isCorrect = text === correct;
                const revealed = quiz.picked !== null;
                let border = C.line, bg: string = C.inset, mark: string | null = null, dimmed = false;
                if (revealed) {
                  if (isCorrect) { border = C.green; bg = "rgba(70,209,126,0.08)"; mark = "✓ ВЕРНО ПО ИНСТРУКЦИИ"; }
                  else if (isPicked) { border = C.red; bg = "rgba(240,104,94,0.08)"; mark = "✕ НЕ ПО ЭТОМУ ОТКЛОНЕНИЮ"; }
                  else dimmed = true;
                }
                return (
                  <button key={i} onClick={() => quizPick(text)} disabled={revealed}
                    style={{ border: "1px solid " + border, background: bg, borderRadius: 10, opacity: dimmed ? 0.45 : 1, textAlign: "left", padding: 12, color: C.text }}>
                    <div style={{ display: "flex", gap: 10 }}>
                      <span style={{ ...mono, fontSize: 11, color: revealed && isCorrect ? C.green : revealed && isPicked ? C.red : C.blue, paddingTop: 2 }}>{LETTERS[i]}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{text}</div>
                        {mark && <div style={{ ...mono, fontSize: 10, color: isCorrect ? C.green : C.red, marginTop: 6 }}>{mark}</div>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {quiz.picked !== null && (
              <button onClick={quizNext} style={{ width: "100%", marginTop: 12, padding: "12px 0", background: C.panel, border: "1px solid " + C.blue, color: C.text, borderRadius: 10, ...mono, fontSize: 12 }}>
                {quiz.phase === "c" ? "К ДЕЙСТВИЯМ →" : alarmIdx + 1 < alarmDeck.length ? "СЛЕДУЮЩАЯ ВВОДНАЯ →" : "ИТОГИ СМЕНЫ →"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ИТОГИ: ПУСК (ДЕМО) */}
      {pumpFinished && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(12,18,22,0.86)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 10 }}>
          <div style={{ ...plate, maxWidth: 460, width: "100%", padding: 22 }}>
            <div style={{ ...mono, fontSize: 11, color: C.dim }}>ОБХОД ЗАВЕРШЁН · ДЕМО</div>
            <div style={{ marginTop: 10, display: "flex", alignItems: "flex-end", gap: 16 }}>
              <span style={{ ...mono, fontSize: 46, lineHeight: 1, color: errors === 0 ? C.green : errors <= 2 ? C.amber : C.red }}>
                {errors === 0 ? "БЕЗ ОШИБОК" : errors + " ОШ."}
              </span>
              <span style={{ ...mono, fontSize: 13, color: C.dim, paddingBottom: 4 }}>{fmt(elapsed)}</span>
            </div>
            <p style={{ color: C.dim, fontSize: 13, lineHeight: 1.5, marginTop: 10 }}>
              Насос Н-101 в работе, подача в коллектор, доклад передан.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => window.location.reload()} style={{ flex: 1, padding: "12px 0", background: C.amber, color: "#1a1408", borderRadius: 10, fontWeight: 800, border: "none", ...mono, fontSize: 12 }}>
                В МЕНЮ
              </button>
              <a href="/play" style={{ flex: 1, padding: "12px 0", background: C.panel, border: "1px solid " + C.line, color: C.text, borderRadius: 10, textAlign: "center", ...mono, fontSize: 12 }}>
                К КАРТОЧКАМ
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ИТОГИ: ТРЕВОГИ */}
      {alarmsDone && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(12,18,22,0.88)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", zIndex: 10 }}>
          <div style={{ ...plate, maxWidth: 520, width: "100%", padding: 22, margin: "30px 0" }}>
            <div style={{ ...mono, fontSize: 11, color: C.dim }}>СМЕНА СДАНА · ТАБЛ. №12</div>
            <div style={{ marginTop: 10, display: "flex", alignItems: "flex-end", gap: 16 }}>
              <span style={{ ...mono, fontSize: 52, lineHeight: 1, color: score >= alarmDeck.length * 2 * 0.8 ? C.green : score >= alarmDeck.length ? C.amber : C.red }}>
                {score}
                <span style={{ fontSize: 20, color: C.dim }}>/{alarmDeck.length * 2}</span>
              </span>
              <span style={{ ...mono, fontSize: 12, color: C.dim, paddingBottom: 4 }}>{fmt(elapsed)}</span>
            </div>
            {alarmResults.some((r) => !(r.causeOk && r.actionOk)) ? (
              <div style={{ marginTop: 16 }}>
                <div style={{ ...mono, fontSize: 11, color: C.amber }}>СВЕРИТЬ С ИНСТРУКЦИЕЙ:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  {alarmResults.filter((r) => !(r.causeOk && r.actionOk)).map((r) => (
                    <div key={r.id} style={{ ...plate, padding: 10 }}>
                      <div style={{ ...mono, fontSize: 10, color: C.red }}>
                        №{r.id} · СТР. {r.page} · {!r.causeOk && !r.actionOk ? "ПРИЧИНА И ДЕЙСТВИЯ" : !r.causeOk ? "ПРИЧИНА" : "ДЕЙСТВИЯ"}
                      </div>
                      <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.4, marginTop: 4 }}>{r.symptom}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ ...plate, borderColor: C.green, padding: 14, marginTop: 16 }}>
                <div style={{ ...mono, fontSize: 12, color: C.green }}>БЕЗ ЗАМЕЧАНИЙ. ВСЕ ВВОДНЫЕ — ПО ИНСТРУКЦИИ.</div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={beginAlarms} style={{ flex: 1, padding: "12px 0", background: C.amber, color: "#1a1408", borderRadius: 10, fontWeight: 800, border: "none", ...mono, fontSize: 12 }}>
                ЕЩЁ СМЕНА
              </button>
              <button onClick={() => { setAlarmsDone(false); finishedRef.current = false; modeRef.current = "menu"; setMode("menu"); }}
                style={{ flex: 1, padding: "12px 0", background: C.panel, border: "1px solid " + C.line, color: C.text, borderRadius: 10, ...mono, fontSize: 12 }}>
                В МЕНЮ
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (min-width: 700px){ .only-mobile{ display:none } }
        @media (max-width: 699px){ .hide-mobile{ display:none } }
      `}</style>
    </div>
  );
}
