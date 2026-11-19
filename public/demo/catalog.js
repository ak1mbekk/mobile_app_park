(() => {
  function mountCatalog() {
    const section = document.getElementById("animals");
    if (!section) return;
    const search = section.querySelector("#animalSearch");
    const empty = section.querySelector("#animalEmpty");
    const reset = section.querySelector("#animalReset");
    const normalize = value => value.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[^а-яa-z0-9]+/g, " ").trim();
    const entries = Array.from(section.querySelectorAll(".animalcard"), card => ({
      card,
      keywords: normalize(Array.from(card.querySelectorAll("small, b"), node => node.textContent).join(" "))
    }));
    function filter() {
      const words = normalize(search.value).split(" ").filter(Boolean);
      let found = 0;
      for (const {card, keywords} of entries) {
        card.hidden = !words.every(word => keywords.includes(word));
        if (!card.hidden) found++;
      }
      empty.hidden = found !== 0;
    }
    search.addEventListener("input", filter);
    reset.addEventListener("click", () => {
      search.value = "";
      filter();
      search.focus();
    });
    filter();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountCatalog, {once: true});
  else mountCatalog();
})();
