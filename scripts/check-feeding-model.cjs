const assert = require('node:assert/strict');
const {test} = require('node:test');
const model = import('../public/demo/feeding-model.js');

test('feeding selection uses park time and preserves the order of simultaneous slots', async () => {
  const {feedingView} = await model;
  const daily = [
    {id:'late',start:'16:00'},
    {id:'first',start:'15:50',end:'16:00'},
    {id:'closed',start:'15:45',status:'cancelled'},
    {id:'parallel',start:'15:50'},
  ];
  const day = '2026-11-27';
  const programme = {daily,byDate:{'2026-11-29':[]}};
  const now = new Date('2026-11-27T12:52:00Z');
  const view = feedingView(programme,day,'all',now);
  assert.equal(view.featured.id,'first');
  assert.equal(view.timing,'active');
  assert.deepEqual(view.remaining.map(event => event.id),['closed','parallel','late']);
  assert.equal(feedingView(programme,day,'closed',now).featured.status,'cancelled');
  assert.equal(feedingView(programme,day,'unknown',now).notice,'missing');
  assert.equal(feedingView(programme,'2026-11-29','all',now).notice,'empty');
  assert.equal(feedingView(programme,day,'all',new Date('2026-11-27T15:00:00Z')).notice,'finished');
  assert.equal(feedingView(programme,'2026-11-28','all',now).timing,'first');
});

test('calendar clamps past dates and handles leap years and month boundaries', async () => {
  const {isCalendarDay, monthView, shiftDay, shiftMonth} = await model;
  assert.ok(!isCalendarDay('2026-02-29'));
  const view = monthView('2028-02-29','2028-02-26','2028-02-27');
  assert.equal(view.days.length,29);
  assert.equal(view.firstColumn,2);
  assert.equal(view.days[0].disabled,true);
  assert.equal(view.days[26].selected,true);
  assert.equal(view.days[28].focused,true);
  assert.equal(shiftMonth('2028-02-01',-1,'2028-02-26'),'2028-02-26');
  assert.equal(shiftDay('2028-02-29',1,'2028-02-26'),'2028-03-01');
  assert.equal(shiftMonth('9999-12-01',1,'2028-02-26'),'9999-12-31');
});

test('feeding photos support older cached arrays and reminders use park time', async () => {
  const {feedingSpecies, calendarReminder} = await model;
  assert.equal(feedingSpecies({species:'karakal'}),'karakal');
  assert.equal(feedingSpecies({species:[null,'karakal']}),'karakal');
  assert.equal(feedingSpecies({zone:1,place:'lake49',id:'storks',species:[]}),'belyij-aist');
  assert.match(
    calendarReminder({id:'feeding',name:'Животные, парк',start:'16:20',end:'16:30'},
      '2026-11-27','Казачны мір',new Date('2026-11-27T12:00:00Z')),
    /DTSTART:20261127T132000Z\r\nDTEND:20261127T133000Z\r\nSUMMARY:Кормление · Животные\\, парк/
  );
});
