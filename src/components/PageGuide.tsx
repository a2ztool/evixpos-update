import { useState } from "react";
import { HelpCircle, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface GuideStep {
  title: string;
  description: string;
}

interface PageGuideProps {
  title: string;
  steps: GuideStep[];
}

const PageGuide = ({ title, steps }: PageGuideProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <HelpCircle className="h-3.5 w-3.5" />
          Guide
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(92vw,24rem)] p-0 border-primary/20 shadow-xl"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5 rounded-t-md">
          <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
            <HelpCircle className="h-4 w-4 text-primary" />
            {title}
          </h4>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ol className="space-y-2.5 p-4 max-h-[60vh] overflow-y-auto">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-xs">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">
                {i + 1}
              </span>
              <div>
                <p className="font-medium text-foreground">{step.title}</p>
                <p className="text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  );
};

export default PageGuide;
