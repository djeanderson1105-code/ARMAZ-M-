import React from "react";

interface PauBrasilLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "horizontal" | "vertical" | "icon-only";
  textColor?: "white" | "dark" | "blue";
}

export default function PauBrasilLogo({
  className = "",
  size = "md",
  variant = "horizontal",
  textColor = "white",
}: PauBrasilLogoProps) {
  // Dimension definitions
  const dimensions = {
    sm: { iconWidth: 28, iconHeight: 28, titleSize: "text-sm", subSize: "text-[7px]" },
    md: { iconWidth: 40, iconHeight: 40, titleSize: "text-lg", subSize: "text-[9px]" },
    lg: { iconWidth: 56, iconHeight: 56, titleSize: "text-2xl", subSize: "text-[11px]" },
    xl: { iconWidth: 80, iconHeight: 80, titleSize: "text-4xl", subSize: "text-[14px]" },
  };

  const currentDim = dimensions[size];

  // Colors based on variant
  const titleColorClass = 
    textColor === "white" 
      ? "text-white" 
      : textColor === "blue" 
        ? "text-blue-700" 
        : "text-slate-900";

  const subColorClass = 
    textColor === "white" 
      ? "text-blue-300" 
      : "text-blue-600 font-semibold";

  // Ambev Blue color scheme
  const ambevBlue = "#103cb5";

  // Pau Brasil Custom SVG Icon (P shape with white PB letters instead of tree)
  const renderSVGIcon = () => (
    <svg
      width={currentDim.iconWidth}
      height={currentDim.iconHeight}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 drop-shadow-md"
    >
      {/* Balloon "P" shape */}
      <path
        d="M80 140C113.137 140 140 113.137 140 80C140 46.8629 113.137 20 80 20C46.8629 20 20 46.8629 20 80C20 98.7188 28.5638 115.437 42 126.5V140H55.5C63.1557 140 71.3283 140 80 140Z"
        fill={ambevBlue}
      />
      {/* PB text monogram instead of tree paths */}
      <text
        x="80"
        y="98"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="55"
        fontWeight="900"
        fill="white"
        textAnchor="middle"
        letterSpacing="-2"
      >
        PB
      </text>
    </svg>
  );

  if (variant === "icon-only") {
    return null;
  }

  if (variant === "vertical") {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <div>
          <div className={`${currentDim.titleSize} tracking-tight font-sans flex items-center justify-center`}>
            <span className="font-light uppercase">PAU</span>
            <span className="font-black uppercase ml-1.5" style={{ color: textColor === "white" ? undefined : ambevBlue }}>BRASIL</span>
          </div>
          <p className={`${currentDim.subSize} uppercase tracking-wider font-mono ${subColorClass} opacity-90`}>
            distribuidora ambev
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="flex flex-col">
        <div className={`${currentDim.titleSize} tracking-tight font-sans leading-tight flex items-center`}>
          <span className="font-light uppercase text-slate-300">PAU</span>
          <span className="font-black uppercase ml-1.5" style={{ color: textColor === "white" ? undefined : ambevBlue }}>BRASIL</span>
        </div>
        <p className={`${currentDim.subSize} uppercase tracking-wider font-mono leading-none mt-0.5 ${subColorClass} opacity-90`}>
          distribuidora ambev
        </p>
      </div>
    </div>
  );
}
