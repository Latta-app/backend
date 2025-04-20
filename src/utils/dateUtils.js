import { DateTime } from 'luxon';

const getNowDate = ({ format, timezone = 'America/Sao_Paulo' }) =>
  DateTime.local()
    .setZone(timezone)
    .toFormat(format);

const getTwoHoursAgoDate = ({ format, timezone = 'America/Sao_Paulo' }) =>
  DateTime.local()
    .minus({ hours: 2 })
    .setZone(timezone)
    .toFormat(format);

const getNowTime = ({ timezone = 'America/Sao_Paulo' }) => {
  const dateTime = DateTime.local().setZone(timezone);

  return {
    date: dateTime,
    weekday: dateTime.weekday,
    hour: dateTime.hour,
    minute: dateTime.minute,
    second: dateTime.second,
  };
};

const getUTCNowDate = ({ format }) =>
  DateTime.local()
    .toUTC()
    .toFormat(format);

const getNowDateMinus = ({ format, duration, toType = 'toFormat' }) =>
  DateTime.local()
    .minus(duration)
    [toType](format);

const getNowDatePlus = ({ format, duration, toType = 'toFormat' }) =>
  DateTime.local()
    .plus(duration)
    [toType](format);

const getDateFromISO = (isoString) => {
  return DateTime.fromISO(isoString, { zone: 'utc' })
    .setZone('America/Sao_Paulo', { keepLocalTime: true })
    .startOf('day');
};

const datePlus = ({ fromFormat, toFormat, fromType = 'fromFormat', date, duration }) =>
  DateTime[fromType](date, fromFormat)
    .plus(duration)
    .toFormat(toFormat);

const dateMinus = ({ fromFormat, toFormat, fromType = 'fromFormat', date, duration }) =>
  DateTime[fromType](date, fromFormat)
    .minus(duration)
    .toFormat(toFormat);

const weekdayDatePlus = ({ fromFormat, toFormat, fromType = 'fromFormat', date, daysDuration }) => {
  let dt = DateTime[fromType](date, fromFormat);

  let leftDuration = daysDuration;

  while (leftDuration > 0) {
    dt = dt.plus({ days: 1 });
    if (dt.weekday === 6 || dt.weekday === 7) dt = dt.plus({ days: 2 });
    leftDuration -= 1;
  }

  return dt.toFormat(toFormat);
};

const weekdayDateMinus = ({
  fromFormat,
  toFormat,
  fromType = 'fromFormat',
  date,
  daysDuration,
}) => {
  let dt = DateTime[fromType](date, fromFormat);

  let leftDuration = daysDuration;

  while (leftDuration > 0) {
    dt = dt.minus({ days: 1 });
    if (dt.weekday === 6 || dt.weekday === 7) dt = dt.minus({ days: 2 });
    leftDuration -= 1;
  }

  return dt.toFormat(toFormat);
};

const getStartOfMonth = (date) =>
  DateTime.fromFormat(date, 'yyyy-LL-dd')
    .startOf('month')
    .toFormat('yyyy-MM-dd');

const getEndOfMonth = (date) =>
  DateTime.fromFormat(date, 'yyyy-LL-dd')
    .endOf('month')
    .toFormat('yyyy-MM-dd');

const firstDayOfThisMonth = () => DateTime.local().startOf('month');
const lastDayOfThisMonth = () => DateTime.local().endOf('month');

const formatDate = ({ fromFormat, toFormat, fromType = 'fromFormat', date }) =>
  DateTime[fromType](date, fromFormat)
    .setLocale('pt-BR')
    .toFormat(toFormat);

const formatDateWithTimezone = ({
  fromFormat,
  toFormat,
  fromType = 'fromFormat',
  timezone = 'America/Sao_Paulo',
  locale = 'pt-BR',
  date,
}) =>
  DateTime[fromType](date, fromFormat)
    .setZone(timezone)
    .setLocale(locale)
    .toFormat(toFormat);

const formatTimestamp = ({ timestamp, toFormat, timezone = 'America/Sao_Paulo' }) =>
  DateTime.fromSeconds(timestamp, { zone: timezone }).toFormat(toFormat);

const formatToMonth = (date) =>
  DateTime.fromFormat(date, 'yyyy-LL-dd')
    .setLocale('pt-br')
    .toFormat('MMM/yy')
    .replace('.', '');

const getDateDiff = ({ date1, date2, fromFormat, fromType = 'fromFormat', unit }) =>
  DateTime[fromType](date1, fromFormat)
    .diff(DateTime[fromType](date2, fromFormat), unit)
    .toObject()[unit];

const getNumberOfDays = (startDateTime, endOfMonthDateTime, finalEndDateTime) =>
  finalEndDateTime > endOfMonthDateTime
    ? Math.ceil(endOfMonthDateTime.diff(startDateTime, 'days').days)
    : Math.ceil(finalEndDateTime.diff(startDateTime, 'days').days);

const getAllMonthsBetweenDates = (startDate, endDate) => {
  let startDateTime = DateTime.fromISO(startDate);
  let endOfMonthDateTime = startDateTime.endOf('month');
  const endDateTime = DateTime.fromISO(endDate);
  const arrayOfDates = [];

  while (startDateTime <= endDateTime) {
    arrayOfDates.push({
      formatted: startDateTime
        .setLocale('pt-br')
        .toFormat('MMM/yy')
        .replace('.', ''),
      year: startDateTime.year,
      month: {
        start: startDateTime.startOf('month').toFormat('yyyy-MM-dd'),
        end: endOfMonthDateTime.toFormat('yyyy-MM-dd'),
        monthNumber: startDateTime.month,
        name: startDateTime
          .setLocale('pt-br')
          .toFormat('MMM')
          .replace('.', ''),
        numberOfDays: getNumberOfDays(startDateTime, endOfMonthDateTime, endDateTime),
      },
    });
    startDateTime = startDateTime.plus({ month: 1 }).startOf('month');
    endOfMonthDateTime = startDateTime.endOf('month');
  }

  return arrayOfDates;
};

const getLast12MonthsBetweenDates = (startDate, endDate, lastInsurerUseDate) => {
  // Pega todos os meses entre duas datas.
  // Se tiver mais de 12 meses entre as data, pega os 12 meses mais recentes
  const startDateTime = DateTime.fromISO(startDate);
  const endDateTime = DateTime.fromISO(endDate);
  const lastInsurerUseDateTime = DateTime.fromISO(lastInsurerUseDate);

  if (lastInsurerUseDate && lastInsurerUseDateTime < startDateTime) return [];

  const choosedEndDate =
    endDateTime > lastInsurerUseDateTime ? lastInsurerUseDateTime : endDateTime;

  const arrayOfDates = getAllMonthsBetweenDates(startDateTime, choosedEndDate);

  const totalMonthsToGet = arrayOfDates.length > 12 ? 12 : arrayOfDates.length;

  const months = arrayOfDates.slice(Math.max(arrayOfDates.length - totalMonthsToGet, 0));

  return months;
};

const getLast12MonthsMedicalAppointments = (medicalAppointments, lastInsurerUseDate) => {
  const lastDate = DateTime.fromISO(lastInsurerUseDate);
  let lastDateMinusOneYear = lastDate.minus({ months: 11 });

  const lastMedicalAppointments = [];

  while (lastDateMinusOneYear <= lastDate) {
    const thisDate = lastDateMinusOneYear;
    lastMedicalAppointments.push({
      month: thisDate.setLocale('pt-br').toFormat('MMM'),
      monthNumber: thisDate.month,
      year: thisDate.year,
      totalUses: medicalAppointments.filter(
        (use) => use.utilizationMonth === thisDate.month && use.utilizationYear === thisDate.year,
      ).length,
    });
    lastDateMinusOneYear = lastDateMinusOneYear.plus({ month: 1 });
  }

  return lastMedicalAppointments;
};

const fillArrayOfDates = ({ arrayOfDataWithDates, objectToFill, arrayOfAllDates }) => {
  const arrayFilled = arrayOfAllDates.map((date) => {
    const objectFound = arrayOfDataWithDates.find(
      (object) => object.year === date.year && object.month === date.month.monthNumber,
    );

    if (objectFound) return { ...objectFound, ...date };

    return {
      ...date,
      ...objectToFill,
    };
  });

  return arrayFilled;
};

const validateDateFormat = ({ date, fromFormat }) => {
  const parsedDate = DateTime.fromFormat(date, fromFormat);

  if (parsedDate.isValid) {
    return true;
  }
  return false;
};

const validateFinalDateBiggerThanInitialDate = ({
  initialDate,
  finalDate,
  dateFormat = 'yyyy-MM-dd',
}) => {
  const initialDateIsValid = validateDateFormat({ date: initialDate, fromFormat: dateFormat });
  const finalDateIsValid = validateDateFormat({ date: finalDate, fromFormat: dateFormat });

  if (!initialDateIsValid || !finalDateIsValid) {
    return { error: true, message: 'Data em formato inválido' };
  }

  if (initialDate > finalDate) {
    return { error: true, message: 'Data inicial maior que data final' };
  }

  return { error: false };
};

export default {
  weekdayDatePlus,
  weekdayDateMinus,
  getNowDate,
  getTwoHoursAgoDate,
  getNowTime,
  getUTCNowDate,
  getNowDateMinus,
  getNowDatePlus,
  datePlus,
  dateMinus,
  getDateFromISO,
  firstDayOfThisMonth,
  lastDayOfThisMonth,
  getStartOfMonth,
  getEndOfMonth,
  formatDate,
  formatDateWithTimezone,
  formatTimestamp,
  getDateDiff,
  getAllMonthsBetweenDates,
  getLast12MonthsBetweenDates,
  getLast12MonthsMedicalAppointments,
  fillArrayOfDates,
  formatToMonth,
  validateDateFormat,
  validateFinalDateBiggerThanInitialDate,
};
