import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { getGatewayIcon } from "@/lib/gatewayBrands";
import type { NormalizedPaymentMethod } from "@/lib/paymentMethods";
import { Split, AlertTriangle } from "lucide-react";

export interface SplitPaymentEntry {
  methodId: string;
  methodName: string;
  amount: number;
}

interface Props {
  total: number;
  paymentMethods: NormalizedPaymentMethod[];
  onChange: (splits: SplitPaymentEntry[]) => void;
  format: (n: number, d?: number) => string;
  symbol: string;
}

const POSSplitPayment = ({ total, paymentMethods, onChange, format, symbol }: Props) => {
  const methods = paymentMethods.length > 0
    ? paymentMethods
    : [{ id: "cash", name: "Cash", enabled: true, config: {} }];

  const [splits, setSplits] = useState<Record<string, string>>({ [methods[0].id]: String(total) });

  useEffect(() => {
    // Reset when total changes
    setSplits({ [methods[0].id]: String(total) });
  }, [total]);

  useEffect(() => {
    const entries: SplitPaymentEntry[] = Object.entries(splits)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([id, v]) => ({
        methodId: id,
        methodName: methods.find(m => m.id === id)?.name || id,
        amount: parseFloat(v) || 0,
      }));
    onChange(entries);
  }, [splits]);

  const allocated = Object.values(splits).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const remaining = total - allocated;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Split className="h-4 w-4 text-primary" />
        Split Payment
      </div>

      <div className="space-y-2">
        {methods.map(m => (
          <div key={m.id} className="flex items-center gap-2">
            <img src={getGatewayIcon(m.id)} alt="" className="h-5 w-5 rounded object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <Label className="text-xs w-20 truncate">{m.name}</Label>
            <Input
              type="number"
              placeholder="0"
              value={splits[m.id] || ""}
              onChange={e => setSplits(prev => ({ ...prev, [m.id]: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50">
        <span>Allocated: {format(allocated)}</span>
        {remaining > 0.01 ? (
          <Badge variant="outline" className="text-[10px] gap-1 border-orange-400 text-orange-600">
            {format(remaining)} due
          </Badge>
        ) : remaining < -0.01 ? (
          <Badge variant="destructive" className="text-[10px] gap-1">
            <AlertTriangle className="h-3 w-3" />
            {format(Math.abs(remaining))} over
          </Badge>
        ) : (
          <Badge className="bg-green-500 text-white text-[10px]">Balanced ✓</Badge>
        )}
      </div>
    </div>
  );
};

export default POSSplitPayment;
