import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';

export interface SuggestionItem {
  value: string;
  hint?: string;
}

interface AutocompleteInputProps {
  id: string;
  value: string;
  onChange: (q: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  items: (string | SuggestionItem)[];
  inputRef?: React.RefObject<HTMLInputElement | null>;
  maxShown?: number;
  minChars?: number;
}

/**
 * Text input with a lightweight suggestion dropdown.
 * - Filters items as you type (matches value or hint)
 * - ArrowUp/ArrowDown + Enter to pick, Esc closes (without bubbling to global shortcuts)
 * - Consumed keys are NOT forwarded to the parent onKeyDown (avoids double search)
 */
export default function AutocompleteInput({
  id,
  value,
  onChange,
  onKeyDown,
  placeholder,
  items,
  inputRef,
  maxShown = 8,
  minChars = 1,
}: AutocompleteInputProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const normalized = useMemo<SuggestionItem[]>(
    () => items.map((it) => (typeof it === 'string' ? { value: it } : it)),
    [items]
  );

  const matches = useMemo(() => {
    const q = value.toLowerCase().trim();
    if (q.length < minChars) return [];
    const out: SuggestionItem[] = [];
    for (const it of normalized) {
      if (
        it.value.toLowerCase().includes(q) ||
        (it.hint ? it.hint.toLowerCase().includes(q) : false)
      ) {
        // skip exact single match (nothing to suggest)
        if (normalized.length > 1 || it.value.toLowerCase() !== q) out.push(it);
        if (out.length >= maxShown) break;
      }
    }
    return out;
  }, [normalized, value, maxShown, minChars]);

  const showDropdown = open && matches.length > 0;

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
    setActive(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && matches.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % matches.length);
      return;
    }
    if (e.key === 'ArrowUp' && matches.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a - 1 + matches.length) % matches.length);
      return;
    }
    if (e.key === 'Enter' && showDropdown && active >= 0 && matches[active]) {
      // Pick highlighted suggestion instead of searching
      e.preventDefault();
      e.stopPropagation();
      select(matches[active].value);
      return;
    }
    if (e.key === 'Escape' && showDropdown) {
      // Close dropdown only — don't trigger global "clear"
      e.stopPropagation();
      setOpen(false);
      setActive(-1);
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        type="text"
        value={value}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          if (value.trim().length >= minChars) setOpen(true);
        }}
        onBlur={() => {
          // Delay so a suggestion click (mouseDown) lands before close
          setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full glass-input rounded-xl pl-4 pr-10 py-3 text-white placeholder-slate-400"
      />
      {value && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange('');
            setOpen(false);
            setActive(-1);
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          aria-label="Clear input"
        >
          <X size={16} />
        </button>
      )}
      {showDropdown && (
        <ul className="absolute z-50 left-0 right-0 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/95 backdrop-blur-md shadow-2xl py-1 text-left">
          {matches.map((m, i) => (
            <li key={`${m.value}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(m.value);
                }}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2 text-sm transition cursor-pointer ${
                  active === i
                    ? 'bg-indigo-600/25 text-white'
                    : 'text-slate-300 hover:bg-slate-800/70'
                }`}
              >
                <span className="truncate font-medium">{m.value}</span>
                {m.hint && (
                  <span className="text-[11px] text-slate-400 truncate shrink-0">{m.hint}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
