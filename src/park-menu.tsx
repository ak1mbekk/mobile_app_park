import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight } from "lucide-react";
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

type Feeding = { id: string; name: string; start: string; species?: string };
declare global {
  interface Window {
    parkSchedule: {
      state: string; edition?: string; load(): Promise<void>; today(): string;
      nextFor(date: string): { events: Feeding[]; active: boolean };
    };
    parkGuide: { speciesPhoto(slug: string): string | undefined };
  }
}

const raccoon = {
  title: "Енот-полоскун", caption: "Казачны мір, вольер № 54", photo: "assets/raccoon.webp",
  action: "Открыть карточку", route: "species/enot-poloskun",
};
const bison = {
  title: "Зубр европейский", caption: "Лясныя таямніцы, вольер № 11", photo: "assets/bison.webp",
  action: "Найти на схеме", route: "zone2/11",
};

function ParkFeature({ inside }: { inside: boolean }) {
  const [, refresh] = useState(0);
  useEffect(() => {
    if (!inside) return;
    const visible = () => !document.hidden && document.getElementById("park")?.classList.contains("current");
    const update = () => { if (visible()) refresh(value => value + 1); };
    const onEntry = () => {
      if (!visible()) return;
      update();
      void window.parkSchedule.load();
    };
    document.addEventListener("parkprogrammechange", update);
    document.addEventListener("parkcatalogready", update);
    document.addEventListener("conceptscreen", onEntry);
    document.addEventListener("visibilitychange", onEntry);
    onEntry();
    const timer = window.setInterval(update, 30_000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("parkprogrammechange", update);
      document.removeEventListener("parkcatalogready", update);
      document.removeEventListener("conceptscreen", onEntry);
      document.removeEventListener("visibilitychange", onEntry);
    };
  }, [inside]);

  const schedule = window.parkSchedule;
  const date = schedule.today();
  const next = inside && schedule.edition && schedule.state !== "error" ? schedule.nextFor(date) : undefined;
  const event = next?.events[0];
  const story = event ? {
    title: event.name, caption: (next?.active ? "Кормление по расписанию с " : "Кормление по расписанию в ") + event.start,
    photo: event.species ? window.parkGuide.speciesPhoto(event.species) : undefined,
    action: "Открыть кормление", route: "feed/" + event.id + "/" + date,
  } : inside ? bison : raccoon;
  return <a className="park-feature" href={"#" + story.route} data-go={story.route}
    aria-label={[story.title, story.caption, story.action].join(". ")}>
    {story.photo && <img className="park-feature-photo" src={story.photo} alt="" />}
    {!story.photo && event && <time className="park-feature-time">{event.start}</time>}
    <span className="park-feature-caption"><strong>{story.title}</strong>
      <span>{!story.photo && event ? "Кормление по расписанию" : story.caption}</span>
    </span>
    <span className="park-feature-open" aria-hidden="true"><ArrowUpRight size={21} /></span>
  </a>;
}

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
    <ParkFeature inside={inside} />
    <MenuVertical menuItems={inside ? duringVisit : beforeVisit} color="var(--zk-cta)" />
  </>;
}

const host = document.getElementById("parkMenu");
if (host) createRoot(host).render(<ParkMenu />);
