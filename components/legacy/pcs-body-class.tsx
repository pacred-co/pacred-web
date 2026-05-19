"use client";

import { useEffect } from "react";

/**
 * Applies the legacy PCS Cargo `<body>` classes + data-attributes that the
 * "Modern Admin" Bootstrap-4 theme CSS/JS target — a 1:1 transcription of
 * `member/include/header-theme.php` L3-8:
 *
 *   <body class="vertical-layout vertical-menu-modern 2-columns fixed-navbar"
 *         data-open="click" data-menu="vertical-menu-modern" data-col="2-columns">
 *
 * Next.js owns `<body>` in the root layout, so the classes can't be set in
 * JSX for one route group only — this client component sets them on mount and
 * removes them on unmount, so non-(protected) routes (marketing, admin) keep
 * their own body. `pcs-legacy-body` is a Pacred marker for scoped overrides.
 */
const BODY_CLASSES = [
  "vertical-layout",
  "vertical-menu-modern",
  "2-columns",
  "fixed-navbar",
  "pcs-legacy-body",
];

export function PcsBodyClass() {
  useEffect(() => {
    const body = document.body;
    body.classList.add(...BODY_CLASSES);
    body.dataset.open = "click";
    body.dataset.menu = "vertical-menu-modern";
    body.dataset.col = "2-columns";
    return () => {
      body.classList.remove(...BODY_CLASSES);
    };
  }, []);

  return null;
}
