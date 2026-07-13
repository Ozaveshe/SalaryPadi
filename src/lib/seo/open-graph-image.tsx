/* eslint-disable @next/next/no-img-element -- ImageResponse requires a plain img for the canonical local SVG asset. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import {
  OPEN_GRAPH_IMAGE_SIZE,
  type OpenGraphFactTone,
  type OpenGraphImageModel,
} from "./open-graph";

const colors = {
  forest950: "#102f28",
  forest900: "#173b32",
  forest700: "#146b55",
  forest100: "#dcece5",
  coral600: "#c65332",
  gold100: "#f8e8aa",
  gold400: "#eec75f",
  sand50: "#fffaf2",
} as const;

const logoDataUrlPromise = readFile(
  join(process.cwd(), "public", "brand", "salarypadi-logo-dark.svg"),
  "base64",
).then((data) => `data:image/svg+xml;base64,${data}`);

function factColors(tone: OpenGraphFactTone | undefined) {
  switch (tone) {
    case "positive":
      return { border: colors.forest700, value: colors.forest100 };
    case "warning":
      return { border: colors.coral600, value: colors.sand50 };
    case "accent":
      return { border: colors.gold400, value: colors.gold100 };
    default:
      return { border: "#ffffff33", value: colors.sand50 };
  }
}

function titleFontSize(title: string) {
  if (title.length > 84) return 50;
  if (title.length > 58) return 56;
  if (title.length > 36) return 64;
  return 72;
}

export async function renderOpenGraphImage(model: OpenGraphImageModel) {
  const logoDataUrl = await logoDataUrlPromise;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: "64px 72px 54px",
        backgroundImage: `linear-gradient(135deg, ${colors.forest900} 0%, ${colors.forest950} 72%)`,
        color: colors.sand50,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 520,
          height: 520,
          borderRadius: 520,
          right: -170,
          top: -240,
          display: "flex",
          backgroundImage: `radial-gradient(circle, ${colors.forest700}99 0%, ${colors.forest700}00 68%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 70,
          bottom: 52,
          display: "flex",
          alignItems: "flex-end",
          opacity: 0.88,
        }}
      >
        {[54, 92, 136, 188].map((height, index) => (
          <div
            key={height}
            style={{
              width: 28,
              height,
              borderRadius: 8,
              marginLeft: index === 0 ? 0 : 18,
              display: "flex",
              backgroundColor:
                index === 2
                  ? colors.coral600
                  : index === 3
                    ? colors.gold400
                    : colors.forest700,
            }}
          />
        ))}
      </div>
      <div
        style={{
          height: 68,
          display: "flex",
          alignItems: "center",
          position: "relative",
        }}
      >
        <img
          alt="SalaryPadi"
          src={logoDataUrl}
          width={295}
          height={60}
          style={{ objectFit: "contain" }}
        />
      </div>
      <div
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: 900,
          paddingBottom: model.facts.length > 0 ? 18 : 46,
        }}
      >
        <div
          style={{
            display: "flex",
            color: colors.gold400,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 3.2,
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          {model.eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: titleFontSize(model.title),
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: -1.6,
            maxWidth: 880,
          }}
        >
          {model.title}
        </div>
        {model.subtitle ? (
          <div
            style={{
              display: "flex",
              color: colors.forest100,
              fontSize: 30,
              fontWeight: 600,
              lineHeight: 1.25,
              marginTop: 18,
            }}
          >
            {model.subtitle}
          </div>
        ) : null}
        {model.facts.length > 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              marginTop: 30,
            }}
          >
            {model.facts.slice(0, 2).map((fact, index) => {
              const tone = factColors(fact.tone);
              return (
                <div
                  key={`${fact.label}-${fact.value}`}
                  style={{
                    minWidth: index === 0 ? 260 : 220,
                    maxWidth: 430,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    padding: "14px 20px 15px",
                    marginLeft: index === 0 ? 0 : 16,
                    border: `2px solid ${tone.border}`,
                    borderRadius: 14,
                    backgroundColor: "#102f28aa",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      color: colors.forest100,
                      fontSize: 15,
                      fontWeight: 700,
                      letterSpacing: 1.4,
                      textTransform: "uppercase",
                    }}
                  >
                    {fact.label}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      color: tone.value,
                      fontSize: fact.value.length > 30 ? 22 : 27,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      marginTop: 7,
                    }}
                  >
                    {fact.value}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          paddingRight: 300,
          color: colors.gold100,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 0.8,
        }}
      >
        <div style={{ display: "flex" }}>salarypadi.com</div>
        <div style={{ display: "flex", color: colors.forest100 }}>
          Jobs and salary truth for Africans
        </div>
      </div>
    </div>,
    OPEN_GRAPH_IMAGE_SIZE,
  );
}

export function fallbackOpenGraphModel(
  eyebrow: string,
  title: string,
): OpenGraphImageModel {
  return { eyebrow, title, facts: [] };
}
