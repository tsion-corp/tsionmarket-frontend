"use client";

import { useEffect, useState } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PredictionCard } from "@/components/dashboard/prediction/prediction-card";
import { PredictionSlider } from "@/components/dashboard/prediction/prediction-slider";
import { PREDICTIONS } from "@/lib/data/dashboard";
import { predictionPayout } from "@/lib/format";
import type { ConfirmPayload } from "@/components/dashboard/modal-types";
import type { Prediction } from "@/lib/types";

interface PredictionViewProps {
  onOpenConfirm: (confirm: ConfirmPayload) => void;
}

export function PredictionView({ onOpenConfirm }: PredictionViewProps) {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const buy = (p: Prediction, yes: boolean) =>
    onOpenConfirm({
      eyebrow: "Prediction",
      title: yes ? "Buy Yes" : "Buy No",
      sub: p.q,
      lines: [
        { k: "Position", v: yes ? "Yes" : "No", c: yes ? "#7CE7B0" : "#F6A5A5" },
        { k: "Price", v: yes ? p.yes : p.no },
        { k: "Stake", v: "$50.00" },
        { k: "Payout if right", v: `$${predictionPayout(50, yes ? p.yes : p.no)}`, c: "#A78BFA" },
      ],
      cta: yes ? `Buy Yes · ${p.yes}` : `Buy No · ${p.no}`,
      successTitle: "Position open",
      successMsg: `Your ${yes ? "Yes" : "No"} position is live. Track it in your portfolio.`,
    });

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>Prediction markets</Eyebrow>
      <h2 className="ws-serif mt-2.5 text-[30px] tracking-[-0.02em]">Trade your conviction</h2>

      <div className="mt-[18px]">
        {desktop ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {PREDICTIONS.map((p) => (
              <PredictionCard key={p.q} prediction={p} onBuy={(yes) => buy(p, yes)} />
            ))}
          </div>
        ) : (
          <PredictionSlider predictions={PREDICTIONS} onBuy={buy} />
        )}
      </div>
    </div>
  );
}
