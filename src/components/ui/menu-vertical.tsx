"use client";

import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import "./menu-vertical.css";

type MenuItem = { label: string; href: string };

interface MenuVerticalProps {
  menuItems: MenuItem[];
  color?: string;
  skew?: number;
}

const MenuLink = motion.create(Link);

export function MenuVertical({ menuItems, color = "#ff6900", skew = 0 }: MenuVerticalProps) {
  const reduce = useReducedMotion();
  const transition = { duration: reduce ? 0 : 0.25, ease: "easeOut" as const };
  return (
    <nav className="menu-vertical" aria-label="Меню парка">
      {menuItems.map(({ label, href }) => {
        const local = href.startsWith("#");
        return (
          <MenuLink key={href} href={href} prefetch={false} data-go={local ? href.slice(1) : undefined}
            target={local ? undefined : "_blank"} rel={local ? undefined : "noopener noreferrer"}
            initial="rest" animate="rest" whileHover="active" whileFocus="active" whileTap="active"
            className="menu-vertical-link">
            <motion.span aria-hidden="true" className="menu-vertical-arrow"
              style={{ color }} transition={transition}
              variants={{ rest: { opacity: 0, x: reduce ? 0 : -12 }, active: { opacity: 1, x: 0 } }}>
              <ArrowRight strokeWidth={2.7} />
            </motion.span>
            <motion.span className="menu-vertical-label" transition={transition}
              variants={{ rest: { x: 0, color: "var(--ink)", skewX: 0 },
                active: { x: 32, color, skewX: reduce ? 0 : skew } }}>
              {label}
            </motion.span>
          </MenuLink>
        );
      })}
    </nav>
  );
}
