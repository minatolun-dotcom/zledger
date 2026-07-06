import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";

interface CalendarProps {
  value: string;
  onChange: (isoDate: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement>;
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function parseISO(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  return {
    year: parseInt(parts[0], 10),
    month: parseInt(parts[1], 10) - 1,
    day: parseInt(parts[2], 10),
  };
}

function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function Calendar({ value, onChange, onClose, anchorRef }: CalendarProps) {
  const parsed = parseISO(value);
  const today = new Date();
  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  // Compute fixed position from anchor, clamped to viewport
  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const anchorRect = anchorRef.current.getBoundingClientRect();
    const menuW = 280;
    const menuH = calendarRef.current?.offsetHeight ?? 320;
    const gap = 4;
    let left = anchorRect.right - menuW;
    let top = anchorRect.bottom + gap;
    if (left < gap) left = gap;
    if (left + menuW > window.innerWidth - gap) left = window.innerWidth - menuW - gap;
    if (top + menuH > window.innerHeight - gap) top = anchorRect.top - menuH - gap;
    if (top < gap) top = gap;
    setPos({ left, top });
  }, [anchorRef, showYearPicker]);

  const selectedDay = parsed?.day ?? 0;
  const todayStr = toISO(today.getFullYear(), today.getMonth(), today.getDate());

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }, [viewMonth, viewYear]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }, [viewMonth, viewYear]);

  const selectDate = (day: number) => {
    onChange(toISO(viewYear, viewMonth, day));
    onClose();
  };

  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, anchorRef]);

  const yearRange = Array.from({ length: 12 }, (_, i) => viewYear - 5 + i);

  return (
    <div
      ref={calendarRef}
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 99999 }}
      className="w-[280px] rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] shadow-lg dark:shadow-dark-lg select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#1e1e28] hover:text-slate-700 dark:hover:text-[#f1f5f9] transition-colors"
          aria-label="Previous month"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>

        {showYearPicker ? (
          <button
            type="button"
            onClick={() => setShowYearPicker(false)}
            className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9] hover:text-brand-600 dark:hover:text-blue-400 transition-colors"
          >
            {viewYear}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowYearPicker(true)}
            className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9] hover:text-brand-600 dark:hover:text-blue-400 transition-colors"
          >
            {MONTHS[viewMonth]} {viewYear}
          </button>
        )}

        <button
          type="button"
          onClick={nextMonth}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#1e1e28] hover:text-slate-700 dark:hover:text-[#f1f5f9] transition-colors"
          aria-label="Next month"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Year Picker Grid */}
      {showYearPicker ? (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-3 gap-1.5">
            {yearRange.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => {
                  setViewYear(y);
                  setShowYearPicker(false);
                }}
                className={`rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                  y === viewYear
                    ? "bg-brand-600 dark:bg-blue-500 text-white"
                    : y === today.getFullYear()
                    ? "text-brand-600 dark:text-blue-400 font-bold"
                    : "text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#1e1e28]"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 px-3">
            {DAYS.map((d) => (
              <div
                key={d}
                className="py-1 text-center text-[11px] font-medium text-slate-400 dark:text-[#64748b]"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Date Grid */}
          <div className="grid grid-cols-7 px-3 pb-2">
            {/* Empty cells for days before month start */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-8" />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = toISO(viewYear, viewMonth, day);
              const isSelected = day === selectedDay && viewMonth === parsed?.month && viewYear === parsed?.year;
              const isToday = dateStr === todayStr;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDate(day)}
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors mx-auto ${
                    isSelected
                      ? "bg-brand-600 dark:bg-blue-500 text-white font-semibold shadow-sm"
                      : isToday
                      ? "font-bold text-brand-600 dark:text-blue-400 ring-1 ring-brand-600/30 dark:ring-blue-500/30"
                      : "text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#1e1e28]"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-[#1e1e28] px-3 py-2">
            <button
              type="button"
              onClick={goToToday}
              className="rounded-lg px-2 py-1 text-xs font-medium text-brand-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-[#1e1e28] transition-colors"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); onClose(); }}
                className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 dark:text-[#64748b] hover:bg-slate-100 dark:hover:bg-[#1e1e28] hover:text-slate-600 dark:hover:text-[#94a3b8] transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
