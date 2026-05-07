import ContactRepository from '../repositories/contact.repository.js';

const toggleAttendance = async ({ contact_id }) => {
  try {
    const result = await ContactRepository.toggleAttendance({ contact_id });
    return result;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const setAttendance = async ({ contact_id, is_being_attended }) => {
  try {
    const result = await ContactRepository.setAttendance({ contact_id, is_being_attended });
    return result;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const setResponsibility = async ({ contact_id, user_id, path }) => {
  try {
    return await ContactRepository.setResponsibility({ contact_id, user_id, path });
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

export default {
  toggleAttendance,
  setAttendance,
  setResponsibility,
};
