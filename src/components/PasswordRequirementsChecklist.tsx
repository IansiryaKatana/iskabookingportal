import React from "react";
import { Check, X } from "lucide-react";
import { validatePassword } from "@/utils/passwordStrength";

interface PasswordRequirementsChecklistProps {
  password: string;
  showAlways?: boolean;
}

export const PasswordRequirementsChecklist: React.FC<PasswordRequirementsChecklistProps> = ({
  password,
  showAlways = false,
}) => {
  if (!password && !showAlways) {
    return null;
  }

  const { rules } = validatePassword(password);

  const items = [
    { label: "At least 8 characters", met: rules.minLength },
    { label: "One uppercase letter (A-Z)", met: rules.hasUppercase },
    { label: "One lowercase letter (a-z)", met: rules.hasLowercase },
    { label: "One number (0-9)", met: rules.hasNumber },
    { label: "One special character (e.g. !@#$%^&*)", met: rules.hasSpecial },
  ];

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs space-y-1.5 mt-2">
      <p className="font-medium text-foreground/80 mb-1">Password requirements:</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-1.5 transition-colors ${
              item.met ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
            }`}
          >
            {item.met ? (
              <Check className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            )}
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
