import { Contact } from '../models/index.js';

const toggleAttendance = async ({ contact_id }) => {
  try {
    const contact = await Contact.findByPk(contact_id);

    if (!contact) {
      throw new Error('Contact not found');
    }

    contact.is_being_attended = !contact.is_being_attended;
    await contact.save();

    return {
      id: contact.id,
      is_being_attended: contact.is_being_attended,
    };
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

// Set explicit (no toggle) — usado quando Luma envia mensagem/template pelo
// painel: o ato de envio força is_being_attended=true, evitando que a Lattinha
// (bot) responda a próxima inbound do tutor.
const setAttendance = async ({ contact_id, is_being_attended }) => {
  try {
    const contact = await Contact.findByPk(contact_id);

    if (!contact) {
      throw new Error('Contact not found');
    }

    contact.is_being_attended = !!is_being_attended;
    await contact.save();

    return {
      id: contact.id,
      is_being_attended: contact.is_being_attended,
    };
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

export default {
  toggleAttendance,
  setAttendance,
};
