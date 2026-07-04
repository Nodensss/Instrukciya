import Link from "next/link";

const C = {
  bg: "#0c1216",
  panel: "#141d24",
  line: "#24343f",
  text: "#dce6ee",
  dim: "#7f95a4",
  amber: "#f2b63c",
};

const mono = {
  fontFamily: "ui-monospace,'SF Mono','Cascadia Mono',Consolas,monospace",
  letterSpacing: "0.08em",
} as const;

export default function Home() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
      }}
    >
      <div className="mx-auto px-4 pt-16 pb-10" style={{ maxWidth: 560 }}>
        <div style={{ ...mono, fontSize: 11, color: C.amber }}>СМЕНА · 408-Р-6</div>
        <h1 className="mt-2" style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05 }}>
          ТРЕНАЖЁР СМЕНЫ
        </h1>
        <p className="mt-3" style={{ color: C.dim, fontSize: 14, lineHeight: 1.5 }}>
          Обучающие модули по производственной инструкции № 408-Р-6.
        </p>
        <Link
          href="/play"
          className="block w-full mt-8 py-4 text-center"
          style={{
            background: C.amber,
            color: "#1a1408",
            borderRadius: 12,
            fontWeight: 800,
            letterSpacing: "0.12em",
            fontSize: 15,
          }}
        >
          МОДУЛЬ 1 · ДИСПЕТЧЕР ОТКЛОНЕНИЙ
        </Link>
        <div
          className="mt-6 p-3"
          style={{ background: C.panel, border: "1px solid " + C.line, borderRadius: 10 }}
        >
          <div style={{ ...mono, fontSize: 10, color: C.dim, lineHeight: 1.7 }}>
            УЧЕБНЫЙ ТРЕНАЖЁР. НЕ ЗАМЕНЯЕТ ИНСТРУКЦИЮ 408-Р-6.
          </div>
        </div>
      </div>
    </div>
  );
}
