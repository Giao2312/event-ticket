import mongoose from 'mongoose';
import slugify from 'slugify';
import Event from '../models/event.models.js';
import EventSeat from '../models/eventSeat.models.js';

export const CATEGORY_MAP = {
  'am-nhac': 'âm nhạc',
  'am-thuc': 'ẩm thực',
  'cong-nghe': 'công nghệ',
  'giai-tri': 'giải trí',
  'kinh-doanh': 'kinh doanh',
  'nghe-thuat': 'nghệ thuật',
  'the-thao': 'thể thao',
  workshop: 'workshop',
  khac: 'khác'
};

export const CATEGORY_OPTIONS = [
  { name: CATEGORY_MAP['am-nhac'], slug: 'am-nhac', icon: 'fa-music' },
  { name: CATEGORY_MAP['am-thuc'], slug: 'am-thuc', icon: 'fa-utensils' },
  { name: CATEGORY_MAP['cong-nghe'], slug: 'cong-nghe', icon: 'fa-robot' },
  { name: CATEGORY_MAP['giai-tri'], slug: 'giai-tri', icon: 'fa-grin-stars' },
  { name: CATEGORY_MAP['kinh-doanh'], slug: 'kinh-doanh', icon: 'fa-briefcase' },
  { name: CATEGORY_MAP['nghe-thuat'], slug: 'nghe-thuat', icon: 'fa-palette' },
  { name: CATEGORY_MAP['the-thao'], slug: 'the-thao', icon: 'fa-running' },
  { name: CATEGORY_MAP.workshop, slug: 'workshop', icon: 'fa-graduation-cap' },
  { name: CATEGORY_MAP.khac, slug: 'khac', icon: 'fa-ellipsis-h' }
];

export const RESERVED_SEATING = 'reserved_seating';

export const createEventError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const normalizeWhitespace = (value = '') => String(value || '').trim().replace(/\s+/g, ' ');

export const toSlugLike = (value = '') =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');

const toPositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const buildDateTime = (dateValue, timeValue = '') => {
  if (!dateValue) return null;
  const normalizedTime = timeValue || '00:00';
  const date = new Date(`${dateValue}T${normalizedTime}`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildEventLocation = (body) => {
  if (body.eventMode === 'online') {
    return normalizeWhitespace(body.onlineLink) || 'Trực tuyến';
  }

  return [
    normalizeWhitespace(body.venueName),
    normalizeWhitespace(body.street),
    normalizeWhitespace(body.ward),
    normalizeWhitespace(body.city)
  ]
    .filter(Boolean)
    .join(', ');
};

const resolveCategoryValue = (value = '') => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return CATEGORY_MAP.khac;

  const slug = toSlugLike(normalized);
  return CATEGORY_MAP[slug] || normalized.toLowerCase();
};

const normalizeTickets = (input) => {
  if (!input) return [];
  const list = Array.isArray(input) ? input : Object.values(input);

  return list
    .map((ticket) => ({
      type: normalizeWhitespace(ticket?.type),
      price: Number(ticket?.price),
      quantity: toPositiveInt(ticket?.quantity),
      maxPerUser: toPositiveInt(ticket?.maxPerUser) || 5
    }))
    .filter(
      (ticket) =>
        ticket.type &&
        Number.isFinite(ticket.price) &&
        ticket.price >= 0 &&
        ticket.quantity > 0
    );
};

const normalizeLegacyTickets = (ticketTypeJson) => {
  if (!ticketTypeJson) return [];
  let parsedTicketTypes = [];

  try {
    parsedTicketTypes = typeof ticketTypeJson === 'string' ? JSON.parse(ticketTypeJson) : ticketTypeJson;
  } catch (err) {
    throw createEventError('TicketType không đúng định dạng JSON');
  }

  return normalizeTickets(parsedTicketTypes);
};

const normalizeRowLabel = (rowIndex, rowLabelType) => {
  if (rowLabelType === 'numbers') return String(rowIndex + 1);

  let label = '';
  let current = rowIndex;
  do {
    label = String.fromCharCode(65 + (current % 26)) + label;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return label;
};

const normalizeSeatSections = (input) => {
  if (!input) return [];
  const list = Array.isArray(input) ? input : Object.values(input);

  return list
    .map((section) => ({
      name: normalizeWhitespace(section?.name),
      code: normalizeWhitespace(section?.code),
      ticketTypeName: normalizeWhitespace(section?.ticketTypeName),
      rows: toPositiveInt(section?.rows),
      seatsPerRow: toPositiveInt(section?.seatsPerRow),
      rowLabelType: section?.rowLabelType === 'numbers' ? 'numbers' : 'letters'
    }))
    .filter(
      (section) =>
        section.name &&
        section.ticketTypeName &&
        section.rows > 0 &&
        section.seatsPerRow > 0
    );
};

const buildSeatConfiguration = (seatSectionsInput, ticketTypes, ticketingMode) => {
  if (ticketingMode !== RESERVED_SEATING) {
    return {
      seating: {
        enabled: false,
        mode: 'general_admission',
        sections: [],
        totalSeats: 0
      },
      seatDocuments: []
    };
  }

  const sections = normalizeSeatSections(seatSectionsInput);
  if (!sections.length) {
    throw createEventError('Sự kiện có ghế ngồi cần ít nhất một phân khu ghế.');
  }

  const usageByTicketType = new Map(ticketTypes.map((ticket) => [ticket.type.toLowerCase(), 0]));
  const usedCodes = new Set();
  const normalizedSections = [];
  const seatDocuments = [];

  sections.forEach((section, sectionIndex) => {
    const matchedTicketType = ticketTypes.find(
      (ticket) => ticket.type.toLowerCase() === section.ticketTypeName.toLowerCase()
    );

    if (!matchedTicketType) {
      throw createEventError(`Không tìm thấy hạng vé "${section.ticketTypeName}" cho phân khu ${section.name}.`);
    }

    const sectionCode = (
      section.code ||
      slugify(section.name, { lower: false, strict: true }).slice(0, 8) ||
      `Z${sectionIndex + 1}`
    ).toUpperCase();

    if (usedCodes.has(sectionCode)) {
      throw createEventError(`Mã phân khu ${sectionCode} đang bị trùng.`);
    }
    usedCodes.add(sectionCode);

    const seatCount = section.rows * section.seatsPerRow;
    usageByTicketType.set(
      matchedTicketType.type.toLowerCase(),
      (usageByTicketType.get(matchedTicketType.type.toLowerCase()) || 0) + seatCount
    );

    normalizedSections.push({
      name: section.name,
      code: sectionCode,
      ticketTypeId: matchedTicketType._id,
      ticketTypeName: matchedTicketType.type,
      rows: section.rows,
      seatsPerRow: section.seatsPerRow,
      rowLabelType: section.rowLabelType,
      seatCount
    });

    for (let rowIndex = 0; rowIndex < section.rows; rowIndex += 1) {
      const rowLabel = normalizeRowLabel(rowIndex, section.rowLabelType);
      for (let seatIndex = 0; seatIndex < section.seatsPerRow; seatIndex += 1) {
        const seatNumber = seatIndex + 1;
        const seatLabel = `${sectionCode}-${rowLabel}${seatNumber}`;
        seatDocuments.push({
          ticketTypeId: matchedTicketType._id,
          ticketTypeName: matchedTicketType.type,
          sectionName: section.name,
          sectionCode,
          rowLabel,
          seatNumber,
          seatLabel,
          seatKey: seatLabel,
          rowIndex,
          seatIndex
        });
      }
    }
  });

  ticketTypes.forEach((ticketType) => {
    const assignedSeats = usageByTicketType.get(ticketType.type.toLowerCase()) || 0;
    if (assignedSeats !== ticketType.quantity) {
      throw createEventError(
        `Hạng vé "${ticketType.type}" có ${ticketType.quantity} vé nhưng sơ đồ ghế đang gán ${assignedSeats} chỗ.`
      );
    }
  });

  return {
    seating: {
      enabled: true,
      mode: RESERVED_SEATING,
      sections: normalizedSections,
      totalSeats: seatDocuments.length
    },
    seatDocuments
  };
};

const resolveCoverImage = (files = {}, file = null) => {
  const coverFile = files?.coverImage?.[0] || file || null;
  return coverFile ? `/events/images/${coverFile.filename}` : '';
};

// ─── Status canonicalization ─────────────────────────────────────────────────

/**
 * Canonicalize event status based on event date and current status.
 * This is the SINGLE SOURCE OF TRUTH for status transitions.
 *
 * Rules:
 *   - date < now                          → 'ended'
 *   - status is 'published'/'approved'
 *     - date <= now + 24h                  → 'ongoing'
 *     - otherwise                          → 'upcoming'
 *   - status is 'rejected'/'cancelled'     → keep as-is (terminal states)
 *   - otherwise                            → keep current status
 */
export const canonicalizeEventStatus = (event) => {
  const now = new Date();
  const eventDate = new Date(event.date);

  if (eventDate < now) {
    event.status = 'ended';
    return event;
  }

  if (event.status === 'published' || event.status === 'approved') {
    const threshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (eventDate <= threshold) {
      event.status = 'ongoing';
    } else {
      event.status = 'upcoming';
    }
    return event;
  }

  // Terminal states: rejected, cancelled, draft, pending, upcoming, ongoing, ended
  // Keep as-is — only canonicalize published/approved
  return event;
};

// ─── Create ──────────────────────────────────────────────────────────────────

export const createUnifiedEvent = async ({
  body,
  organizerId,
  status = 'pending',
  files = null,
  file = null
}) => {
  const name = normalizeWhitespace(body.name);
  const description = normalizeWhitespace(body.description);
  if (!name || name.length < 5) {
    throw createEventError('Tên sự kiện tối thiểu 5 ký tự.');
  }

  const ticketTypes = body.tickets ? normalizeTickets(body.tickets) : normalizeLegacyTickets(body.TicketType);
  if (!ticketTypes.length) {
    throw createEventError('Cần khai báo ít nhất một hạng vé hợp lệ.');
  }

  const usesUnifiedForm = Boolean(body.dateStart || body.eventMode || body.tickets);
  const startDate = usesUnifiedForm
    ? buildDateTime(body.dateStart, body.timeStart)
    : buildDateTime(body.date || body.dateStart, body.timeStart);
  const endDate = usesUnifiedForm
    ? buildDateTime(body.dateEnd || body.dateStart, body.timeEnd || body.timeStart)
    : null;

  if (!startDate) {
    throw createEventError('Không thể xác định thời gian bắt đầu sự kiện.');
  }

  const location = normalizeWhitespace(body.location) || buildEventLocation(body);
  if (!location) {
    throw createEventError('Vui lòng khai báo địa điểm hoặc link sự kiện.');
  }

  const ticketingMode =
    body.ticketingMode === RESERVED_SEATING ? RESERVED_SEATING : 'general_admission';

  // Build seating config first so we can attach _id to ticketTypes before saving
  const seatingConfig = buildSeatConfiguration(body.seatSections, [], ticketingMode);

  const draftEvent = new Event({
    name,
    description,
    category: resolveCategoryValue(body.category),
    date: startDate,
    endDate: endDate || null,
    location,
    venueName: normalizeWhitespace(body.venueName),
    onlineLink: normalizeWhitespace(body.onlineLink),
    eventMode: body.eventMode === 'online' ? 'online' : 'offline',
    ticketTypes,
    organizer: organizerId,
    status,
    slug: slugify(`${name}-${Date.now()}`, { lower: true, strict: true }),
    image: resolveCoverImage(files, file),
    seating: seatingConfig.seating
  });

  // Attach generated _id references to seat documents before inserting
  const seatDocsWithIds = seatingConfig.seatDocuments.map((seat) => ({
    ...seat,
    eventId: draftEvent._id
  }));

  // Use transaction to ensure atomicity: event + seat documents succeed or fail together.
  // Falls back to non-transactional save if replica set is not available (common in dev).
  let savedEvent;
  const session = await mongoose.startSession();
  let useTransaction = false;
  try {
    session.startTransaction();
    useTransaction = true;
  } catch {
    // Replica set not available — proceed without transaction
    useTransaction = false;
  }

  try {
    if (useTransaction) {
      savedEvent = await draftEvent.save({ session });
      if (seatDocsWithIds.length) {
        await EventSeat.insertMany(seatDocsWithIds, { session });
      }
      canonicalizeEventStatus(savedEvent);
      await savedEvent.save({ session, fields: ['status'] });
      await session.commitTransaction();
    } else {
      savedEvent = await draftEvent.save();
      if (seatDocsWithIds.length) {
        await EventSeat.insertMany(seatDocsWithIds);
      }
      canonicalizeEventStatus(savedEvent);
      await savedEvent.save();
    }
    return savedEvent;
  } catch (err) {
    if (useTransaction) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    if (useTransaction) {
      session.endSession();
    }
  }
};

// ─── Admin lifecycle helpers ─────────────────────────────────────────────────

/**
 * Publish an event (admin approval → public).
 * Sets status to 'published'; canonicalizeEventStatus determines the
 * canonical display status (upcoming/ongoing/ended) after save.
 */
export const publishEvent = async (eventId, adminId, notes = '') => {
  const event = await Event.findById(eventId);
  if (!event) {
    const err = new Error('Không tìm thấy sự kiện');
    err.status = 404;
    throw err;
  }

  if (!['pending', 'rejected'].includes(event.status)) {
    const err = new Error('Chỉ có thể duyệt sự kiện đang chờ duyệt hoặc đã bị từ chối');
    err.status = 400;
    throw err;
  }

  event.status = 'published';
  event.approvedBy = adminId;
  event.approvedAt = new Date();
  event.approvalNotes = notes || 'Đã duyệt bởi Admin';
  event.rejectionReason = undefined;

  const savedEvent = await event.save();

  // Explicit canonicalize so the caller gets the correct status in response
  canonicalizeEventStatus(savedEvent);
  await savedEvent.save();

  return savedEvent;
};

/**
 * Reject an event (admin action).
 * Status stays 'rejected' — canonicalizeEventStatus does NOT override terminal states.
 */
export const rejectEventByAdmin = async (eventId, adminId, reason) => {
  if (!reason) {
    const err = new Error('Vui lòng cung cấp lý do từ chối');
    err.status = 400;
    throw err;
  }

  const event = await Event.findById(eventId);
  if (!event) {
    const err = new Error('Không tìm thấy sự kiện');
    err.status = 404;
    throw err;
  }

  if (event.status !== 'pending') {
    const err = new Error('Sự kiện không hợp lệ hoặc không chờ duyệt');
    err.status = 400;
    throw err;
  }

  event.status = 'rejected';
  event.rejectionReason = reason;

  return event.save();
};
