import raw from "@/content/deviations.json";

export type DeviationStatus = "ok" | "needs_full_text" | "needs_review";

export interface DeviationRecord {
  id: number;
  page: number;
  group: string;
  status: DeviationStatus;
  symptom: string;
  cause: string;
  action: string;
}

export interface DeviationsFile {
  meta: {
    source: string;
    extracted: string;
    note: string;
    total: number;
    ready: number;
  };
  deviations: DeviationRecord[];
}

const data = raw as DeviationsFile;

/** Все записи каталога (52 шт., включая усечённые). */
export function getAllDeviations(): DeviationRecord[] {
  return data.deviations;
}

/** Только записи с полным дословным текстом — они попадают в игру. */
export function getPlayableDeviations(): DeviationRecord[] {
  return data.deviations.filter((d) => d.status === "ok");
}

export function getMeta() {
  return data.meta;
}
