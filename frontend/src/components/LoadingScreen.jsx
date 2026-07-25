import React from "react";
import "./LoadingScreen.css";

export default function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-logo">E</div>
      <div className="loading-bar">
        <div className="loading-bar-inner" />
      </div>
      <p className="loading-text">English Exam Lab</p>
    </div>
  );
}
