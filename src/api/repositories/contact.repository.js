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

export default {
  toggleAttendance,
};
