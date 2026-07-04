"use client";

import { useState, useEffect } from "react";

// ДИСПЕТЧЕР ОТКЛОНЕНИЙ — тренажёр по Табл. №12 инструкции 408-Р-6 (стр. 385–398)
// Механика и стиль «ЦПУ» перенесены из прототипа reference/dispatcher-otkloneniy-v0.jsx.
// Контент приходит из content/deviations.json (только status === "ok").

export interface GameCard {
  id: number;
  p: number; // страница инструкции
  g: string; // группа
  s: string; // симптом (отклонение)
  c: string; // возможная причина
  a: string; // действия персонала
}

interface GameResult {
  id: number;
  p: number;
  s: string;
  causeOk: boolean;
  actionOk: boolean;
}

interface Stats {
  best: number;
  plays: number;
  mastered: number[];
}

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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildOptions(all: GameCard[], card: GameCard, field: "c" | "a") {
  const correct = card[field];
  const same = all
    .filter((d) => d.id !== card.id && d.g === card.g && d[field] !== correct)
    .map((d) => d[field]);
  const rest = all
    .filter((d) => d.id !== card.id && d.g !== card.g && d[field] !== correct)
    .map((d) => d[field]);
  const pool = [...new Set([...shuffle(same), ...shuffle(rest)])];
  return shuffle([correct, ...pool.slice(0, 3)]);
}

const STORAGE_KEY = "dispatcher_v0_stats";

function loadStats(): Stats | null {
  try {
    const r = window.localStorage.getItem(STORAGE_KEY);
    return r ? (JSON.parse(r) as Stats) : null;
  } catch {
    return null;
  }
}
function saveStats(st: Stats) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
  } catch {
    /* офлайн-режим без сохранения */
  }
}

const LETTERS = ["А", "Б", "В", "Г"];
const DECK_SIZE = 10;

export default function DispatcherGame({
  deviations,
  totalInCatalog,
}: {
  deviations: GameCard[];
  totalInCatalog: number;
}) {
  const [screen, setScreen] = useState<"home" | "game" | "end">("home");
  const [stats, setStats] = useState<Stats>({ best: 0, plays: 0, mastered: [] });
  const [deck, setDeck] = useState<GameCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [opts, setOpts] = useState<{ c: string[]; a: string[] }>({ c: [], a: [] });
  const [phase, setPhase] = useState<"c" | "a">("c");
  const [picked, setPicked] = useState<string | null>(null);
  const [causeOk, setCauseOk] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestRun, setBestRun] = useState(0);
  const [results, setResults] = useState<GameResult[]>([]);

  useEffect(() => {
    const s = loadStats();
    if (s) setStats(s);
  }, []);

  const card = deck[idx];
  const maxScore = deck.length * 2;

  function setupCard(d: GameCard[], i: number) {
    const c = d[i];
    setOpts({ c: buildOptions(deviations, c, "c"), a: buildOptions(deviations, c, "a") });
    setPhase("c");
    setPicked(null);
    setCauseOk(false);
  }
  function start() {
    const d = shuffle(deviations).slice(0, DECK_SIZE);
    setDeck(d);
    setIdx(0);
    setScore(0);
    setStreak(0);
    setBestRun(0);
    setResults([]);
    setupCard(d, 0);
    setScreen("game");
  }
  function pick(text: string) {
    if (picked !== null) return;
    setPicked(text);
    const ok = text === card[phase];
    if (ok) setScore((s) => s + 1);
    if (phase === "c") setCauseOk(ok);
  }
  function next() {
    if (phase === "c") {
      setPhase("a");
      setPicked(null);
      return;
    }
    const actionOk = picked === card.a;
    const full = causeOk && actionOk;
    const newStreak = full ? streak + 1 : 0;
    setStreak(newStreak);
    setBestRun((b) => Math.max(b, newStreak));
    const res = [...results, { id: card.id, p: card.p, s: card.s, causeOk, actionOk }];
    setResults(res);
    if (idx + 1 < deck.length) {
      setIdx(idx + 1);
      setupCard(deck, idx + 1);
    } else {
      const mastered = [
        ...new Set([
          ...stats.mastered,
          ...res.filter((r) => r.causeOk && r.actionOk).map((r) => r.id),
        ]),
      ];
      const ns: Stats = {
        best: Math.max(stats.best, Math.max(bestRun, newStreak)),
        plays: stats.plays + 1,
        mastered,
      };
      setStats(ns);
      saveStats(ns);
      setScreen("end");
    }
  }

  const S = {
    app: {
      minHeight: "100vh",
      background: C.bg,
      color: C.text,
      fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
    },
    mono: {
      fontFamily: "ui-monospace,'SF Mono','Cascadia Mono',Consolas,monospace",
      letterSpacing: "0.08em",
    },
    plate: { background: C.panel, border: "1px solid " + C.line, borderRadius: 10 },
  } as const;

  const StatusBar = () => (
    <div
      className="flex items-center justify-between px-4 py-2"
      style={{ ...S.mono, borderBottom: "1px solid " + C.line, fontSize: 11, color: C.dim }}
    >
      <span className="flex items-center gap-2">
        <span
          className="pulse-dot"
          style={{ width: 7, height: 7, borderRadius: 99, background: C.green, display: "inline-block" }}
        ></span>
        РЕАКТОРНЫЙ БЛОК · ТАБЛ. №12
      </span>
      <span>408-Р-6 · СТР. 385–398</span>
    </div>
  );

  const OptionBtn = ({ text, letter }: { text: string; letter: string }) => {
    const isPicked = picked === text,
      isCorrect = text === card[phase],
      revealed = picked !== null;
    let border = C.line,
      bg: string = C.inset,
      mark: string | null = null,
      dim = false;
    if (revealed) {
      if (isCorrect) {
        border = C.green;
        bg = "rgba(70,209,126,0.08)";
        mark = "✓ ВЕРНО ПО ИНСТРУКЦИИ";
      } else if (isPicked) {
        border = C.red;
        bg = "rgba(240,104,94,0.08)";
        mark = "✕ НЕ ПО ЭТОМУ ОТКЛОНЕНИЮ";
      } else dim = true;
    }
    return (
      <button
        onClick={() => pick(text)}
        disabled={revealed}
        className="np w-full text-left p-3 transition-colors"
        style={{ border: "1px solid " + border, background: bg, borderRadius: 10, opacity: dim ? 0.45 : 1 }}
      >
        <div className="flex gap-3">
          <span
            style={{
              ...S.mono,
              fontSize: 11,
              color: revealed && isCorrect ? C.green : revealed && isPicked ? C.red : C.blue,
              paddingTop: 2,
            }}
          >
            {letter}
          </span>
          <div className="flex-1">
            <div style={{ fontSize: 14, lineHeight: 1.45 }}>{text}</div>
            {mark && (
              <div className="mt-2" style={{ ...S.mono, fontSize: 10, color: isCorrect ? C.green : C.red }}>
                {mark}
              </div>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div style={S.app}>
      <style>{`
        .pulse-dot{animation:pd 1.6s ease-in-out infinite}
        @keyframes pd{0%,100%{opacity:1}50%{opacity:.25}}
        .np:focus-visible{outline:2px solid ${"#54b6e8"};outline-offset:2px}
        @media (prefers-reduced-motion: reduce){.pulse-dot{animation:none}}
      `}</style>
      <StatusBar />
      <div className="mx-auto px-4 pb-10" style={{ maxWidth: 560 }}>
        {screen === "home" && (
          <div className="pt-10">
            <div style={{ ...S.mono, fontSize: 11, color: C.amber }}>ТРЕНАЖЁР СМЕНЫ · МОДУЛЬ 1</div>
            <h1 className="mt-2" style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
              ДИСПЕТЧЕР
              <br />
              ОТКЛОНЕНИЙ
            </h1>
            <p className="mt-3" style={{ color: C.dim, fontSize: 14, lineHeight: 1.5 }}>
              Симптом → причина → действия персонала. Все формулировки — дословно из Табл. №12. Неверные варианты —
              реальные причины других отклонений.
            </p>
            <div className="grid grid-cols-3 gap-2 mt-6">
              {[
                ["ОСВОЕНО", stats.mastered.length + "/" + deviations.length],
                ["ЛУЧШАЯ СЕРИЯ", stats.best],
                ["СМЕН", stats.plays],
              ].map(([l, v]) => (
                <div key={l} className="p-3 text-center" style={S.plate}>
                  <div style={{ ...S.mono, fontSize: 22, color: C.green }}>{v}</div>
                  <div className="mt-1" style={{ ...S.mono, fontSize: 9, color: C.dim }}>
                    {l}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={start}
              className="np w-full mt-6 py-4"
              style={{ background: C.amber, color: "#1a1408", borderRadius: 12, fontWeight: 800, letterSpacing: "0.12em", fontSize: 15 }}
            >
              ПРИНЯТЬ СМЕНУ · {DECK_SIZE} КАРТОЧЕК
            </button>
            <div className="mt-5 p-3" style={{ ...S.plate, background: C.inset }}>
              <div style={{ ...S.mono, fontSize: 10, color: C.dim, lineHeight: 1.7 }}>
                В БАЗЕ {deviations.length} ИЗ {totalInCatalog} ОТКЛОНЕНИЙ. ОСТАЛЬНЫЕ ЖДУТ ПОЛНОГО ТЕКСТА СО СТР.
                385–398 (СМ. content/deviations.json).
                <br />
                УЧЕБНЫЙ ТРЕНАЖЁР — НЕ ЗАМЕНЯЕТ ИНСТРУКЦИЮ 408-Р-6.
              </div>
            </div>
          </div>
        )}

        {screen === "game" && card && (
          <div className="pt-5">
            <div className="flex items-center justify-between" style={{ ...S.mono, fontSize: 11, color: C.dim }}>
              <span>
                КАРТОЧКА {idx + 1}/{deck.length}
              </span>
              <span style={{ color: streak > 0 ? C.green : C.dim }}>СЕРИЯ: {streak}</span>
            </div>
            <div className="mt-3 overflow-hidden" style={{ ...S.plate, display: "flex" }}>
              <div style={{ width: 5, background: picked === null ? C.blue : picked === card[phase] ? C.green : C.red }}></div>
              <div className="p-4 flex-1">
                <div style={{ ...S.mono, fontSize: 10, color: C.blue }}>
                  ОТКЛОНЕНИЕ №{card.id} · {(GROUP_NAMES[card.g] ?? card.g).toUpperCase()} · СТР. {card.p}
                </div>
                <div className="mt-2" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.45 }}>
                  {card.s}
                </div>
              </div>
            </div>
            <div className="mt-5 mb-2" style={{ ...S.mono, fontSize: 11, color: C.amber }}>
              {phase === "c" ? "ВОЗМОЖНАЯ ПРИЧИНА?" : "ДЕЙСТВИЯ ПЕРСОНАЛА?"}
            </div>
            <div className="flex flex-col gap-2">
              {opts[phase].map((t, i) => (
                <OptionBtn key={i} text={t} letter={LETTERS[i]} />
              ))}
            </div>
            {picked !== null && (
              <button
                onClick={next}
                className="np w-full mt-4 py-3"
                style={{ background: C.panel, border: "1px solid " + C.blue, color: C.text, borderRadius: 10, ...S.mono, fontSize: 12 }}
              >
                {phase === "c" ? "К ДЕЙСТВИЯМ →" : idx + 1 < deck.length ? "СЛЕДУЮЩЕЕ ОТКЛОНЕНИЕ →" : "ИТОГИ СМЕНЫ →"}
              </button>
            )}
          </div>
        )}

        {screen === "end" && (
          <div className="pt-10">
            <div style={{ ...S.mono, fontSize: 11, color: C.dim }}>СМЕНА СДАНА</div>
            <div className="mt-2 flex items-end gap-4">
              <span
                style={{
                  ...S.mono,
                  fontSize: 52,
                  color: score >= maxScore * 0.8 ? C.green : score >= maxScore * 0.5 ? C.amber : C.red,
                  lineHeight: 1,
                }}
              >
                {score}
                <span style={{ fontSize: 20, color: C.dim }}>/{maxScore}</span>
              </span>
              <span className="pb-2" style={{ ...S.mono, fontSize: 12, color: C.dim }}>
                МАКС. СЕРИЯ: {bestRun}
              </span>
            </div>
            {results.some((r) => !(r.causeOk && r.actionOk)) ? (
              <div className="mt-6">
                <div style={{ ...S.mono, fontSize: 11, color: C.amber }}>СВЕРИТЬ С ИНСТРУКЦИЕЙ:</div>
                <div className="flex flex-col gap-2 mt-2">
                  {results
                    .filter((r) => !(r.causeOk && r.actionOk))
                    .map((r) => (
                      <div key={r.id} className="p-3" style={S.plate}>
                        <div style={{ ...S.mono, fontSize: 10, color: C.red }}>
                          №{r.id} · СТР. {r.p} ·{" "}
                          {!r.causeOk && !r.actionOk ? "ПРИЧИНА И ДЕЙСТВИЯ" : !r.causeOk ? "ПРИЧИНА" : "ДЕЙСТВИЯ"}
                        </div>
                        <div className="mt-1" style={{ fontSize: 13, color: C.dim, lineHeight: 1.4 }}>
                          {r.s}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <div className="mt-6 p-4" style={{ ...S.plate, borderColor: C.green }}>
                <div style={{ ...S.mono, fontSize: 12, color: C.green }}>
                  БЕЗ ЗАМЕЧАНИЙ. ВСЕ {deck.length} — ПО ИНСТРУКЦИИ.
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-6">
              <button
                onClick={start}
                className="np flex-1 py-3"
                style={{ background: C.amber, color: "#1a1408", borderRadius: 10, fontWeight: 800, ...S.mono, fontSize: 12 }}
              >
                ЕЩЁ СМЕНА
              </button>
              <button
                onClick={() => setScreen("home")}
                className="np flex-1 py-3"
                style={{ background: C.panel, border: "1px solid " + C.line, color: C.text, borderRadius: 10, ...S.mono, fontSize: 12 }}
              >
                НА ГЛАВНУЮ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
