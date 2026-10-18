import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable, type Column } from "./Table";

type Row = { id: string; name: string };
const columns: Column<Row>[] = [
  { id: "name", header: "Name", cell: row => row.name },
  { id: "open", header: "Open", width: "84px", cell: () => <button type="button">Open</button> }
];
const rows: Row[] = [{ id: "1", name: "A very long customer name and route that should truncate" }];

describe("DataTable layout", () => {
  it("uses the browser's automatic layout by default", () => {
    render(<DataTable rows={rows} columns={columns} keyOf={row => row.id} caption="Rows" mobileRow={row => row.name} />);
    expect(screen.getByRole("table")).not.toHaveClass("table-fixed");
  });

  it("fixes column widths on request so trailing columns stay in the panel", () => {
    render(<DataTable rows={rows} columns={columns} keyOf={row => row.id} caption="Rows" mobileRow={row => row.name} layout="fixed" minWidth={900} />);
    const table = screen.getByRole("table");
    expect(table).toHaveClass("table-fixed");
    expect(table).toHaveStyle({ minWidth: "900px" });
    expect(screen.getByRole("columnheader", { name: "Open" })).toHaveStyle({ width: "84px" });
  });
});
