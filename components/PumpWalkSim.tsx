"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ОБХОД УСТАНОВКИ (3D-ДЕМО) — прогулочный симулятор пуска насоса.
// ВНИМАНИЕ: вся последовательность операций, позиции и маркировка оборудования
// ВЫДУМАНЫ для демонстрации механики. Это НЕ инструкция 408-Р-6.
// Реальный сценарий пуска подставляется в Сессии «симулятор насоса»
// из TZ_simulator_pusk_nasosa_408-R-6.md.

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

type TargetId = "pump" | "oil" | "v1" | "v2" | "panel" | "gauge";

interface Step {
  target: TargetId;
  title: string;
  ok: string;
}

// ДЕМО-последовательность (выдумана, помечена в UI)
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

export default function PumpWalkSim() {
  const mountRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  const [started, setStarted] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [target, setTarget] = useState<TargetId | null>(null);
  const [errors, setErrors] = useState(0);
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // мост React → цикл three
  const startedRef = useRef(false);
  const stepRef = useRef(0);
  const errRef = useRef(0);
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

    // ---------- ёмкость Е-101 ----------
    const tank = new THREE.Group();
    addCyl(2, 2, 4.4, 32, mSteel, 0, 2.2, 0, 0, tank);
    addCyl(2.02, 2.02, 0.25, 32, mAmber, 0, 0.5, 0, 0, tank);
    addCyl(2.02, 2.02, 0.25, 32, mAmber, 0, 3.9, 0, 0, tank);
    tank.position.set(-9, 0, -2);
    scene.add(tank);
    const tankLabel = makeLabelSprite("Е-101 · ЁМКОСТЬ");
    tankLabel.position.set(-9, 5.1, -2);
    scene.add(tankLabel);

    // ---------- насосный агрегат Н-101 ----------
    const skid = new THREE.Group();
    addBox(3.6, 0.3, 1.8, mDark, 0, 0.15, 0, skid); // рама
    const pumpBody = new THREE.Group();
    addCyl(0.5, 0.5, 0.7, 24, mRed, -0.9, 0.75, 0, Math.PI / 2, pumpBody); // улитка
    addCyl(0.16, 0.16, 0.5, 16, mSteel, -0.35, 0.75, 0, Math.PI / 2, pumpBody); // вал
    addCyl(0.42, 0.42, 1.3, 24, mBlue, 0.6, 0.75, 0, Math.PI / 2, pumpBody); // двигатель
    addBox(0.5, 0.12, 0.5, mBlue, 0.6, 1.45, 0, pumpBody); // клеммник
    skid.add(pumpBody);
    scene.add(skid);
    const pumpLabel = makeLabelSprite("Н-101 · НАСОС");
    pumpLabel.position.set(0, 2.4, 0);
    scene.add(pumpLabel);
    // лампа состояния насоса
    const pumpLamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x000000 })
    );
    pumpLamp.position.set(0.6, 1.6, 0);
    scene.add(pumpLamp);

    // ---------- маслобак ----------
    const oilGroup = new THREE.Group();
    addCyl(0.28, 0.28, 0.65, 20, mYellow, 0, 0.62, 0, 0, oilGroup);
    addBox(0.08, 0.3, 0.03, new THREE.MeshStandardMaterial({ color: 0xdce6ee, roughness: 0.2 }), 0, 0.62, 0.27, oilGroup); // маслоуказатель
    addCyl(0.05, 0.05, 0.6, 10, mPipe, 0.35, 0.3, 0, Math.PI / 2.6, oilGroup);
    oilGroup.position.set(1.15, 0, 1.35);
    scene.add(oilGroup);

    // ---------- трубопроводы ----------
    // всас: Е-101 → ЗД-101 → насос (вдоль x, высота 0.75)
    addCyl(0.16, 0.16, 5.4, 16, mPipe, -4.3, 0.75, 0, Math.PI / 2); // от ёмкости до задвижки+
    addCyl(0.16, 0.16, 2.6, 16, mPipe, -2.7 + 0.4, 0.75, 0, Math.PI / 2);
    // нагнетание: насос → PI-101 → ЗД-102 → коллектор
    addCyl(0.13, 0.13, 3.4, 16, mPipe, 1.3, 0.9, 0, Math.PI / 2);
    addCyl(0.13, 0.13, 8, 16, mPipe, 7, 0.9, 0, Math.PI / 2);
    addCyl(0.13, 0.13, 2.2, 16, mPipe, 11, 1.9, 0); // стояк вверх у эстакады

    // эстакада для антуража (вдоль z = -8)
    for (let i = 0; i < 3; i++) {
      addCyl(0.14, 0.14, 30, 12, mPipe, 0, 3.1 + i * 0.42, -8.2, Math.PI / 2);
    }
    for (const px of [-12, -4, 4, 12]) {
      addBox(0.22, 3.4, 0.22, mDark, px, 1.7, -8.2);
      addBox(0.18, 0.18, 1.4, mDark, px, 3.35, -8.2);
    }

    // ---------- задвижки ----------
    function makeValve(tag: string, x: number, z: number, pipeY: number) {
      const g = new THREE.Group();
      addCyl(0.24, 0.24, 0.42, 16, mSteel, 0, 0, 0, Math.PI / 2, g); // корпус
      addCyl(0.055, 0.055, 0.55, 10, mSteel, 0, 0.3, 0, 0, g); // шток
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.26, 0.045, 12, 28),
        mRed
      );
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
      const label = makeLabelSprite(tag);
      label.position.set(x, pipeY + 1.25, z);
      scene.add(label);
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
    needle.rotation.z = 2.2; // стрелка на нуле
    gaugeGroup.add(needle);
    gaugeGroup.position.set(1.9, 0.9, 0);
    scene.add(gaugeGroup);
    const gaugeLabel = makeLabelSprite("PI-101");
    gaugeLabel.position.set(1.9, 2.35, 0);
    scene.add(gaugeLabel);

    // ---------- пульт МП-101 ----------
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
    panelGroup.rotation.y = Math.PI; // экраном к дорожке
    scene.add(panelGroup);
    const panelLabel = makeLabelSprite("МП-101 · ПУЛЬТ");
    panelLabel.position.set(3, 2.3, 4.6);
    scene.add(panelLabel);

    // ---------- интерактивные точки ----------
    const interactables: { id: TargetId; pos: THREE.Vector3; radius: number }[] = [
      { id: "pump", pos: new THREE.Vector3(0, 0.8, 0), radius: 2.4 },
      { id: "oil", pos: new THREE.Vector3(1.15, 0.7, 1.35), radius: 1.1 },
      { id: "v1", pos: new THREE.Vector3(-2.7, 0.9, 0), radius: 2.0 },
      { id: "v2", pos: new THREE.Vector3(3.4, 1.0, 0), radius: 2.0 },
      { id: "gauge", pos: new THREE.Vector3(1.9, 1.6, 0), radius: 1.7 },
      { id: "panel", pos: new THREE.Vector3(3, 1.1, 4.6), radius: 2.0 },
    ];

    // ---------- состояние симуляции ----------
    let v1Open = false;
    let v2Open = false;
    let pumpRunning = false;
    let pressureTarget = 2.2; // угол стрелки: 2.2 = ноль, -2.2 = максимум
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

    // ---------- сообщения/шаги ----------
    function showMsg(text: string, kind: Msg["kind"]) {
      if (msgTimer.current) clearTimeout(msgTimer.current);
      setMsg({ text, kind });
      msgTimer.current = setTimeout(() => setMsg(null), 4200);
    }
    function addError() {
      errRef.current += 1;
      setErrors(errRef.current);
    }

    function interact() {
      if (!startedRef.current || stepRef.current >= STEPS.length) return;
      const id = currentTarget;
      if (!id) return;
      const step = STEPS[stepRef.current];
      if (id === step.target) {
        // верное действие
        switch (stepRef.current) {
          case 2: v1Open = true; spinWheel(v1, true); break;
          case 4: setPumpRunning(true); pressureTarget = -1.5; break;
          case 6: v2Open = true; spinWheel(v2, true); pressureTarget = -0.6; break;
        }
        showMsg("✓ " + step.ok, "ok");
        stepRef.current += 1;
        setStepIdx(stepRef.current);
        if (stepRef.current >= STEPS.length) {
          setFinished(true);
          if (document.pointerLockElement) document.exitPointerLock();
        }
        return;
      }
      // неверное действие — ДЕМО-защиты
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
      if (!("ontouchstart" in window) && document.pointerLockElement !== renderer.domElement && !finished) {
        // Esc — пауза
        setStarted((s) => {
          startedRef.current = false;
          return s ? false : s;
        });
      }
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

    // интерфейс interact для кнопки «ДЕЙСТВИЕ» (тач) + отладочный телепорт для автотестов
    const w = window as unknown as {
      __simInteract?: () => void;
      __simDebug?: { set: (x: number, z: number, yawTo: number) => void };
    };
    w.__simInteract = interact;
    w.__simDebug = {
      set: (x, z, yawTo) => {
        player.x = x;
        player.z = z;
        yaw = yawTo;
      },
    };

    // коллизии: круги вокруг оборудования
    const colliders = [
      { x: -9, z: -2, r: 2.9 },   // Е-101
      { x: 0, z: 0, r: 1.7 },     // насос
      { x: -2.7, z: 0, r: 0.7 },  // ЗД-101
      { x: 3.4, z: 0, r: 0.7 },   // ЗД-102
      { x: 3, z: 4.6, r: 0.95 },  // пульт
      { x: 1.15, z: 1.35, r: 0.55 }, // маслобак
    ];

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // ---------- цикл ----------
    const clock = new THREE.Clock();
    const startTime = performance.now();
    let raf = 0;
    let lastTargetSent: TargetId | null = null;
    let lastSecond = -1;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      // движение
      if (startedRef.current) {
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
        // границы площадки
        player.x = Math.max(-13.5, Math.min(13.5, player.x));
        player.z = Math.max(-7, Math.min(13.5, player.z));
        // выталкивание из оборудования
        for (const c of colliders) {
          const dx = player.x - c.x, dz = player.z - c.z;
          const d = Math.hypot(dx, dz);
          if (d < c.r && d > 0.0001) {
            player.x = c.x + (dx / d) * c.r;
            player.z = c.z + (dz / d) * c.r;
          }
        }
      }
      camera.position.set(player.x, 1.7, player.z);
      camera.rotation.set(pitch, yaw, 0);

      // ближайшая интерактивная точка в секторе взгляда;
      // при равенстве приоритет отдаём цели текущего шага (соседние точки не «воруют» захват)
      let best: TargetId | null = null;
      let bestD = 1e9;
      const stepTarget = stepRef.current < STEPS.length ? STEPS[stepRef.current].target : null;
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      for (const it of interactables) {
        const dx = it.pos.x - player.x, dz = it.pos.z - player.z;
        const d = Math.hypot(dx, dz);
        if (d > it.radius) continue;
        const dot = (dx * fwd.x + dz * fwd.z) / Math.max(d, 0.001);
        if (d > 0.6 && dot < 0.35) continue; // смотрим мимо
        // цель текущего шага «весит» ближе, если она в зоне и в поле зрения
        const weighted = it.id === stepTarget ? d - 1.2 : d;
        if (weighted < bestD) { bestD = weighted; best = it.id; }
      }
      currentTarget = best;
      if (best !== lastTargetSent) { lastTargetSent = best; setTarget(best); }

      // твины (штурвалы)
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        tw.t += dt;
        const k = Math.min(tw.t / tw.dur, 1);
        const e = 1 - Math.pow(1 - k, 3);
        tw.obj.rotation[tw.axis] = tw.from + (tw.to - tw.from) * e;
        if (k >= 1) tweens.splice(i, 1);
      }

      // вибрация работающего насоса + лампа
      if (pumpRunning) {
        pumpBody.position.y = Math.sin(t * 70) * 0.006;
        pumpBody.position.x = Math.sin(t * 53) * 0.004;
      } else {
        pumpBody.position.set(0, 0, 0);
      }

      // стрелка манометра (плавно к цели, лёгкое дрожание в работе)
      const jitter = pumpRunning ? Math.sin(t * 22) * 0.03 : 0;
      needle.rotation.z += (pressureTarget + jitter - needle.rotation.z) * Math.min(dt * 3, 1);

      // мигающая лампа на площадке
      amberLamp.intensity = 10 + Math.sin(t * 2.2) * 2.5;

      // таймер
      if (startedRef.current && stepRef.current < STEPS.length) {
        const sec = Math.floor((performance.now() - startTime) / 1000);
        if (sec !== lastSecond) { lastSecond = sec; setElapsed(sec); }
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

  function begin() {
    startedRef.current = true;
    setStarted(true);
    if (!isTouch) {
      const canvas = mountRef.current?.querySelector("canvas");
      canvas?.requestPointerLock();
    }
  }

  const mono = { fontFamily: MONO, letterSpacing: "0.08em" } as const;
  const plate = { background: "rgba(20,29,36,0.92)", border: "1px solid " + C.line, borderRadius: 10 } as const;
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, color: C.text, overflow: "hidden", fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

      {/* верхняя плашка */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "rgba(12,18,22,0.85)", borderBottom: "1px solid " + C.line, ...mono, fontSize: 11, color: C.dim }}>
        <span>ОБХОД УСТАНОВКИ · ПУСК Н-101</span>
        <span style={{ color: C.amber }}>ДЕМО · НЕ ПО ИНСТРУКЦИИ 408-Р-6</span>
        <span>{fmt(elapsed)} · ОШИБКИ: <span style={{ color: errors > 0 ? C.red : C.green }}>{errors}</span></span>
      </div>

      {/* чек-лист задания */}
      {started && !finished && (
        <div className="hide-mobile" style={{ position: "absolute", top: 46, right: 12, width: 270, ...plate, padding: 10 }}>
          <div style={{ ...mono, fontSize: 10, color: C.amber, marginBottom: 6 }}>ЗАДАНИЕ: ПУСК НАСОСА Н-101</div>
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

      {/* текущий шаг (мобайл, вместо полного списка) */}
      {started && !finished && (
        <div className="only-mobile" style={{ position: "absolute", top: 46, left: 12, right: 12, ...plate, padding: "8px 10px" }}>
          <span style={{ ...mono, fontSize: 10, color: C.amber }}>ШАГ {stepIdx + 1}/{STEPS.length}: </span>
          <span style={{ fontSize: 12 }}>{STEPS[Math.min(stepIdx, STEPS.length - 1)].title}</span>
        </div>
      )}

      {/* прицел */}
      {started && !finished && !isTouch && (
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5, borderRadius: 99, background: target ? C.amber : "rgba(220,230,238,0.5)" }} />
      )}

      {/* подпись цели */}
      {started && !finished && target && (
        <div style={{ position: "absolute", left: "50%", bottom: isTouch ? 150 : 108, transform: "translateX(-50%)", ...plate, padding: "6px 12px", ...mono, fontSize: 11, color: C.blue, whiteSpace: "nowrap" }}>
          {TARGET_LABELS[target]} {!isTouch && <span style={{ color: C.dim }}>· [E]</span>}
        </div>
      )}

      {/* сообщения */}
      {msg && (
        <div style={{ position: "absolute", left: "50%", bottom: isTouch ? 196 : 150, transform: "translateX(-50%)", maxWidth: 520, width: "calc(100% - 32px)", ...plate, borderColor: msg.kind === "ok" ? C.green : msg.kind === "err" ? C.red : C.amber, padding: "9px 13px", ...mono, fontSize: 11.5, lineHeight: 1.5, color: msg.kind === "ok" ? C.green : msg.kind === "err" ? C.red : C.amber, textAlign: "center" }}>
          {msg.text}
        </div>
      )}

      {/* джойстик + кнопка действия (тач) */}
      {started && !finished && isTouch && (
        <>
          <div style={{ position: "absolute", left: 26, bottom: 30, width: 110, height: 110, borderRadius: 999, border: "1.5px solid " + C.line, background: "rgba(20,29,36,0.5)" }}>
            <div ref={knobRef} style={{ position: "absolute", left: 33, top: 33, width: 44, height: 44, borderRadius: 999, background: "rgba(84,182,232,0.35)", border: "1.5px solid " + C.blue, transition: "transform 40ms linear" }} />
          </div>
          <button
            onClick={() => (window as unknown as { __simInteract?: () => void }).__simInteract?.()}
            disabled={!target}
            style={{ position: "absolute", right: 26, bottom: 44, width: 84, height: 84, borderRadius: 999, ...mono, fontSize: 11, fontWeight: 800, background: target ? C.amber : "rgba(36,52,63,0.6)", color: target ? "#1a1408" : C.dim, border: "none" }}
          >
            ДЕЙСТВИЕ
          </button>
        </>
      )}

      {/* стартовый экран / пауза */}
      {!started && !finished && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(12,18,22,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ ...plate, maxWidth: 460, width: "100%", padding: 22 }}>
            <div style={{ ...mono, fontSize: 11, color: C.amber }}>ТРЕНАЖЁР СМЕНЫ · 3D-ОБХОД</div>
            <h1 style={{ fontSize: 27, fontWeight: 800, lineHeight: 1.1, marginTop: 8 }}>ПУСК НАСОСА Н-101</h1>
            <p style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.55, marginTop: 10 }}>
              Обойдите площадку и выполните пуск насоса по чек-листу: осмотр, масло,
              всас, пуск с пульта, контроль давления, нагнетание. Неверные действия
              фиксируются как ошибки.
            </p>
            <div style={{ ...mono, fontSize: 10.5, color: C.dim, lineHeight: 1.8, marginTop: 12, padding: 10, background: C.inset, borderRadius: 8, border: "1px solid " + C.line }}>
              {isTouch
                ? "ЛЕВЫЙ ДЖОЙСТИК — ДВИЖЕНИЕ · СВАЙП СПРАВА — ОБЗОР · КНОПКА «ДЕЙСТВИЕ»"
                : "WASD — ДВИЖЕНИЕ · МЫШЬ — ОБЗОР · E ИЛИ КЛИК — ДЕЙСТВИЕ · ESC — ПАУЗА"}
            </div>
            <button onClick={begin} style={{ width: "100%", marginTop: 16, padding: "14px 0", background: C.amber, color: "#1a1408", borderRadius: 12, fontWeight: 800, fontSize: 14, border: "none", ...mono, letterSpacing: "0.12em" }}>
              {elapsed > 0 ? "ПРОДОЛЖИТЬ ОБХОД" : "НАЧАТЬ ОБХОД"}
            </button>
            <div style={{ ...mono, fontSize: 9.5, color: C.red, marginTop: 12, lineHeight: 1.6 }}>
              ДЕМО-РЕЖИМ: ПОСЛЕДОВАТЕЛЬНОСТЬ ОПЕРАЦИЙ И ОБОРУДОВАНИЕ ВЫДУМАНЫ ДЛЯ ОБКАТКИ
              МЕХАНИКИ. НЕ ИСПОЛЬЗОВАТЬ КАК УЧЕБНЫЙ МАТЕРИАЛ. НЕ ЗАМЕНЯЕТ ИНСТРУКЦИЮ 408-Р-6.
            </div>
          </div>
        </div>
      )}

      {/* финальный экран */}
      {finished && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(12,18,22,0.86)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ ...plate, maxWidth: 460, width: "100%", padding: 22 }}>
            <div style={{ ...mono, fontSize: 11, color: C.dim }}>ОБХОД ЗАВЕРШЁН</div>
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
                ЕЩЁ РАЗ
              </button>
              <a href="/play" style={{ flex: 1, padding: "12px 0", background: C.panel, border: "1px solid " + C.line, color: C.text, borderRadius: 10, textAlign: "center", ...mono, fontSize: 12 }}>
                К КАРТОЧКАМ
              </a>
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
