import PumpWalkSim from "@/components/PumpWalkSim";
import { getPlayableDeviations } from "@/lib/deviations";

export const metadata = {
  title: "3D-обход установки · СМЕНА",
};

export default function SimPage() {
  // в тревоги попадают только записи с полным дословным текстом (status === "ok")
  return <PumpWalkSim deviations={getPlayableDeviations()} />;
}
