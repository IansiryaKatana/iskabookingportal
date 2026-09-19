import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ReportTableColumn<T> = {
  id: string;
  header: string;
  className?: string;
  headClassName?: string;
  cell: (row: T) => ReactNode;
};

type ReportDataTableProps<T> = {
  rows: T[];
  columns: ReportTableColumn<T>[];
  getRowId: (row: T) => string;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  /** When false, hides checkbox multi-select (summary tables). Default true. */
  selectable?: boolean;
  emptyMessage?: string;
  selectionActions?: ReactNode;
};

export function ReportDataTable<T>({
  rows,
  columns,
  getRowId,
  selectedIds,
  onSelectedIdsChange,
  selectable = true,
  emptyMessage = "No records to display.",
  selectionActions,
}: ReportDataTableProps<T>) {
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleSelectAll = (checked: boolean | "indeterminate") => {
    if (checked === true) {
      onSelectedIdsChange(rows.map(getRowId));
    } else {
      onSelectedIdsChange([]);
    }
  };

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectedIdsChange(selectedIds.filter((selected) => selected !== id));
    } else {
      onSelectedIdsChange([...selectedIds, id]);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selectable && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/40 px-4 py-3">
          <Badge variant="secondary" className="uppercase tracking-wide">
            {selectedIds.length} selected
          </Badge>
          <div className="flex-1" />
          {selectionActions}
        </div>
      )}

      <div className="rounded-2xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent bg-muted/40">
              {selectable && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all rows"
                  />
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={`uppercase tracking-wide text-xs ${column.headClassName ?? ""}`}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const id = getRowId(row);
              const isSelected = selectedIds.includes(id);
              return (
                <TableRow key={id} data-state={isSelected ? "selected" : undefined}>
                  {selectable && (
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(id)}
                        aria-label={`Select row ${id}`}
                      />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell key={column.id} className={column.className}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
