import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField = ({ label, error, required, children, className }: FormFieldProps) => (
  <div className={cn("space-y-1.5", className)}>
    <Label className="text-sm font-medium">
      {label}{required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
    {children}
    {error && (
      <p className="text-xs text-destructive animate-fade-in">{error}</p>
    )}
  </div>
);
