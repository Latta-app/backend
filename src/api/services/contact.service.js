import ContactRepository from '../repositories/contact.repository.js';

const toggleAttendance = async ({ contact_id }) => {
  try {
    const result = await ContactRepository.toggleAttendance({ contact_id });
    return result;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

export default {
  toggleAttendance,
};
