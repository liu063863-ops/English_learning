import React from "react";
import "./SkeletonCard.css";

export default function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-label="正在加载" role="status">
      <div className="skeleton-header" />
      <div className="skeleton-line" />
      <div className="skeleton-line short" />
    </div>
  );
}
