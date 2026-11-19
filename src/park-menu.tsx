import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MenuVertical } from "./components/ui/menu-vertical";

const map = { label: "Карта парка", href: "#geo/1" };
const animals = { label: "Животные", href: "#animals" };
const visitor = { label: "Для посетителей", href: "#visitor" };
const beforeVisit = [
  { label: "Купить билеты", href: "https://animal-park.by/tickets/stranicza-biletov.html?clear_date=1" },
  { label: "Как доехать", href: "#directions" },
  { label: "Экскурсии", href: "#tours" }, map, animals, visitor,
];
const duringVisit = [map, { label: "Кормления", href: "#feed" }, animals, visitor];

function ParkMenu() {
  const [inside, setInside] = useState(() => {
    try { return localStorage.getItem("park-visit-mode") === "inside"; }
    catch { return false; }
  });
  function chooseMode(value: boolean) {
    setInside(value);
    try { localStorage.setItem("park-visit-mode", value ? "inside" : "before"); }
    catch { /* The selected mode still works for this visit. */ }
  }
  return <>
    <div className="modes" role="group" aria-label="Режим посещения">
      <button id="beforeVisit" aria-pressed={!inside} onClick={() => chooseMode(false)}>До визита</button>
      <button id="duringVisit" aria-pressed={inside} onClick={() => chooseMode(true)}>Я в парке</button>
    </div>
    <MenuVertical menuItems={inside ? duringVisit : beforeVisit} color="var(--zk-cta)" />
  </>;
}

const host = document.getElementById("parkMenu");
if (host) createRoot(host).render(<ParkMenu />);
