import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: number;
  onChange: (v: number) => void;
};

/**
 * Number input that:
 *  - Clears leading "0" on focus for easy typing
 *  - On Enter / keyboard "Next" (enterKeyHint=next), advances focus to the
 *    next visible NumberInput in the DOM (data-num-nav="true"), so the user
 *    can capture inicios/finales de todos los productos usando el teclado.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, className, placeholder = "0", onFocus, onBlur, onKeyDown, ...props }, ref) => {
    const [text, setText] = React.useState<string>(value === 0 ? "" : String(value));

    const focusedRef = React.useRef(false);
    React.useEffect(() => {
      if (!focusedRef.current) {
        setText(value === 0 ? "" : String(value));
      }
    }, [value]);

    const focusNext = (current: HTMLInputElement) => {
      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[data-num-nav="true"]')
      ).filter((el) => !el.disabled && !el.readOnly && el.offsetParent !== null);
      const i = inputs.indexOf(current);
      if (i >= 0 && i < inputs.length - 1) {
        const next = inputs[i + 1];
        next.focus();
        next.select?.();
      } else {
        current.blur();
      }
    };

    return (
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        enterKeyHint="next"
        data-num-nav="true"
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
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            focusNext(e.currentTarget);
          }
          onKeyDown?.(e);
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
