import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { ScanBarcode } from "lucide-react";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Barcode scanner input component.
 * Works with USB/Bluetooth barcode scanners that emulate keyboard input.
 * Detects rapid sequential keystrokes ending with Enter as a barcode scan.
 */
const BarcodeScanner = ({ onScan, placeholder = "Scan barcode or enter SKU...", className = "", autoFocus = true }: BarcodeScannerProps) => {
  const [value, setValue] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for rapid keystrokes (barcode scanner behavior)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only process when input is not focused (global scanner mode)
    if (document.activeElement === inputRef.current) return;

    if (e.key === "Enter" && bufferRef.current.length >= 3) {
      e.preventDefault();
      onScan(bufferRef.current.trim());
      bufferRef.current = "";
      setIsScanning(false);
      return;
    }

    if (e.key.length === 1) {
      bufferRef.current += e.key;
      setIsScanning(true);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        bufferRef.current = "";
        setIsScanning(false);
      }, 100); // Scanner inputs arrive within ~50ms between chars
    }
  }, [onScan]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [handleKeyDown]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim().length >= 1) {
      onScan(value.trim());
      setValue("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`relative ${className}`}>
      <ScanBarcode className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${isScanning ? "text-green-500 animate-pulse" : "text-muted-foreground"}`} />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pl-10 font-mono"
        autoFocus={autoFocus}
      />
    </form>
  );
};

export default BarcodeScanner;
