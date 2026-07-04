import DispatcherGame, { GameCard } from "@/components/DispatcherGame";
import { getMeta, getPlayableDeviations } from "@/lib/deviations";

export const metadata = {
  title: "Диспетчер отклонений · СМЕНА",
};

export default function PlayPage() {
  const cards: GameCard[] = getPlayableDeviations().map((d) => ({
    id: d.id,
    p: d.page,
    g: d.group,
    s: d.symptom,
    c: d.cause,
    a: d.action,
  }));

  return <DispatcherGame deviations={cards} totalInCatalog={getMeta().total} />;
}
