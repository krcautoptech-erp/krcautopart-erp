"use client";

import { lockBodyScroll, unlockBodyScroll } from "@/lib/use-body-scroll-lock";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import {
  addDays,
  formatThaiDate,
  formatThaiRange,
  getCalendarMatrix,
  getLastMonthRange,
} from "@/lib/erp-dashboard";
import styles from "./date-range-picker.module.css";

export type DateRangeValue = {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
};

export type DateRangePickerProps = {
  value: DateRangeValue;
  onChange: (nextRange: DateRangeValue) => void;
  today?: string;
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
  className?: string;
};

type Preset = {
  key: string;
  label: string;
  range: DateRangeValue;
};

const WEEKDAYS = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export function DateRangePicker({
  value,
  onChange,
  today: propToday,
  minDate,
  maxDate,
  disabled = false,
  className = "",
}: DateRangePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const presetsRef = useRef<HTMLDivElement>(null);
  const activePresetRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  // Current date in Bangkok timezone
  const today = useMemo(() => {
    if (propToday && /^\d{4}-\d{2}-\d{2}$/.test(propToday)) return propToday;
    return new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Bangkok",
    });
  }, [propToday]);

  const yesterday = useMemo(() => addDays(today, -1), [today]);

  // Defined presets matching date.png and ERP needs
  const presets = useMemo<Preset[]>(() => {
    const lastMonth = getLastMonthRange(today);
    const thisMonthStart = `${today.slice(0, 7)}-01`;
    return [
      {
        key: "today",
        label: "วันนี้",
        range: { startDate: today, endDate: today },
      },
      {
        key: "yesterday",
        label: "เมื่อวาน",
        range: { startDate: yesterday, endDate: yesterday },
      },
      {
        key: "last_7_days",
        label: "7 วันที่ผ่านมา",
        range: { startDate: addDays(today, -6), endDate: today },
      },
      {
        key: "last_30_days",
        label: "30 วันที่ผ่านมา",
        range: { startDate: addDays(today, -29), endDate: today },
      },
      {
        key: "this_month",
        label: "เดือนนี้",
        range: { startDate: thisMonthStart, endDate: today },
      },
      {
        key: "last_month",
        label: "เดือนที่แล้ว",
        range: lastMonth,
      },
    ];
  }, [today, yesterday]);

  const [isOpen, setIsOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRangeValue>(value);
  const [tempStart, setTempStart] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const activePreset = useMemo(() => {
    const range = isOpen ? draftRange : value;
    return presets.find(
      (preset) =>
        preset.range.startDate === range.startDate &&
        preset.range.endDate === range.endDate,
    );
  }, [draftRange, isOpen, presets, value]);

  // View mode: 'days' | 'months' | 'years'
  const [viewMode, setViewMode] = useState<"days" | "months" | "years">("days");
  // Which calendar triggered the picker (left or right)
  const [pickerTarget, setPickerTarget] = useState<"left" | "right">("left");
  // For years view: decade start year
  const [decadeStart, setDecadeStart] = useState(2020);

  // Month navigation: viewYear & viewMonth represent the LEFT calendar
  const initialYearMonth = useMemo(() => {
    const target = value.startDate || value.endDate || today;
    const [y, m] = target.split("-").map(Number);
    return { year: y, month: m };
  }, [value.endDate, value.startDate, today]);

  const [viewYear, setViewYear] = useState(initialYearMonth.year);
  const [viewMonth, setViewMonth] = useState(initialYearMonth.month);

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => {
      const presetsElement = presetsRef.current;
      const activeElement = activePresetRef.current;
      if (presetsElement && activeElement && window.matchMedia("(max-width: 680px)").matches) {
        presetsElement.scrollTo({
          left: activeElement.offsetLeft - (presetsElement.clientWidth - activeElement.clientWidth) / 2,
        });
      }
    });
  }, [isOpen]);

  // Right calendar month & year
  const rightMonthInfo = useMemo(() => {
    if (viewMonth === 12) {
      return { year: viewYear + 1, month: 1 };
    }
    return { year: viewYear, month: viewMonth + 1 };
  }, [viewYear, viewMonth]);

  // Calendar matrices
  const leftMatrix = useMemo(
    () => getCalendarMatrix(viewYear, viewMonth),
    [viewYear, viewMonth],
  );
  const rightMatrix = useMemo(
    () => getCalendarMatrix(rightMonthInfo.year, rightMonthInfo.month),
    [rightMonthInfo.year, rightMonthInfo.month],
  );

  // Close handlers
  const handleClose = useCallback(() => {
    setIsOpen(false);
    setViewMode("days");
    setTempStart(null);
    setHoverDate(null);
  }, []);

  const closeAndRestoreFocus = useCallback(() => {
    handleClose();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [handleClose]);

  const togglePopover = () => {
    if (isOpen) {
      handleClose();
      return;
    }
    setViewYear(initialYearMonth.year);
    setViewMonth(initialYearMonth.month);
    setDraftRange(value);
    setViewMode("days");
    setTempStart(null);
    setHoverDate(null);
    setIsOpen(true);
  };

  // Click outside and ESC listeners
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        closeAndRestoreFocus();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAndRestoreFocus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    const locksBackground = window.matchMedia("(max-width: 680px)").matches;
    if (locksBackground) {
      lockBodyScroll();
    }
    return () => {
      if (locksBackground) unlockBodyScroll();
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeAndRestoreFocus, isOpen]);

  // Navigation handlers for days view
  const handlePrevYear = () => setViewYear((y) => y - 1);
  const handleNextYear = () => setViewYear((y) => y + 1);
  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Switch to month view
  const openMonthPicker = (target: "left" | "right") => {
    setPickerTarget(target);
    setViewMode("months");
  };

  // Switch to year view
  const openYearPicker = (target: "left" | "right") => {
    setPickerTarget(target);
    const currentYear = target === "left" ? viewYear : rightMonthInfo.year;
    setDecadeStart(Math.floor(currentYear / 10) * 10);
    setViewMode("years");
  };

  // Month select handler
  const handleSelectMonth = (monthNumber: number) => {
    if (pickerTarget === "left") {
      setViewMonth(monthNumber);
    } else {
      // If right calendar picked month M, left calendar should be M - 1
      if (monthNumber === 1) {
        setViewYear((y) => y);
        setViewMonth(12);
      } else {
        setViewMonth(monthNumber - 1);
      }
    }
    setViewMode("days");
  };

  // Year select handler
  const handleSelectYear = (yearNumber: number) => {
    if (pickerTarget === "left") {
      setViewYear(yearNumber);
    } else {
      // If right calendar year selected, adjust left viewYear accordingly
      if (viewMonth === 12) {
        setViewYear(yearNumber - 1);
      } else {
        setViewYear(yearNumber);
      }
    }
    setViewMode("months");
  };

  // Preset click
  const handlePresetClick = (preset: Preset) => {
    if (
      (minDate && preset.range.startDate < minDate) ||
      (maxDate && preset.range.endDate > maxDate)
    ) return;
    setDraftRange(preset.range);
    setTempStart(null);
    setHoverDate(null);
    const [year, month] = preset.range.startDate.split("-").map(Number);
    setViewYear(year);
    setViewMonth(month);
  };

  // Day click
  const handleDayClick = (dateStr: string) => {
    if ((minDate && dateStr < minDate) || (maxDate && dateStr > maxDate)) return;

    if (!tempStart) {
      // Step 1: select start date
      setTempStart(dateStr);
      setHoverDate(dateStr);
      setDraftRange({ startDate: dateStr, endDate: dateStr });
    } else {
      // Step 2: select end date
      let start = tempStart;
      let end = dateStr;
      if (start > end) {
        start = dateStr;
        end = tempStart;
      }
      setDraftRange({ startDate: start, endDate: end });
      setTempStart(null);
      setHoverDate(null);
    }
  };

  // Effective highlight bounds
  const highlightStart = tempStart || draftRange.startDate;
  const highlightEnd = tempStart ? hoverDate || tempStart : draftRange.endDate;
  const [sortedStart, sortedEnd] = useMemo(() => {
    if (!highlightStart || !highlightEnd) return ["", ""];
    return highlightStart <= highlightEnd
      ? [highlightStart, highlightEnd]
      : [highlightEnd, highlightStart];
  }, [highlightStart, highlightEnd]);

  // Trigger label text
  const triggerLabel = useMemo(() => {
    if (activePreset) {
      if (activePreset.key === "today") return `วันนี้ (${formatThaiDate(today)})`;
      if (activePreset.key === "yesterday") return `เมื่อวาน (${formatThaiDate(yesterday)})`;
      if (activePreset.key === "this_month") return `เดือนนี้ (${formatThaiRange(value.startDate, value.endDate)})`;
      if (activePreset.key === "last_month") return `เดือนที่แล้ว (${formatThaiRange(value.startDate, value.endDate)})`;
      return `${activePreset.label} (${formatThaiRange(value.startDate, value.endDate)})`;
    }
    return formatThaiRange(value.startDate, value.endDate);
  }, [activePreset, value.startDate, value.endDate, today, yesterday]);

  const monthNamesThai = [
    { num: 1, name: "ม.ค." },
    { num: 2, name: "ก.พ." },
    { num: 3, name: "มี.ค." },
    { num: 4, name: "เม.ย." },
    { num: 5, name: "พ.ค." },
    { num: 6, name: "มิ.ย." },
    { num: 7, name: "ก.ค." },
    { num: 8, name: "ส.ค." },
    { num: 9, name: "ก.ย." },
    { num: 10, name: "ต.ค." },
    { num: 11, name: "พ.ย." },
    { num: 12, name: "ธ.ค." },
  ];

  const renderMonthGrid = (
    matrix: ReturnType<typeof getCalendarMatrix>,
    isLeft: boolean,
  ) => (
    <div className={styles.monthBlock}>
      <div className={styles.monthTitleMobile}>
        {isLeft
          ? `${String(viewMonth).padStart(2, "0")}/${viewYear}`
          : `${String(rightMonthInfo.month).padStart(2, "0")}/${rightMonthInfo.year}`}
      </div>
      <div className={styles.weekHeader}>
        {WEEKDAYS.map((w) => (
          <span key={w} className={styles.weekday}>
            {w}
          </span>
        ))}
      </div>
      <div className={styles.daysGrid}>
        {matrix.map((cell) => {
          const isCellToday = cell.date === today;
          const isCellDisabled = Boolean(
            (minDate && cell.date < minDate) ||
            (maxDate && cell.date > maxDate),
          );
          const isCellStart = cell.date === sortedStart;
          const isCellEnd = cell.date === sortedEnd;
          const isSingle = isCellStart && isCellEnd;
          const isCellBetween =
            Boolean(sortedStart && sortedEnd) &&
            cell.date > sortedStart &&
            cell.date < sortedEnd;

          let cellClass = styles.dayCell;
          if (!cell.isCurrentMonth) cellClass += ` ${styles.isOutside}`;
          if (isCellDisabled) cellClass += ` ${styles.isFuture}`;
          if (isSingle) {
            cellClass += ` ${styles.isStart} ${styles.isSingleDay}`;
          } else if (isCellStart) {
            cellClass += ` ${styles.isStart}`;
          } else if (isCellEnd) {
            cellClass += ` ${styles.isEnd}`;
          } else if (isCellBetween) {
            cellClass += tempStart ? ` ${styles.hoverRange}` : ` ${styles.inRange}`;
          }

          return (
            <button
              key={cell.date}
              type="button"
              className={cellClass}
              disabled={isCellDisabled}
              onClick={() => handleDayClick(cell.date)}
              onMouseEnter={() => {
                if (tempStart && !isCellDisabled) {
                  setHoverDate(cell.date);
                }
              }}
              title={formatThaiDate(cell.date)}
            >
              <span>{cell.day}</span>
              {isCellToday ? <span className={styles.todayDot} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={`${styles.wrapper} ${className}`.trim()}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.triggerBtn}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
        disabled={disabled}
        onClick={togglePopover}
      >
        <span className={`material-symbols-outlined ${styles.calendarIcon}`}>
          calendar_month
        </span>
        <span className={styles.triggerLabel}>{triggerLabel}</span>
        <span className={`material-symbols-outlined ${styles.chevronIcon}`}>
          expand_more
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className={styles.backdrop}
            onClick={closeAndRestoreFocus}
            aria-hidden="true"
          />
          <div
            id={popoverId}
            className={styles.popover}
            role="dialog"
            aria-label="เลือกช่วงวันที่"
          >
            <header className={styles.mobileHeader}>
              <span aria-hidden="true" className={styles.sheetHandle} />
              <h2>เลือกช่วงวันที่</h2>
              <button
                type="button"
                className={styles.closeBtn}
                aria-label="ปิดตัวเลือกช่วงวันที่"
                onClick={closeAndRestoreFocus}
              >
                <X size={24} />
              </button>
            </header>
            <div className={styles.mainLayout}>
              {/* Presets Sidebar matching date.png */}
              <div ref={presetsRef} className={styles.presetsSidebar}>
                {presets.map((preset) => {
                  const isActive = activePreset?.key === preset.key;
                  const isUnavailable = Boolean(
                    (minDate && preset.range.startDate < minDate) ||
                    (maxDate && preset.range.endDate > maxDate),
                  );
                  return (
                    <button
                      key={preset.key}
                      ref={isActive ? activePresetRef : undefined}
                      type="button"
                      className={`${styles.presetBtn} ${
                        isActive ? styles.activePreset : ""
                      }`}
                      disabled={isUnavailable}
                      onClick={() => handlePresetClick(preset)}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* Calendar Pane */}
              <div className={styles.calendarPane}>
                {viewMode === "days" && (
                  <>
                    {/* Navigation row with << < MM/YYYY MM/YYYY > >> */}
                    <div className={styles.navRow}>
                      <div className={styles.navGroup}>
                        <button
                          type="button"
                          className={`${styles.navBtn} ${styles.yearNavBtn}`}
                          onClick={handlePrevYear}
                          title="ปีก่อนหน้า"
                          aria-label="ปีก่อนหน้า"
                        >
                          <ChevronsLeft size={17} />
                        </button>
                        <button
                          type="button"
                          className={styles.navBtn}
                          onClick={handlePrevMonth}
                          title="เดือนก่อนหน้า"
                          aria-label="เดือนก่อนหน้า"
                        >
                          <ChevronLeft size={20} />
                        </button>
                      </div>

                      <div className={styles.monthsTitleRow}>
                        <div className={styles.monthYearSelector}>
                          <button
                            type="button"
                            className={styles.titleSelectBtn}
                            onClick={() => openMonthPicker("left")}
                            title="คลิกเพื่อเลือกเดือน"
                          >
                            {THAI_MONTHS[viewMonth - 1]}
                          </button>
                          <span aria-hidden="true" className={styles.titleSlash}> </span>
                          <button
                            type="button"
                            className={styles.titleSelectBtn}
                            onClick={() => openYearPicker("left")}
                            title="คลิกเพื่อเลือกปี"
                          >
                            {viewYear + 543}
                          </button>
                        </div>
                        <div className={`${styles.monthYearSelector} ${styles.rightMonthSelector}`}>
                          <button
                            type="button"
                            className={styles.titleSelectBtn}
                            onClick={() => openMonthPicker("right")}
                            title="คลิกเพื่อเลือกเดือน"
                          >
                            {THAI_MONTHS[rightMonthInfo.month - 1]}
                          </button>
                          <span aria-hidden="true" className={styles.titleSlash}> </span>
                          <button
                            type="button"
                            className={styles.titleSelectBtn}
                            onClick={() => openYearPicker("right")}
                            title="คลิกเพื่อเลือกปี"
                          >
                            {rightMonthInfo.year + 543}
                          </button>
                        </div>
                      </div>

                      <div className={styles.navGroup}>
                        <button
                          type="button"
                          className={styles.navBtn}
                          onClick={handleNextMonth}
                          title="เดือนถัดไป"
                          aria-label="เดือนถัดไป"
                        >
                          <ChevronRight size={20} />
                        </button>
                        <button
                          type="button"
                          className={`${styles.navBtn} ${styles.yearNavBtn}`}
                          onClick={handleNextYear}
                          title="ปีถัดไป"
                          aria-label="ปีถัดไป"
                        >
                          <ChevronsRight size={17} />
                        </button>
                      </div>
                    </div>

                    {/* Dual Calendars */}
                    <div className={styles.dualCalendars}>
                      {renderMonthGrid(leftMatrix, true)}
                      {renderMonthGrid(rightMatrix, false)}
                    </div>
                  </>
                )}

                {viewMode === "months" && (
                  <div className={styles.drillView}>
                    <div className={styles.drillNavRow}>
                      <button
                        type="button"
                        className={styles.navBtn}
                        onClick={() =>
                          pickerTarget === "left"
                            ? setViewYear((y) => y - 1)
                            : setViewYear((y) => y - 1)
                        }
                        title="ปีก่อนหน้า"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        type="button"
                        className={styles.drillTitleBtn}
                        onClick={() => openYearPicker(pickerTarget)}
                        title="คลิกเพื่อเลือกปี"
                      >
                        {pickerTarget === "left" ? viewYear : rightMonthInfo.year}
                      </button>
                      <button
                        type="button"
                        className={styles.navBtn}
                        onClick={() =>
                          pickerTarget === "left"
                            ? setViewYear((y) => y + 1)
                            : setViewYear((y) => y + 1)
                        }
                        title="ปีถัดไป"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                    <div className={styles.monthsGrid}>
                      {monthNamesThai.map((m) => {
                        const targetMonth =
                          pickerTarget === "left" ? viewMonth : rightMonthInfo.month;
                        const isCurrent = targetMonth === m.num;
                        return (
                          <button
                            key={m.num}
                            type="button"
                            className={`${styles.drillCell} ${
                              isCurrent ? styles.activeDrillCell : ""
                            }`}
                            onClick={() => handleSelectMonth(m.num)}
                          >
                            <span>{m.name}</span>
                            <small>{String(m.num).padStart(2, "0")}</small>
                          </button>
                        );
                      })}
                    </div>
                    <div className={styles.drillFooter}>
                      <button
                        type="button"
                        className={styles.backToDaysBtn}
                        onClick={() => setViewMode("days")}
                      >
                        กลับไปเลือกวัน
                      </button>
                    </div>
                  </div>
                )}

                {viewMode === "years" && (
                  <div className={styles.drillView}>
                    <div className={styles.drillNavRow}>
                      <button
                        type="button"
                        className={styles.navBtn}
                        onClick={() => setDecadeStart((d) => d - 10)}
                        title="10 ปีก่อนหน้า"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span className={styles.drillTitleText}>
                        {decadeStart} – {decadeStart + 9}
                      </span>
                      <button
                        type="button"
                        className={styles.navBtn}
                        onClick={() => setDecadeStart((d) => d + 10)}
                        title="10 ปีถัดไป"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                    <div className={styles.yearsGrid}>
                      {Array.from({ length: 12 }, (_, i) => decadeStart - 1 + i).map(
                        (yearNum) => {
                          const targetYear =
                            pickerTarget === "left" ? viewYear : rightMonthInfo.year;
                          const isCurrent = targetYear === yearNum;
                          const isOutside =
                            yearNum < decadeStart || yearNum > decadeStart + 9;
                          return (
                            <button
                              key={yearNum}
                              type="button"
                              className={`${styles.drillCell} ${
                                isCurrent ? styles.activeDrillCell : ""
                              } ${isOutside ? styles.isOutside : ""}`}
                              onClick={() => handleSelectYear(yearNum)}
                            >
                              <span>{yearNum}</span>
                              <small>พ.ศ. {yearNum + 543}</small>
                            </button>
                          );
                        },
                      )}
                    </div>
                    <div className={styles.drillFooter}>
                      <button
                        type="button"
                        className={styles.backToDaysBtn}
                        onClick={() => setViewMode("months")}
                      >
                        กลับไปเลือกเดือน
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer with summary & cancel/apply */}
            <div className={styles.footerBar}>
              <div className={styles.selectedRangeSummary}>
                ช่วงที่เลือก:{" "}
                <strong>
                  {formatThaiRange(
                    sortedStart || draftRange.startDate,
                    sortedEnd || draftRange.endDate,
                  )}
                </strong>
              </div>
              <div className={styles.footerActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={closeAndRestoreFocus}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className={styles.applyBtn}
                  onClick={() => {
                    if (sortedStart && sortedEnd) {
                      onChange({ startDate: sortedStart, endDate: sortedEnd });
                    }
                    closeAndRestoreFocus();
                  }}
                >
                  ตกลง
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
