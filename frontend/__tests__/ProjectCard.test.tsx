import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectCard } from "@/components/ProjectCard";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock i18n
vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "projects.sensorsLinked": "sensors linked",
        "projects.openProject": "Open Project",
      };
      return translations[key] || key;
    },
  }),
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  ArrowRight: () => <span data-testid="arrow-icon" />,
  Folder: () => <span data-testid="folder-icon" />,
}));

describe("ProjectCard", () => {
  const defaultProps = {
    id: "project-123",
    name: "Water Quality Monitoring",
    description: "Monitors water quality across Czech rivers",
    role: "owner",
    sensorCount: 15,
  };

  it("renders project name", () => {
    render(<ProjectCard {...defaultProps} />);
    expect(screen.getByText("Water Quality Monitoring")).toBeDefined();
  });

  it("renders project description", () => {
    render(<ProjectCard {...defaultProps} />);
    expect(screen.getByText("Monitors water quality across Czech rivers")).toBeDefined();
  });

  it("renders role badge", () => {
    render(<ProjectCard {...defaultProps} />);
    expect(screen.getByText("owner")).toBeDefined();
  });

  it("renders sensor count", () => {
    render(<ProjectCard {...defaultProps} />);
    expect(screen.getByText("15 sensors linked")).toBeDefined();
  });

  it("renders zero sensor count", () => {
    render(<ProjectCard {...defaultProps} sensorCount={0} />);
    expect(screen.getByText("0 sensors linked")).toBeDefined();
  });

  it("links to the project page", () => {
    render(<ProjectCard {...defaultProps} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/projects/project-123");
  });

  it("renders open project text", () => {
    render(<ProjectCard {...defaultProps} />);
    expect(screen.getByText("Open Project")).toBeDefined();
  });

  it("renders different roles", () => {
    render(<ProjectCard {...defaultProps} role="viewer" />);
    expect(screen.getByText("viewer")).toBeDefined();
  });

  it("handles large sensor counts", () => {
    render(<ProjectCard {...defaultProps} sensorCount={9999} />);
    expect(screen.getByText("9999 sensors linked")).toBeDefined();
  });
});
