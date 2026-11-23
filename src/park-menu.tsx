import { createRoot } from "react-dom/client";
import { ArrowRight, Binoculars, CalendarDays, Info, MapPin, PawPrint, Route, Ticket, type LucideIcon } from "lucide-react";
import "./park-landing.css";

type Destination = { label: string; href: string; icon: LucideIcon };
const tickets = { label: "Купить билеты", href: "https://animal-park.by/tickets/stranicza-biletov.html?clear_date=1", icon: Ticket };
const map = { label: "Карта парка", href: "#map", icon: MapPin };
const feeding = { label: "Календарь кормлений", href: "#feed", icon: CalendarDays };
const animals = { label: "Животные", href: "#animals", icon: PawPrint };
const tours = { label: "Экскурсии", href: "#tours", icon: Binoculars };
const directions = { label: "Как добраться", href: "#directions", icon: Route };
const visitor = { label: "Для посетителей", href: "#visitor", icon: Info };
const shortcuts = [animals, tours, feeding, directions, visitor];

function ParkLink({ item, action = "" }: {item: Destination; action?: string}) {
  const local = item.href.startsWith("#");
  const Icon = item.icon;
  return <a href={item.href} data-go={local ? item.href.slice(1) : undefined}
    className={action ? "park-action " + action : "park-shortcut"}
    target={local ? undefined : "_blank"} rel={local ? undefined : "noopener noreferrer"}>
    <Icon aria-hidden="true" /><span>{item.label}</span>{action && <ArrowRight className="action-arrow" aria-hidden="true" />}
  </a>;
}

function ParkMenu() {
  return <div className="park-layout">
    <div className="park-intro">
      <header className="park-welcome">
        <img className="park-hero-art" src="assets/park-richi-welcome.webp" width="1100" height="733" alt="" fetchPriority="high" />
        <div className="park-hello">
          <h1 id="park-welcome-title">Привет!<br />Я Ричи!</h1>
          <p>Проведу тебя по парку и познакомлю с его обитателями.</p>
        </div>
      </header>
      <nav className="park-visit-actions" aria-label="Посещение парка">
        <ParkLink item={tickets} action="park-action-primary" />
        <ParkLink item={map} action="park-action-secondary" />
      </nav>
    </div>
    <div className="park-directory">
      <nav className="park-shortcuts" aria-label="Разделы парка">
        {shortcuts.map(item => <ParkLink key={item.href} item={item} />)}
      </nav>
      <a href="#richi" data-go="richi" className="park-game-banner">
        <img src="assets/richi-trail-banner.webp" width="132" height="100" alt="" />
        <span><strong>Играй с Ричи</strong><small>Расти вместе с енотом и собирай награды.</small></span>
        <ArrowRight aria-hidden="true" />
      </a>
    </div>
    <address className="park-locality">Республика Беларусь, г. Барановичи</address>
  </div>;
}

const host = document.getElementById("parkMenu");
if (host) createRoot(host).render(<ParkMenu />);
