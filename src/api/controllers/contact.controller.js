import ContactService from '../services/contact.service.js';

const toggleAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        code: 'MISSING_CONTACT_ID',
        message: 'contact_id is required',
      });
    }

    const result = await ContactService.toggleAttendance({ contact_id: id });

    return res.status(200).json({
      code: 'ATTENDANCE_TOGGLED',
      data: result,
    });
  } catch (error) {
    console.error('Error toggling attendance:', error);
    return res.status(500).json({
      code: 'ATTENDANCE_TOGGLE_ERROR',
      message: error.message,
    });
  }
};

export default {
  toggleAttendance,
};
