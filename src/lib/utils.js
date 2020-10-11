import moment from 'moment-timezone';
import {
  SHARE_SITES
} from './enums';


/**
 * Converts Date String with UTC timezone to date consumable by calendar
 * apps. Changes +00:00 to Z.
 * @param {string} Date in YYYYMMDDTHHmmssZ format
 * @returns {string} Date with +00:00 replaceed with Z
 */
export const formatDate = date => date && date.replace('+00:00', 'Z');

export const formatDuration = duration => {
  if (typeof duration === 'string') return duration;
  const parts = duration.toString().split('.');
  if (parts.length < 2) {
    parts.push('00');
  }

  return parts.map(part => part.length === 2 ? part : `0${part}`).join('');
};

/**
 * Tests provided UserAgent against Known Mobile User Agents
 * @returns {bool} isMobileDevice
 */
export const isMobile = () => /Mobile|iP(hone|od|ad)|Android|BlackBerry|IEMobile/.test(window.navigator.userAgent || window.navigator.vendor || window.opera);

/**
 * Tests userAgent to see if browser is IE
 * @returns {bool} isInternetExplorer
 */
export const isInternetExplorer = () => /MSIE/.test(window.navigator.userAgent) || /Trident/.test(window.navigator.userAgent);

export const escapeICSDescription = description => description.replace(/(\r?\n|<br ?\/?>)/g, '\\n');

/**
 * Takes an event object and returns a Google Calendar Event URL
 * @param {string} event.description
 * @param {string} event.endDatetime
 * @param {string} event.location
 * @param {string} event.startDatetime
 * @param {string} event.title
 * @returns {string} Google Calendar Event URL
 */
const googleShareUrl = ({
    description,
    endDatetime,
    location,
    startDatetime,
    timezone,
    title,
  }) =>
  `https://calendar.google.com/calendar/render?action=TEMPLATE&dates=${
    startDatetime
  }/${endDatetime}${timezone && `&ctz=${timezone}`}&location=${location}&text=${title}&details=${description}`;

/**
 * Takes an event object and returns a Yahoo Calendar Event URL
 * @param {string} event.description
 * @param {string} event.duration
 * @param {string} event.location
 * @param {string} event.startDatetime
 * @param {string} event.title
 * @returns {string} Yahoo Calendar Event URL
 */
const yahooShareUrl = ({
    description,
    duration,
    location,
    startDatetime,
    title,
  }) =>
  `https://calendar.yahoo.com/?v=60&view=d&type=20&title=${title}&st=${
    startDatetime
  }&dur=${duration}&desc=${description}&in_loc=${location}`;

/**
 * Takes an event object and returns an array to be downloaded as ics file
 * @param {string} event.description
 * @param {string} event.endDatetime
 * @param {string} event.location
 * @param {string} event.startDatetime
 * @param {string} event.title
 * @returns {array} ICS Content
 */
const buildShareFile = ({
  description = '',
  ctz = '',
  endDatetime,
  location = '',
  startDatetime,
  timezone = '',
  title = '',
}) => {
  let VTIMEZONEEntries = getVtimezoneFromMomentZone({ timezone, startDatetime, endDatetime });

  let content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    ...VTIMEZONEEntries,
    'BEGIN:VEVENT',
    `URL:${document.URL}`,
    'METHOD:PUBLISH',
    // TODO: Will need to parse the date without Z for ics
    // This means I'll probably have to require a date lib - luxon most likely or datefns
    timezone === '' ? `DTSTART:${startDatetime}` : `DTSTART;TZID=${timezone}:${startDatetime}`,
    timezone === '' ? `DTEND:${endDatetime}` : `DTEND;TZID=${timezone}:${endDatetime}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${escapeICSDescription(description)}`,
    `LOCATION:${location}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');

  return isMobile() ? encodeURI(`data:text/calendar;charset=utf8,${content}`) : content;
}

// E.g. 5 => "05"; 10 => "10"
const padZero = (n) => `${Math.abs(parseInt(n, 10)) < 10 ? "0" : ""}${Math.abs(n)}`;

// E.g. -600 => +1000
export const UTCMinsToUTCOffset = (t) => {
  // We reverse sign when converting to offset
  const sign = t > 0 ? "-" : "+";
  const hrs = Math.abs(Math.floor(t / 60));
  const mins = Math.abs(t) % 60;

  return `${sign}${padZero(hrs)}${padZero(mins)}`;
};

/**
 * Takes a timezone, start and end date and returns VTIMEZONE entries
 * corresponding to DST changes during and around the event. N.B. This
 * is suboptimal for long-spanning or recurring events. For those cases
 * recurrence rules should be applied.
 * @param {string} event.timezone
 * @param {string} event.startDatetime
 * @param {string} event.endDatetime
 */
export const getVtimezoneFromMomentZone = ({
  timezone = "",
  startDatetime,
  endDatetime,
}) => {
  if (timezone === "") return [];

  const zone = moment.tz.zone(timezone);
  const header = `BEGIN:VTIMEZONE\nTZID:${timezone}`;
  const footer = "END:VTIMEZONE";

  // Find the 'until' index which corresponds with the event start.
  // This contains information about the observance which applies when
  // the event starts.
  // See https://momentjs.com/timezone/docs/#/data-formats/unpacked-format/

  // Find index of the observance which precedes the start of the event
  const currentUntil = zone.untils.findIndex(
    (u) => u > moment(startDatetime).unix() * 1000
  );

  // Find 'until' index which applies after the event ends.
  const futureUntil =
    zone.untils.findIndex((u) => u > moment(endDatetime).unix() * 1000) + 1;

  const zTZitems = [];
  // Generate VTIMEZONE entries
  // FIXME: Handle border cases

  for (let i = currentUntil; i < futureUntil + 1; i++) {
    // Determine which mode is starting.
    const observance = (i + 1) % 2 ? "DAYLIGHT" : "STANDARD";
    const tzName = zone.abbrs[i];
    const observanceStartedAt = moment.tz(zone.untils[i - 1], timezone);
    const offsetFrom = UTCMinsToUTCOffset(zone.offsets[i - 1]);
    const offsetTo = UTCMinsToUTCOffset(zone.offsets[i]);

    zTZitems.push(`BEGIN:${observance}
DTSTART:${observanceStartedAt.format("YYYYMMDDTHHmmss")}
TZOFFSETFROM:${offsetFrom}
TZOFFSETTO:${offsetTo}
TZNAME:${tzName}
END:${observance}`);
  }

  return [header, ...zTZitems, footer];
};

/**
 * Takes an event object and a type of URL and returns either a calendar event
 * URL or the contents of an ics file.
 * @param {string} event.description
 * @param {string} event.duration
 * @param {string} event.endDatetime
 * @param {string} event.location
 * @param {string} event.startDatetime
 * @param {string} event.title
 * @param {enum} type One of SHARE_SITES from ./enums
 */
export const buildShareUrl = ({
    description = '',
    duration,
    endDatetime,
    location = '',
    startDatetime,
    timezone = '',
    title = ''
  },
  type,
) => {
  const encodeURI = type !== SHARE_SITES.ICAL && type !== SHARE_SITES.OUTLOOK;

  const data = {
    description: encodeURI ? encodeURIComponent(description) : description,
    duration: formatDuration(duration),
    endDatetime: formatDate(endDatetime),
    location: encodeURI ? encodeURIComponent(location) : location,
    startDatetime: formatDate(startDatetime),
    timezone,
    title: encodeURI ? encodeURIComponent(title) : title,
  };

  switch (type) {
    case SHARE_SITES.GOOGLE:
      return googleShareUrl(data);
    case SHARE_SITES.YAHOO:
      return yahooShareUrl(data);
    default:
      return buildShareFile(data);
  }
};