"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { format } from "date-fns";
import { ArrowUpDown } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface Column<T> {
    header: string;
    accessorKey: keyof T;
    cell?: (item: T) => React.ReactNode;
    sortable?: boolean;
}

interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    onLoadMore: () => void;
    hasMore: boolean;
    isLoading: boolean;
    onSort?: (key: keyof T, direction: "asc" | "desc") => void;
    sortKey?: keyof T;
    sortDirection?: "asc" | "desc";
}

export function DataTable<T extends { id: string | number }>({
    columns,
    data,
    onLoadMore,
    hasMore,
    isLoading,
    onSort,
    sortKey,
    sortDirection,
}: DataTableProps<T>) {
    const parentRef = useRef<HTMLDivElement>(null);

    // Virtualizer instance
    const rowVirtualizer = useVirtualizer({
        count: hasMore ? data.length + 1 : data.length, // Add 1 for "Loading/End" row
        getScrollElement: () => parentRef.current,
        estimateSize: () => 50, // Approx row height
        overscan: 5,
    });

    const virtualItems = rowVirtualizer.getVirtualItems();

    // Infinite scroll trigger
    useEffect(() => {
        const [lastItem] = [...virtualItems].reverse();

        if (!lastItem) return;

        if (
            lastItem.index >= data.length - 1 &&
            hasMore &&
            !isLoading
        ) {
            onLoadMore();
        }
    }, [
        hasMore,
        isLoading,
        onLoadMore,
        virtualItems,
        data.length,
    ]);

    const handleSort = (key: keyof T) => {
        if (!onSort) return;
        const direction = sortKey === key && sortDirection === "desc" ? "asc" : "desc";
        onSort(key, direction);
    };

    return (
        <div ref={parentRef} className="w-full h-full overflow-auto rounded-lg border border-border bg-card">
            <div className="w-full relative">
                {/* Sticky Header */}
                <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-md shadow-sm border-b border-border">
                    <table className="w-full text-left text-sm text-[var(--foreground)]/70 table-fixed">
                        <thead className="uppercase text-[var(--foreground)]/90">
                            <tr>
                                {columns.map((col, i) => (
                                    <th
                                        key={String(col.accessorKey)}
                                        className={`px-6 py-3 bg-muted/50 ${col.sortable ? "cursor-pointer hover:text-[var(--foreground)]" : ""}`}
                                        onClick={() => col.sortable && handleSort(col.accessorKey)}
                                        style={{ width: `${100 / columns.length}%` }} // Equal width for simplicity
                                    >
                                        <div className="flex items-center gap-2">
                                            {col.header}
                                            {col.sortable && (
                                                <ArrowUpDown className={`w-3 h-3 ${sortKey === col.accessorKey ? "text-hydro-primary" : "opacity-30"}`} />
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                    </table>
                </div>

                {/* Virtual Rows */}
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    <table className="w-full text-left text-sm text-[var(--foreground)]/80 table-fixed absolute top-0 left-0" style={{ transform: `translateY(${virtualItems[0]?.start ?? 0}px)` }}>
                        <tbody className="divide-y divide-border">
                            {virtualItems.map((virtualRow) => {
                                const isLoaderRow = virtualRow.index > data.length - 1;
                                const item = data[virtualRow.index];

                                if (isLoaderRow) {
                                    return (
                                        <tr key="loader" ref={rowVirtualizer.measureElement} data-index={virtualRow.index}>
                                            <td colSpan={columns.length} className="px-6 py-4 text-center">
                                                {isLoading ? (
                                                    <span className="text-hydro-primary animate-pulse text-xs">Loading more...</span>
                                                ) : hasMore ? (
                                                    <span className="text-[var(--foreground)]/60 text-xs">Load more</span>
                                                ) : (
                                                    <span className="text-[var(--foreground)]/60 text-xs">End of history</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                }

                                return (
                                    <tr
                                        key={item.id}
                                        data-index={virtualRow.index}
                                        ref={rowVirtualizer.measureElement}
                                        className="hover:bg-muted/50 transition-colors h-[50px]"
                                    >
                                        {columns.map((col) => (
                                            <td key={String(col.accessorKey)} className="px-6 py-4 whitespace-nowrap overflow-hidden text-ellipsis font-mono text-xs">
                                                {col.cell ? col.cell(item) : String(item[col.accessorKey])}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>

                    </table>
                </div>
            </div>
        </div>
    );
}
