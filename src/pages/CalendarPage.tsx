export default function CalendarPage() {
  return (
    <iframe
      className="block h-full w-full border-0"
      src={import.meta.env.BASE_URL + 'demo/index.html?layout=calendar#feed'}
      title="Календарь кормлений парка"
    />
  );
}
