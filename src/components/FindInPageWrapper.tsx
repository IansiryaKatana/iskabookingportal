import { useState, useEffect } from "react";
import { FindInPage } from "@/components/FindInPage";

/**
 * Registers global Ctrl+F (Windows/Linux) and Cmd+F (Mac) to open the custom
 * in-page find bar instead of the browser's find dialog.
 */
export function FindInPageWrapper() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      const isF = e.key === "f" || e.key === "F";
      if (!isMod || !isF) return;

      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        (target.isContentEditable && target.closest("[contenteditable=\"true\"]"));

      // When focus is in a text field, only prevent default so browser find doesn't open;
      // optionally still open our find (many apps open find anyway). We open our find.
      e.preventDefault();
      if (isInput) {
        // Option: don't open when in input so we don't steal focus. User said "appropriate to the page".
        // Opening find when in input is common (e.g. VS Code opens find with Ctrl+F in editor).
        setOpen(true);
      } else {
        setOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return <FindInPage open={open} onClose={() => setOpen(false)} />;
}

export default FindInPageWrapper;
