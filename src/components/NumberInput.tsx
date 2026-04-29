import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: number;
  onChange: (v: number) => void;
};

/**
 * Number input that shows the current value (or empty placeholder "0")
 * but on focus clears the leading "0" so the user can type without
 * having to delete it. Stores numbers, not strings.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, className, placeholder = "0", onFocus, onBlur, ...props }, ref) => {
    const [text, setText] = React.useState<string>(value === 0 ? "" : String(value));

    // Keep text in sync if external value changes (and we're not focused)
    const focusedRef = React.useRef(false);
    React.useEffect(() => {
      if (!focusedRef.current) {
        setText(value === 0 ? "" : String(value));
      }
    }, [value]);

    return (
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        placeholder={placeholder}
        value={text}
        onFocus={(e) => {
          focusedRef.current = true;
          if (text === "0") setText("");
          onFocus?.(e);
        }}
        onBlur={(e) => {
          focusedRef.current = false;
          if (text === "") onChange(0);
          onBlur?.(e);
        }}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          onChange(v === "" ? 0 : Number(v));
        }}
        className={cn(className)}
        {...props}
      />
    );
  }
);
NumberInput.displayName = "NumberInput";
