import { useLayoutEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const slideDuration = 180;

function selectedPosition(navigation: HTMLElement) {
  const selected = navigation.querySelector<HTMLElement>(':scope > [aria-current="page"]');
  return selected ? { x: selected.offsetLeft, width: selected.offsetWidth, opacity: 1 }
    : { x: 0, width: 0, opacity: 0 };
}

// Enhance the existing links and buttons so each page retains its navigation and routing.
export function SlideTabs({ navigation }: { navigation: HTMLElement }) {
  const [cursor, setCursor] = useState(() => ({ position: selectedPosition(navigation), sliding: false }));
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    function update(sliding: boolean) {
      const next = selectedPosition(navigation);
      setCursor(previous => previous.position.x === next.x && previous.position.width === next.width &&
        previous.position.opacity === next.opacity ? previous : { position: next, sliding });
    }

    function selectLink(event: MouseEvent) {
      if (reducedMotion || event.defaultPrevented || event.button !== 0 ||
          event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (link?.parentElement !== navigation || link.target || link.hasAttribute("download")) return;
      const current = window.location;
      const target = new URL(link.href);
      if (target.origin !== current.origin) return;
      const tabs = Array.from(navigation.querySelectorAll(':scope > :is(a,button)'));
      const from = tabs.findIndex(tab => tab.getAttribute("aria-current") === "page");
      const to = tabs.indexOf(link);
      if (from < 0 || from === to) return;
      const changesDocument = target.pathname !== current.pathname || target.search !== current.search;
      document.dispatchEvent(new CustomEvent("guidetabactivate", {
        detail: {href:target.href, from, to, changesDocument},
      }));
    }

    const selection = new MutationObserver(() => update(true));
    const dimensions = new ResizeObserver(() => update(false));
    selection.observe(navigation, { subtree: true, attributeFilter: ["aria-current"] });
    dimensions.observe(navigation);
    navigation.addEventListener("click", selectLink);
    navigation.classList.add("slide-tabs-ready");
    update(false);

    return () => {
      selection.disconnect();
      dimensions.disconnect();
      navigation.removeEventListener("click", selectLink);
      navigation.classList.remove("slide-tabs-ready");
    };
  }, [navigation, reducedMotion]);

  return <motion.div
    className="slide-tabs-cursor"
    initial={false}
    animate={cursor.position}
    transition={{ duration: cursor.sliding && !reducedMotion ? slideDuration / 1000 : 0, ease: [0.2, 0.75, 0.25, 1] }}
  />;
}
