import type { PlanInput } from '../../supabase/functions/_shared/prompt.ts';

export interface Fixture {
  name: string;
  /** What this case is testing. Printed in the report so a failure is self-explaining. */
  probe: string;
  input: PlanInput;
}

export const fixtures: Fixture[] = [
  {
    // Blueprint step 1 says to run this on a real week. Replace the goals and
    // derailers below with your actual ones before trusting the gate.
    name: 'real-week',
    probe: 'The honest baseline. Is this a day you would actually work?',
    input: {
      today: '2026-08-12',
      weekday: 'Wednesday',
      goals: [
        'ship Sidq to a first paying stranger',
        'build in public consistently, post 3x a week',
        'keep the freelance client happy so I have runway',
        'get back to lifting 3x a week',
      ],
      workRhythm: 'night',
      derailers: 'I redesign things that already work instead of shipping them',
      carriedOver: [
        { title: 'Set up Stripe checkout', carryCount: 1 },
        { title: 'Write the launch post', carryCount: 2 },
      ],
      calendar: [{ start: '11:00', end: '11:30', title: 'client standup' }],
    },
  },
  {
    name: 'overloaded',
    probe: 'Does it defer instead of listing everything? Note must name what was cut.',
    input: {
      today: '2026-08-13',
      weekday: 'Thursday',
      goals: [
        'finish my thesis',
        'launch my SaaS',
        'learn Rust',
        'get a job',
        'move apartments',
        'fix my sleep schedule',
        'start a podcast',
        'read 2 books a month',
        'redo my portfolio site',
      ],
      workRhythm: 'morning',
      derailers: 'everything feels equally urgent so I do none of it',
      carriedOver: [],
      calendar: [],
    },
  },
  {
    name: 'carryover-rot',
    probe: 'A task carried 4x must be shrunk or dropped, never reprinted as-is.',
    input: {
      today: '2026-08-14',
      weekday: 'Friday',
      goals: ['submit the grant application', 'keep the lab notebook current'],
      workRhythm: 'afternoon',
      derailers: 'perfectionism, I rewrite the same paragraph for hours',
      carriedOver: [
        { title: 'Write the grant application', carryCount: 4 },
        { title: 'Update lab notebook', carryCount: 1 },
      ],
      calendar: [],
    },
  },
  {
    name: 'vague-goals',
    probe: 'Abstract goals must become physical first moves, not restated.',
    input: {
      today: '2026-08-15',
      weekday: 'Saturday',
      goals: ['get my life together', 'be more creative', 'stop procrastinating'],
      workRhythm: "it's chaos",
      derailers: 'no idea where to start',
      carriedOver: [],
      calendar: [],
    },
  },
  {
    name: 'first-run',
    probe: 'Cold start from intake only. Must still be concrete and light.',
    input: {
      today: '2026-08-16',
      weekday: 'Sunday',
      goals: ['study for the bar exam in November'],
      workRhythm: 'morning',
      derailers: 'my phone',
      carriedOver: [],
      calendar: [],
    },
  },
  {
    name: 'heavy-calendar',
    probe: 'Meetings eat capacity. Total minutes must drop and gaps must be respected.',
    input: {
      today: '2026-08-17',
      weekday: 'Monday',
      goals: ['ship the Q3 roadmap', 'hire a second engineer'],
      workRhythm: 'morning',
      derailers: 'context switching between meetings',
      carriedOver: [{ title: 'Review the roadmap doc', carryCount: 0 }],
      calendar: [
        { start: '09:00', end: '10:00', title: 'standup' },
        { start: '10:30', end: '11:00', title: '1:1 with Sam' },
        { start: '13:00', end: '14:30', title: 'planning' },
        { start: '15:00', end: '16:00', title: 'candidate interview' },
      ],
    },
  },
  {
    name: 'night-owl',
    probe: 'Mechanical work should sit in the trough, demanding work near the peak.',
    input: {
      today: '2026-08-18',
      weekday: 'Tuesday',
      goals: ['finish the album mix', 'answer the backlog of label emails'],
      workRhythm: 'night',
      derailers: 'email pulls me out of creative work and I never get back in',
      carriedOver: [],
      calendar: [],
    },
  },
  {
    // The calibration engine's whole purpose, exercised end to end. If the model
    // ignores this block, day 30 is no better than day 1 and there is no moat.
    name: 'calibrated-veteran',
    probe: 'Must obey measured history over stated preference. No 90s, plan near 95 min.',
    input: {
      today: '2026-08-20',
      weekday: 'Thursday',
      goals: ['finish the Q3 report', 'get the new hire onboarded', 'clear the design backlog'],
      workRhythm: 'morning',
      derailers: 'meetings chop up my day',
      carriedOver: [{ title: 'Draft the Q3 report intro', carryCount: 1 }],
      calendar: [],
      calibration: [
        'observed over 24 closed days, 91 tasks (confidence: high):',
        '- finishes 61% of what you give them',
        '- actually completes about 95 minutes on a working day',
        '- you have been planning 190 minutes. That is too much for them. Plan closer to 95.',
        '- completion by block size: 15min 88%, 25min 79%, 45min 44%, 90min 9%',
        '- 15 minute blocks work best for them. Favour that size.',
        '- they abandon 90 minute blocks. Do not use these sizes.',
        '- they actually finish work around 21:00, 22:00',
        '- tasks starting with send, fix get done',
        '- tasks starting with organise, review get abandoned. Phrase differently.',
      ].join('\n'),
    },
  },
  {
    name: 'empty-goals',
    probe: 'Degenerate input. Must not crash and must not invent a life for them.',
    input: {
      today: '2026-08-19',
      weekday: 'Wednesday',
      goals: [],
      workRhythm: null,
      derailers: null,
      carriedOver: [],
      calendar: [],
    },
  },
];
