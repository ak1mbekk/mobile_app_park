import { createRoot } from "react-dom/client";
import { SlideTabs } from "./components/ui/slide-tabs";

const host = document.querySelector<HTMLElement>(".slide-tabs-motion");
const navigation = host?.closest<HTMLElement>(".slide-tabs");
if (host && navigation) createRoot(host).render(<SlideTabs navigation={navigation} />);
