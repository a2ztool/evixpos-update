import { useEffect } from "react";

interface POSKeyboardShortcutsProps {
  onSearch: () => void;
  onCheckout: () => void;
  onHoldOrder: () => void;
  onResumePanel: () => void;
  onRecentPanel: () => void;
  onClearCart: () => void;
  cartEmpty: boolean;
}

/**
 * POS keyboard shortcut handler.
 * F1 = Focus search, F2 = Hold order, F3 = Resume orders, F4 = Recent transactions
 * F8 = Clear cart, Enter (when not in input) = Checkout
 */
const POSKeyboardShortcuts = ({
  onSearch, onCheckout, onHoldOrder, onResumePanel, onRecentPanel, onClearCart, cartEmpty,
}: POSKeyboardShortcutsProps) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      switch (e.key) {
        case "F1":
          e.preventDefault();
          onSearch();
          break;
        case "F2":
          e.preventDefault();
          if (!cartEmpty) onHoldOrder();
          break;
        case "F3":
          e.preventDefault();
          onResumePanel();
          break;
        case "F4":
          e.preventDefault();
          onRecentPanel();
          break;
        case "F8":
          e.preventDefault();
          onClearCart();
          break;
        case "Enter":
          if (!isInput && !cartEmpty) {
            e.preventDefault();
            onCheckout();
          }
          break;
        case "/":
          if (!isInput) {
            e.preventDefault();
            onSearch();
          }
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSearch, onCheckout, onHoldOrder, onResumePanel, onRecentPanel, onClearCart, cartEmpty]);

  return null;
};

export default POSKeyboardShortcuts;
