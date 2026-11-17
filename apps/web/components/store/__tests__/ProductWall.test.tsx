import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductDTO } from "@voiceretain/shared";
import { api } from "@/lib/api";
import { ProductWall } from "../ProductWall";

const add = vi.fn();
vi.mock("../CartProvider", () => ({ useCart: () => ({ cart: null, add }) }));
vi.mock("@/lib/api", () => ({ api: { getProducts: vi.fn() } }));

const getProducts = vi.mocked(api.getProducts);

const make = (n: number, category: string): ProductDTO[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${category}-${i}`,
    slug: `dj-${category}-${i}`,
    name: `${category} item ${i + 1}`,
    description: "Nice.",
    pricePaise: 49900 + i * 100,
    imageUrl: "https://cdn.example.com/x.webp",
    category,
  }));

// 20 beauty, 10 laptops, 3 mens-watches
const catalogue = [...make(20, "beauty"), ...make(10, "laptops"), ...make(3, "mens-watches")];

beforeEach(() => {
  add.mockReset();
  getProducts.mockReset().mockResolvedValue(catalogue);
});

const tiles = () => screen.getAllByRole("article");

describe("ProductWall", () => {
  it("shows the first dozen products and how many there are in all", async () => {
    render(<ProductWall />);
    await screen.findAllByRole("article");
    expect(tiles()).toHaveLength(12);
    expect(screen.getByText("Showing 12 of 33")).toBeInTheDocument();
  });

  it("mixes categories in the All view", async () => {
    render(<ProductWall />);
    await screen.findAllByRole("article");
    const names = tiles().map((t) => within(t).getByRole("heading").textContent ?? "");
    expect(names[0]).toMatch(/^beauty/);
    expect(names[1]).toMatch(/^laptops/);
    expect(names[2]).toMatch(/^mens-watches/);
  });

  it("shows more products on request until everything is shown", async () => {
    render(<ProductWall />);
    await screen.findAllByRole("article");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Show 12 more" }));
    expect(tiles()).toHaveLength(24);
    await user.click(screen.getByRole("button", { name: "Show 9 more" }));
    expect(tiles()).toHaveLength(33);
    expect(screen.queryByRole("button", { name: /Show \d+ more/ })).not.toBeInTheDocument();
    expect(screen.getByText("Showing 33 of 33")).toBeInTheDocument();
  });

  it("filters by category and says which one is selected", async () => {
    render(<ProductWall />);
    await screen.findAllByRole("article");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Laptops" }));
    expect(tiles()).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Laptops" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    expect(
      tiles().every((t) => /^laptops/.test(within(t).getByRole("heading").textContent ?? "")),
    ).toBe(true);
  });

  it("goes back to the first page when the category changes", async () => {
    render(<ProductWall />);
    await screen.findAllByRole("article");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Show 12 more" }));
    await user.click(screen.getByRole("button", { name: "Beauty" }));
    expect(tiles()).toHaveLength(12);
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(tiles()).toHaveLength(12);
  });

  it("offers every category as a filter, labelled for people", async () => {
    render(<ProductWall />);
    await screen.findAllByRole("article");
    for (const name of ["All", "Beauty", "Laptops", "Men's watches"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("adds the chosen product to the cart", async () => {
    render(<ProductWall />);
    await screen.findAllByRole("article");
    await userEvent.setup().click(within(tiles()[0]!).getByRole("button", { name: "Add to cart" }));
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ id: "beauty-0" }));
  });

  it("explains a failed load and lets the shopper retry", async () => {
    getProducts.mockRejectedValueOnce(new Error("Can't reach ShopNest right now."));
    render(<ProductWall />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach ShopNest right now.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByRole("article")).toHaveLength(12);
  });

  it("says so when the shelves are empty", async () => {
    getProducts.mockResolvedValueOnce([]);
    render(<ProductWall />);
    expect(await screen.findByText(/no products on the shelves/i)).toBeInTheDocument();
  });
});
