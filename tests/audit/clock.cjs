// Freeze application business time; timers and process uptime remain real.
const OriginalDate=Date;
const instant=OriginalDate.parse(process.env.PW_AUDIT_INSTANT||'2026-11-09T12:00:00Z');
global.Date=class extends OriginalDate {
  constructor(...args){super(...(args.length?args:[instant]));}
  static now(){return instant;}
};
