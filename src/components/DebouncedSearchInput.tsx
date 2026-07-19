/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";

interface DebouncedSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onEnter?: (value: string) => void;
  placeholder: string;
  className?: string;
  label: string;
  labelClassName?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  showKbd?: boolean;
}

export function DebouncedSearchInput({
  value,
  onChange,
  onEnter,
  placeholder,
  className = "",
  label,
  labelClassName = "text-slate-500",
  inputRef,
  showKbd = false,
}: DebouncedSearchInputProps) {
  const [localValue, setLocalValue] = useState(value);

  // Sync with external state changes (e.g., clears, clicking Recent Searches, shortcut resets)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Handle local typing debounced state update (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [localValue, onChange, value]);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalValue("");
    onChange("");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className={`text-[10px] font-bold uppercase tracking-wider ${labelClassName}`}>
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={(e) => {
            const val = e.target.value;
            if (val !== value) {
              onChange(val);
            }
            if (onEnter) {
              onEnter(val);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const val = (e.target as HTMLInputElement).value;
              onChange(val);
              if (onEnter) {
                onEnter(val);
              }
            }
          }}
          className={className}
        />
        {localValue ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-200 text-slate-400 transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : showKbd ? (
          <kbd className="hidden sm:inline-flex absolute right-2.5 top-1/2 -translate-y-1/2 items-center px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-400 rounded font-mono">
            /
          </kbd>
        ) : null}
      </div>
    </div>
  );
}
