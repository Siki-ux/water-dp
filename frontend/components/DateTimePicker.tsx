"use client";

import { useState, useRef, useEffect } from "react";
import {
    format, addMonths, subMonths,
    startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays,
    isSameDay, isSameMonth,
} from "date-fns";
import { Calendar, ChevronLeft, ChevronRight, Clock } from "lucide-react";

interface Props {
    value: string;           // "YYYY-MM-DDTHH:mm"
    onChange: (v: string) => void;
    className?: string;
}

function toDate(v: string): Date {
    if (!v) return new Date();
    const d = new Date(v);
    return isNaN(d.getTime()) ? new Date() : d;
}

function toLocalString(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const MINUTES = [0, 15, 30, 45];
const DAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function DateTimePicker({ value, onChange, className }: Props) {
    const [dateOpen, setDateOpen] = useState(false);
    const [timeOpen, setTimeOpen] = useState(false);
    const [viewMonth, setViewMonth] = useState<Date>(() => toDate(value));
    const containerRef = useRef<HTMLDivElement>(null);
    const hourListRef = useRef<HTMLDivElement>(null);

    const current = toDate(value);
    const curHour = current.getHours();
    const curMinute = current.getMinutes();
    const nearestQ = Math.round(curMinute / 15) * 15 % 60;

    // Close both panels on outside click
    useEffect(() => {
        if (!dateOpen && !timeOpen) return;
        function handle(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setDateOpen(false);
                setTimeOpen(false);
            }
        }
        document.addEventListener("mousedown", handle);
        return () => document.removeEventListener("mousedown", handle);
    }, [dateOpen, timeOpen]);

    // Scroll selected hour into view when time panel opens
    useEffect(() => {
        if (!timeOpen || !hourListRef.current) return;
        const el = hourListRef.current.querySelector<HTMLElement>("[data-selected='true']");
        el?.scrollIntoView({ block: "center", behavior: "instant" });
    }, [timeOpen]);

    // Calendar grid
    const calStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const calEnd = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    const weeks: Date[][] = [];
    let day = calStart;
    while (day <= calEnd) {
        const week: Date[] = [];
        for (let i = 0; i < 7; i++) { week.push(day); day = addDays(day, 1); }
        weeks.push(week);
    }

    function pickDay(d: Date) {
        const next = new Date(d);
        next.setHours(curHour, nearestQ, 0, 0);
        onChange(toLocalString(next));
        // keep calendar open so user can confirm visually, close on outside click
    }

    function pickHour(h: number) {
        const next = toDate(value);
        next.setHours(h, nearestQ, 0, 0);
        onChange(toLocalString(next));
    }

    function pickMinute(m: number) {
        const next = toDate(value);
        next.setMinutes(m, 0, 0);
        onChange(toLocalString(next));
    }

    function toggleDate() {
        setTimeOpen(false);
        setViewMonth(toDate(value));
        setDateOpen(v => !v);
    }

    function toggleTime() {
        setDateOpen(false);
        setTimeOpen(v => !v);
    }

    const dateLabel = value ? format(current, "MM/dd/yyyy") : "Date";
    const timeLabel = value ? format(current, "HH:mm") : "Time";

    return (
        <div ref={containerRef} className={`relative inline-flex ${className ?? ""}`}>

            {/* ── Trigger: two separate segments ── */}
            <div className="flex items-center bg-white/5 border border-white/10 rounded overflow-hidden text-xs text-white">

                {/* Date segment */}
                <button
                    type="button"
                    onClick={toggleDate}
                    className={`flex items-center gap-1.5 px-2 py-1 transition-colors
                        ${dateOpen ? "bg-hydro-primary/20 text-white" : "hover:bg-white/10 text-white/80"}`}
                >
                    <Calendar className="w-3 h-3 shrink-0 text-white/50" />
                    <span className="whitespace-nowrap">{dateLabel}</span>
                </button>

                {/* Divider */}
                <div className="w-px h-4 bg-white/15" />

                {/* Time segment */}
                <button
                    type="button"
                    onClick={toggleTime}
                    className={`flex items-center gap-1.5 px-2 py-1 transition-colors
                        ${timeOpen ? "bg-hydro-primary/20 text-white" : "hover:bg-white/10 text-white/80"}`}
                >
                    <Clock className="w-3 h-3 shrink-0 text-white/50" />
                    <span className="whitespace-nowrap">{timeLabel}</span>
                </button>
            </div>

            {/* ── Date popover ── */}
            {dateOpen && (
                <div className="absolute z-50 top-full mt-1 left-0
                                bg-[#161b28] border border-white/10 rounded-xl shadow-2xl p-3 w-[208px]">

                    {/* Month nav */}
                    <div className="flex items-center justify-between mb-2">
                        <button type="button"
                            onClick={() => setViewMonth(subMonths(viewMonth, 1))}
                            className="p-0.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                            <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-white text-xs font-semibold">
                            {format(viewMonth, "MMMM yyyy")}
                        </span>
                        <button type="button"
                            onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                            className="p-0.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 mb-0.5">
                        {DAY_HEADERS.map(h => (
                            <div key={h} className="text-center text-[9px] text-white/25 py-0.5">{h}</div>
                        ))}
                    </div>

                    {/* Day cells */}
                    {weeks.map((week, wi) => (
                        <div key={wi} className="grid grid-cols-7">
                            {week.map((d, di) => {
                                const sel = isSameDay(d, current);
                                const inMonth = isSameMonth(d, viewMonth);
                                const today = isSameDay(d, new Date());
                                return (
                                    <button key={di} type="button"
                                        onClick={() => pickDay(d)}
                                        className={`text-center text-[11px] py-[3px] rounded transition-colors
                                            ${sel
                                                ? "bg-hydro-primary text-white font-semibold"
                                                : today
                                                ? "ring-1 ring-inset ring-hydro-primary/60 text-white"
                                                : inMonth
                                                ? "text-white/75 hover:bg-white/10"
                                                : "text-white/20 hover:bg-white/5"
                                            }`}>
                                        {format(d, "d")}
                                    </button>
                                );
                            })}
                        </div>
                    ))}

                    <div className="mt-2 flex justify-between items-center">
                        <button type="button"
                            onClick={() => { const t = new Date(); t.setSeconds(0, 0); onChange(toLocalString(t)); setViewMonth(t); }}
                            className="text-[10px] text-white/40 hover:text-hydro-secondary transition-colors">
                            Today
                        </button>
                        <button type="button"
                            onClick={() => setDateOpen(false)}
                            className="text-[10px] text-hydro-secondary hover:text-white transition-colors">
                            Done
                        </button>
                    </div>
                </div>
            )}

            {/* ── Time popover ── */}
            {timeOpen && (
                <div className="absolute z-50 top-full mt-1 right-0
                                bg-[#161b28] border border-white/10 rounded-xl shadow-2xl p-3 flex gap-2">

                    {/* Hours */}
                    <div className="flex flex-col items-center">
                        <div className="text-[9px] text-white/30 mb-1.5">HH</div>
                        <div ref={hourListRef}
                            className="h-[160px] overflow-y-auto flex flex-col gap-[1px] pr-0.5
                                       [&::-webkit-scrollbar]:w-[3px]
                                       [&::-webkit-scrollbar-track]:bg-transparent
                                       [&::-webkit-scrollbar-thumb]:bg-white/15
                                       [&::-webkit-scrollbar-thumb]:rounded-full">
                            {Array.from({ length: 24 }, (_, h) => (
                                <button key={h} type="button"
                                    data-selected={h === curHour ? "true" : undefined}
                                    onClick={() => pickHour(h)}
                                    className={`text-[11px] px-3 py-[3px] rounded transition-colors text-center leading-none
                                        ${h === curHour
                                            ? "bg-hydro-primary text-white font-semibold"
                                            : "text-white/65 hover:bg-white/10 hover:text-white"
                                        }`}>
                                    {String(h).padStart(2, "0")}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Separator */}
                    <div className="w-px bg-white/10 my-1" />

                    {/* Minutes */}
                    <div className="flex flex-col items-center">
                        <div className="text-[9px] text-white/30 mb-1.5">MM</div>
                        <div className="flex flex-col gap-[1px]">
                            {MINUTES.map(m => (
                                <button key={m} type="button"
                                    onClick={() => pickMinute(m)}
                                    className={`text-[11px] px-3 py-[3px] rounded transition-colors text-center leading-none
                                        ${m === nearestQ
                                            ? "bg-hydro-primary text-white font-semibold"
                                            : "text-white/65 hover:bg-white/10 hover:text-white"
                                        }`}>
                                    {String(m).padStart(2, "0")}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
