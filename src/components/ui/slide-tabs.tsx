import { useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const slideDuration = 180;

function selectedPosition(navigation: HTMLElement) {
  const selected = navigation.querySelector<HTMLElement>(':scope > [data-slide-target]') ??
    navigation.querySelector<HTMLElement>(':scope > [aria-current="page"]');
  return selected ? { x: selected.offsetLeft, width: selected.offsetWidth, opacity: 1 }
    : { x: 0, width: 0, opacity: 0 };
}

// Enhance the existing links and buttons so each page retains its navigation and routing.
export function SlideTabs({ navigation }: { navigation: HTMLElement }) {
  const [cursor, setCursor] = useState(() => ({ position: selectedPosition(navigation), sliding: false }));
  const finishSlide = useRef<(x: number) => void>();
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    let pending: HTMLAnchorElement | undefined;
    let departure: number | undefined;

    function update(sliding: boolean) {
      const next = selectedPosition(navigation);
      setCursor(previous => previous.position.x === next.x && previous.position.width === next.width &&
        previous.position.opacity === next.opacity ? previous : { position: next, sliding });
    }

    function resetDeparture() {
      window.clearTimeout(departure);
      pending?.removeAttribute("data-slide-target");
      navigation.removeAttribute("data-slide-pending");
      pending = undefined;
      finishSlide.current = undefined;
    }

    function selectLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 ||
          event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (link?.parentElement !== navigation) return;
      const target = new URL(link.href);
      const current = window.location;
      const changesDocument = target.origin === current.origin &&
        (target.pathname !== current.pathname || target.search !== current.search);

      resetDeparture();
      if (!changesDocument || link.target || link.hasAttribute("download") || reducedMotion) {
        update(true);
        return;
      }
      event.preventDefault();
      pending = link;
      navigation.setAttribute("data-slide-pending", "");
      link.setAttribute("data-slide-target", "");
      function followLink() {
        window.clearTimeout(departure);
        finishSlide.current = undefined;
        window.location.assign(target.href);
      }
      finishSlide.current = x => {
        if (x === link.offsetLeft) followLink();
      };
      // Keep navigation available even if the browser suspends animation frames.
      departure = window.setTimeout(followLink, slideDuration * 2);
      update(true);
    }

    function restoreSelection() {
      resetDeparture();
      update(false);
    }

    const selection = new MutationObserver(() => update(true));
    const dimensions = new ResizeObserver(() => update(false));
    selection.observe(navigation, { subtree: true, attributeFilter: ["aria-current"] });
    dimensions.observe(navigation);
    navigation.addEventListener("click", selectLink);
    window.addEventListener("pagehide", resetDeparture);
    window.addEventListener("pageshow", restoreSelection);
    window.addEventListener("popstate", restoreSelection);
    navigation.classList.add("slide-tabs-ready");
    update(false);

    return () => {
      selection.disconnect();
      dimensions.disconnect();
      navigation.removeEventListener("click", selectLink);
      window.removeEventListener("pagehide", resetDeparture);
      window.removeEventListener("pageshow", restoreSelection);
      window.removeEventListener("popstate", restoreSelection);
      resetDeparture();
      navigation.classList.remove("slide-tabs-ready");
    };
  }, [navigation, reducedMotion]);

  return <motion.div
    className="slide-tabs-cursor"
    initial={false}
    animate={cursor.position}
    onAnimationComplete={finished => {
      if (typeof finished === "object" && "x" in finished && typeof finished.x === "number") {
        finishSlide.current?.(finished.x);
      }
    }}
    transition={{ duration: cursor.sliding && !reducedMotion ? slideDuration / 1000 : 0, ease: [0.2, 0.75, 0.25, 1] }}
  />;
}
