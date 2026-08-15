import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Pagination } from "../pagination";

describe("Pagination", () => {
  it("computes the showing range, total, and page count from total/page/pageSize", () => {
    const { container } = render(
      <Pagination itemLabel="rows" total={95} page={2} pageSize={10} buildHref={(p) => `/x?page=${p}`} />,
    );
    const text = container.querySelector("p")!.textContent;
    expect(text).toContain("11");
    expect(text).toContain("20");
    expect(text).toContain("95");
    expect(text).toContain("page 2 of 10");
  });

  it("clamps the end of the range to total on the last, partial page", () => {
    const { container } = render(
      <Pagination itemLabel="rows" total={95} page={10} pageSize={10} buildHref={(p) => `/x?page=${p}`} />,
    );
    // Page 10 of 10 covers rows 91-95, not 91-100.
    const text = container.querySelector("p")!.textContent;
    expect(text).toContain("91");
    expect(text).toContain("95");
    expect(text).not.toContain("100");
  });

  it("shows a 0-0 of 0 range and clamps total pages to 1 when there are no items", () => {
    const { container } = render(
      <Pagination itemLabel="rows" total={0} page={1} pageSize={10} buildHref={(p) => `/x?page=${p}`} />,
    );
    const text = container.querySelector("p")!.textContent;
    expect(text).toContain("0–0 of 0");
    expect(text).toContain("page 1 of 1");
  });

  it("disables Previous on the first page and enables Next", () => {
    render(<Pagination itemLabel="rows" total={95} page={1} pageSize={10} buildHref={(p) => `/x?page=${p}`} />);
    expect(screen.getByText("Previous").closest("a")).toBeNull();
    expect(screen.getByText("Next").closest("a")).not.toBeNull();
  });

  it("disables Next on the last page and enables Previous", () => {
    render(<Pagination itemLabel="rows" total={95} page={10} pageSize={10} buildHref={(p) => `/x?page=${p}`} />);
    expect(screen.getByText("Next").closest("a")).toBeNull();
    expect(screen.getByText("Previous").closest("a")).not.toBeNull();
  });

  it("enables both Previous and Next on a middle page, using buildHref for each target", () => {
    const buildHref = vi.fn((p: number) => `/x?page=${p}`);
    render(<Pagination itemLabel="rows" total={95} page={5} pageSize={10} buildHref={buildHref} />);

    const prev = screen.getByText("Previous").closest("a");
    const next = screen.getByText("Next").closest("a");
    expect(prev?.getAttribute("href")).toBe("/x?page=4");
    expect(next?.getAttribute("href")).toBe("/x?page=6");
    expect(buildHref).toHaveBeenCalledWith(4);
    expect(buildHref).toHaveBeenCalledWith(6);
  });
});
