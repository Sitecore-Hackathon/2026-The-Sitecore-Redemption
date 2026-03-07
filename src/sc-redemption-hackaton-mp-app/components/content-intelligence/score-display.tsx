"use client";

import { Badge } from "@/components/ui/badge";
import type { CategoryScore, Grade } from "@/lib/content-intelligence/types";

// ---------------------------------------------------------------------------
// Score ring — SVG circular progress indicator
// ---------------------------------------------------------------------------
interface ScoreRingProps {
  score: number;
  grade: Grade;
}

function getScoreColor(score: number): string {
  if (score >= 75) return "var(--color-success-500)";
  if (score >= 60) return "var(--color-warning-500)";
  return "var(--color-danger-500)";
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Needs Work";
  if (score >= 40) return "Poor";
  return "Critical";
}

function getScoreColorScheme(
  score: number,
): "success" | "warning" | "danger" {
  if (score >= 75) return "success";
  if (score >= 60) return "warning";
  return "danger";
}

export function ScoreRing({ score, grade }: ScoreRingProps) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const color = getScoreColor(score);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex items-center justify-center">
        <svg
          width="140"
          height="140"
          viewBox="0 0 140 140"
          aria-label={`Overall score: ${score} out of 100`}
        >
          {/* Track */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            strokeWidth="10"
            stroke="var(--color-gray-100)"
          />
          {/* Progress arc — starts from top (rotated -90deg) */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            strokeWidth="10"
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 70 70)"
            style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
          />
        </svg>
        <div className="absolute text-center">
          <div
            className="text-4xl font-bold leading-none tabular-nums"
            style={{ color }}
          >
            {score}
          </div>
          <div className="text-xs text-muted-foreground mt-1">/ 100</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge colorScheme={getScoreColorScheme(score)} variant="bold">
          Grade {grade}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {getScoreLabel(score)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category progress bars
// ---------------------------------------------------------------------------
interface CategoryBarsProps {
  categories: CategoryScore[];
}

export function CategoryBars({ categories }: CategoryBarsProps) {
  return (
    <div className="space-y-3">
      {categories.map((cat) => {
        const color = getScoreColor(cat.score);
        const scheme = getScoreColorScheme(cat.score);
        return (
          <div key={cat.category} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-medium truncate">{cat.label}</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  ({cat.weight}%)
                </span>
              </div>
              <Badge colorScheme={scheme} size="sm">
                {cat.score}
              </Badge>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full transition-all duration-700"
                style={{ width: `${cat.score}%`, backgroundColor: color }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{cat.description}</p>
          </div>
        );
      })}
    </div>
  );
}
