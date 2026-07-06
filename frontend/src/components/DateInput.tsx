import { useState, useEffect, useRef } from "react";
import { toDisplayDate } from "../utils/dateUtils";
import Calendar from "./Calendar";

interface DateInputProps {
  value: string;
  onChange?: (isoDate: string) => void;
  readOnly?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

export default function DateInput({
  value,
  onChange,
  readOnly = false,
  required = false,
  placeholder = "dd/mm/yyyy",
  className = "",
}: DateInputProps) {
  const [displayValue, setDisplayValue] = useState(value ? toDisplayDate(value) : "");
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDisplayValue(value ? toDisplayDate(value) : "");
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const cleaned = input.replace(/[^\d/]/g, "");
    setDisplayValue(cleaned);

    if (cleaned.length === 10 && onChange) {
      const parts = cleaned.split("/");
      if (parts.length === 3) {
        const [day, month, year] = parts;
        const dayNum = parseInt(day, 10);
        const monthNum = parseInt(month, 10);
        const yearNum = parseInt(year, 10);

        if (
          dayNum >= 1 && dayNum <= 31 &&
          monthNum >= 1 && monthNum <= 12 &&
          yearNum >= 2000 && yearNum <= 2099
        ) {
          const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
          onChange(isoDate);
        }
      }
    }
  };

  const handleBlur = () => {
    setDisplayValue(value ? toDisplayDate(value) : "");
  };

  const handleCalendarChange = (isoDate: string) => {
    if (onChange) {
      onChange(isoDate);
      setDisplayValue(toDisplayDate(isoDate));
    }
  };

  return (
    <div ref={anchorRef} className="relative">
      <input
        type="text"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        readOnly={readOnly}
        required={required}
        placeholder={placeholder}
        className={`rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm bg-white dark:bg-[#111118] text-slate-800 dark:text-[#f1f5f9] placeholder:text-slate-400 dark:placeholder:text-[#64748b] focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20 ${className} ${readOnly || !onChange ? "" : "pr-8"}`}
      />
      {!readOnly && onChange && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="absolute right-0 top-0 flex h-full w-8 cursor-pointer items-center justify-center text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#94a3b8] transition-colors"
          tabIndex={-1}
          aria-label="Open calendar"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        </button>
      )}
      {open && (
        <Calendar
          value={value}
          onChange={handleCalendarChange}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
        />
      )}
    </div>
  );
}
